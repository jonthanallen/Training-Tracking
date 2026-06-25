import { Router } from "express";
import { stravaFetch } from "../lib/strava";

const router = Router();

// Normalize Strava virtual/alternate sport types into their base type
function normalizeSportType(raw: string): string {
  const t = raw || "Other";
  if (t === "VirtualRide" || t === "EBikeRide" || t === "EMountainBikeRide") return "Ride";
  if (t === "VirtualRun") return "Run";
  return t;
}

router.get("/stats", async (req, res) => {
  try {
    const athlete = await stravaFetch("/athlete") as { id: number };
    const stats = await stravaFetch(`/athletes/${athlete.id}/stats`);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/stats/weekly", async (req, res) => {
  try {
    const weeks = Math.min(Number(req.query.weeks ?? 12), 52);

    // Fetch up to 2 pages (400 activities) to cover dense training over 52 weeks
    const [page1, page2] = await Promise.all([
      stravaFetch("/athlete/activities", { per_page: 200, page: 1 }) as Promise<Array<Record<string, unknown>>>,
      stravaFetch("/athlete/activities", { per_page: 200, page: 2 }) as Promise<Array<Record<string, unknown>>>,
    ]);
    const activities = [...(page1 ?? []), ...(page2 ?? [])];

    const getMondayISO = (date: Date): string => {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1 - day);
      d.setUTCDate(d.getUTCDate() + diff);
      return d.toISOString().split("T")[0];
    };

    // Pre-fill all `weeks` slots with zeros so every week appears even if empty
    const weekMap = new Map<string, { distance: number; moving_time: number; elevation_gain: number; count: number; sport_type: string }>();
    const now = new Date();
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const key = getMondayISO(d);
      weekMap.set(key, { distance: 0, moving_time: 0, elevation_gain: 0, count: 0, sport_type: "" });
    }

    // Cutoff: ignore activities older than `weeks` weeks
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    for (const act of activities) {
      const startDate = new Date(act.start_date as string);
      if (startDate < cutoff) continue;
      const weekStart = getMondayISO(startDate);
      const existing = weekMap.get(weekStart);
      if (existing) {
        existing.distance += (act.distance as number) || 0;
        existing.moving_time += (act.moving_time as number) || 0;
        existing.elevation_gain += (act.total_elevation_gain as number) || 0;
        existing.count += 1;
        if (!existing.sport_type) existing.sport_type = (act.sport_type as string) || "Workout";
      }
    }

    // Return in chronological order
    const sorted = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, data]) => ({ week_start, ...data }));

    res.json(sorted);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch weekly stats");
    res.status(500).json({ error: "Failed to fetch weekly stats" });
  }
});

router.get("/stats/types", async (req, res) => {
  try {
    // Fetch recent 200 activities to compute sport type breakdown
    const activities = await stravaFetch("/athlete/activities", {
      per_page: 200,
      page: 1,
    }) as Array<Record<string, unknown>>;

    const typeMap = new Map<string, { count: number; distance: number; moving_time: number }>();

    for (const act of activities) {
      const sportType = normalizeSportType((act.sport_type as string) || (act.type as string) || "Other");
      const existing = typeMap.get(sportType);
      if (existing) {
        existing.count += 1;
        existing.distance += (act.distance as number) || 0;
        existing.moving_time += (act.moving_time as number) || 0;
      } else {
        typeMap.set(sportType, {
          count: 1,
          distance: (act.distance as number) || 0,
          moving_time: (act.moving_time as number) || 0,
        });
      }
    }

    const result = Array.from(typeMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([sport_type, data]) => ({ sport_type, ...data }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch activity types");
    res.status(500).json({ error: "Failed to fetch activity types" });
  }
});

router.get("/stats/monthly", async (req, res) => {
  try {
    const now = new Date();

    // This month: year/month
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth(); // 0-indexed

    // Last month
    const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const lastYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    const thisMonthName = now.toLocaleDateString("en", { month: "long" });
    const lastMonthName = lastMonthDate.toLocaleDateString("en", { month: "long" });

    // Fetch activities covering both months
    const after = Math.floor(new Date(lastYear, lastMonth, 1).getTime() / 1000);
    const [page1, page2] = await Promise.all([
      stravaFetch("/athlete/activities", { per_page: 200, page: 1, after }) as Promise<Array<Record<string, unknown>>>,
      stravaFetch("/athlete/activities", { per_page: 200, page: 2, after }) as Promise<Array<Record<string, unknown>>>,
    ]);
    const activities = [...(page1 ?? []), ...(page2 ?? [])];

    // day -> { seconds, metres } for each month
    const thisDayMap = new Map<number, { secs: number; dist: number }>();
    const lastDayMap = new Map<number, { secs: number; dist: number }>();

    for (const act of activities) {
      const dateStr = (act.start_date_local as string)?.split("T")[0];
      if (!dateStr) continue;
      const d = new Date(dateStr + "T00:00:00");
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      const secs = (act.moving_time as number) || 0;
      const dist = (act.distance as number) || 0;

      if (y === thisYear && m === thisMonth) {
        const prev = thisDayMap.get(day) ?? { secs: 0, dist: 0 };
        thisDayMap.set(day, { secs: prev.secs + secs, dist: prev.dist + dist });
      } else if (y === lastYear && m === lastMonth) {
        const prev = lastDayMap.get(day) ?? { secs: 0, dist: 0 };
        lastDayMap.set(day, { secs: prev.secs + secs, dist: prev.dist + dist });
      }
    }

    // Build days array up to the longer of: today's day-of-month OR last month's length
    const today = now.getDate();
    const lastMonthDays = new Date(thisYear, thisMonth, 0).getDate(); // days in last month
    const maxDay = Math.max(today, lastMonthDays);

    const days = [];
    for (let d = 1; d <= maxDay; d++) {
      const thisEntry = thisDayMap.get(d);
      const lastEntry = lastDayMap.get(d);
      days.push({
        day: d,
        this_month: d <= today ? (thisEntry ? parseFloat((thisEntry.secs / 3600).toFixed(2)) : null) : null,
        last_month: d <= lastMonthDays ? (lastEntry ? parseFloat((lastEntry.secs / 3600).toFixed(2)) : null) : undefined,
        this_month_km: d <= today ? (thisEntry ? parseFloat((thisEntry.dist / 1000).toFixed(2)) : null) : null,
        last_month_km: d <= lastMonthDays ? (lastEntry ? parseFloat((lastEntry.dist / 1000).toFixed(2)) : null) : undefined,
      });
    }

    res.json({ this_month_name: thisMonthName, last_month_name: lastMonthName, days });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch monthly stats");
    res.status(500).json({ error: "Failed to fetch monthly stats" });
  }
});

router.get("/stats/daily", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days ?? 364), 730);
    // Fetch enough activities; Strava max per_page is 200, use two pages for dense training
    const [page1, page2] = await Promise.all([
      stravaFetch("/athlete/activities", { per_page: 200, page: 1 }) as Promise<Array<Record<string, unknown>>>,
      stravaFetch("/athlete/activities", { per_page: 200, page: 2 }) as Promise<Array<Record<string, unknown>>>,
    ]);
    const activities = [...(page1 ?? []), ...(page2 ?? [])];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Map: "YYYY-MM-DD|sport_type" -> { moving_time, distance, count }
    const dayMap = new Map<string, { moving_time: number; distance: number; count: number }>();

    const normalizeForHeatmap = (raw: string): string => {
      const t = raw || "Other";
      if (t === "VirtualRide" || t === "EBikeRide" || t === "EMountainBikeRide") return "Ride";
      if (t === "VirtualRun") return "Run";
      if (["Run", "Ride", "Swim"].includes(t)) return t;
      return "Other";
    };

    for (const act of activities) {
      const dateStr = (act.start_date_local as string)?.split("T")[0];
      if (!dateStr) continue;
      if (new Date(dateStr) < cutoff) continue;

      const sport = normalizeForHeatmap((act.sport_type as string) || "Other");
      const key = `${dateStr}|${sport}`;
      const existing = dayMap.get(key);
      if (existing) {
        existing.moving_time += (act.moving_time as number) || 0;
        existing.distance += (act.distance as number) || 0;
        existing.count += 1;
      } else {
        dayMap.set(key, {
          moving_time: (act.moving_time as number) || 0,
          distance: (act.distance as number) || 0,
          count: 1,
        });
      }
    }

    const result = Array.from(dayMap.entries()).map(([key, data]) => {
      const [date, sport_type] = key.split("|");
      return { date, sport_type, ...data };
    }).sort((a, b) => a.date.localeCompare(b.date));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch daily stats");
    res.status(500).json({ error: "Failed to fetch daily stats" });
  }
});

export default router;

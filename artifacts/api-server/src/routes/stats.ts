import { Router } from "express";
import { stravaFetch } from "../lib/strava";

const router = Router();

// --- Simple in-memory cache ---------------------------------------------------
interface CacheEntry { value: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  return entry.value;
}

function cacheSet(key: string, value: unknown, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const TTL_SHORT  = 5  * 60 * 1000; // 5 min  — weekly/monthly/types
const TTL_LONG   = 15 * 60 * 1000; // 15 min — daily heatmap (large fetch)
// -----------------------------------------------------------------------------

function normalizeSportType(raw: string): string {
  const t = raw || "Other";
  if (t === "VirtualRide" || t === "EBikeRide" || t === "EMountainBikeRide") return "Ride";
  if (t === "VirtualRun") return "Run";
  return t;
}

router.get("/stats", async (req, res) => {
  const key = "stats";
  const cached = cacheGet(key);
  if (cached) { res.json(cached); return; }
  try {
    const athlete = await stravaFetch("/athlete") as { id: number };
    const stats = await stravaFetch(`/athletes/${athlete.id}/stats`);
    cacheSet(key, stats, TTL_SHORT);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/stats/weekly", async (req, res) => {
  const weeks = Math.min(Number(req.query.weeks ?? 12), 52);
  const key = `stats/weekly:${weeks}`;
  const cached = cacheGet(key);
  if (cached) { res.json(cached); return; }
  try {
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

    const weekMap = new Map<string, { distance: number; moving_time: number; elevation_gain: number; count: number; sport_type: string }>();
    const now = new Date();
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      weekMap.set(getMondayISO(d), { distance: 0, moving_time: 0, elevation_gain: 0, count: 0, sport_type: "" });
    }

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    for (const act of activities) {
      const startDate = new Date(act.start_date as string);
      if (startDate < cutoff) continue;
      const weekStart = getMondayISO(startDate);
      const existing = weekMap.get(weekStart);
      if (existing) {
        existing.distance     += (act.distance              as number) || 0;
        existing.moving_time  += (act.moving_time           as number) || 0;
        existing.elevation_gain += (act.total_elevation_gain as number) || 0;
        existing.count        += 1;
        if (!existing.sport_type) existing.sport_type = (act.sport_type as string) || "Workout";
      }
    }

    const sorted = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, data]) => ({ week_start, ...data }));

    cacheSet(key, sorted, TTL_SHORT);
    res.json(sorted);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch weekly stats");
    res.status(500).json({ error: "Failed to fetch weekly stats" });
  }
});

router.get("/stats/types", async (req, res) => {
  const key = "stats/types";
  const cached = cacheGet(key);
  if (cached) { res.json(cached); return; }
  try {
    const activities = await stravaFetch("/athlete/activities", { per_page: 200, page: 1 }) as Array<Record<string, unknown>>;

    const typeMap = new Map<string, { count: number; distance: number; moving_time: number }>();
    for (const act of activities) {
      const sportType = normalizeSportType((act.sport_type as string) || (act.type as string) || "Other");
      const existing = typeMap.get(sportType);
      if (existing) {
        existing.count        += 1;
        existing.distance     += (act.distance    as number) || 0;
        existing.moving_time  += (act.moving_time as number) || 0;
      } else {
        typeMap.set(sportType, { count: 1, distance: (act.distance as number) || 0, moving_time: (act.moving_time as number) || 0 });
      }
    }

    const result = Array.from(typeMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([sport_type, data]) => ({ sport_type, ...data }));

    cacheSet(key, result, TTL_SHORT);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch activity types");
    res.status(500).json({ error: "Failed to fetch activity types" });
  }
});

router.get("/stats/monthly", async (req, res) => {
  const key = "stats/monthly";
  const cached = cacheGet(key);
  if (cached) { res.json(cached); return; }
  try {
    const now = new Date();
    const thisYear  = now.getFullYear();
    const thisMonth = now.getMonth();

    const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const lastYear  = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    const thisMonthName = now.toLocaleDateString("en", { month: "long" });
    const lastMonthName = lastMonthDate.toLocaleDateString("en", { month: "long" });

    const after = Math.floor(new Date(lastYear, lastMonth, 1).getTime() / 1000);
    const [page1, page2] = await Promise.all([
      stravaFetch("/athlete/activities", { per_page: 200, page: 1, after }) as Promise<Array<Record<string, unknown>>>,
      stravaFetch("/athlete/activities", { per_page: 200, page: 2, after }) as Promise<Array<Record<string, unknown>>>,
    ]);
    const activities = [...(page1 ?? []), ...(page2 ?? [])];

    const thisDayMap = new Map<number, { secs: number; dist: number }>();
    const lastDayMap = new Map<number, { secs: number; dist: number }>();

    for (const act of activities) {
      const dateStr = (act.start_date_local as string)?.split("T")[0];
      if (!dateStr) continue;
      const d = new Date(dateStr + "T00:00:00");
      const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
      const secs = (act.moving_time as number) || 0;
      const dist = (act.distance    as number) || 0;

      if (y === thisYear && m === thisMonth) {
        const prev = thisDayMap.get(day) ?? { secs: 0, dist: 0 };
        thisDayMap.set(day, { secs: prev.secs + secs, dist: prev.dist + dist });
      } else if (y === lastYear && m === lastMonth) {
        const prev = lastDayMap.get(day) ?? { secs: 0, dist: 0 };
        lastDayMap.set(day, { secs: prev.secs + secs, dist: prev.dist + dist });
      }
    }

    const today = now.getDate();
    const lastMonthDays = new Date(thisYear, thisMonth, 0).getDate();
    const maxDay = Math.max(today, lastMonthDays);

    const days = [];
    for (let d = 1; d <= maxDay; d++) {
      const thisEntry = thisDayMap.get(d);
      const lastEntry = lastDayMap.get(d);
      days.push({
        day: d,
        this_month:    d <= today         ? (thisEntry ? parseFloat((thisEntry.secs / 3600).toFixed(2)) : null) : null,
        last_month:    d <= lastMonthDays ? (lastEntry ? parseFloat((lastEntry.secs / 3600).toFixed(2)) : null) : undefined,
        this_month_km: d <= today         ? (thisEntry ? parseFloat((thisEntry.dist / 1000).toFixed(2)) : null) : null,
        last_month_km: d <= lastMonthDays ? (lastEntry ? parseFloat((lastEntry.dist / 1000).toFixed(2)) : null) : undefined,
      });
    }

    const result = { this_month_name: thisMonthName, last_month_name: lastMonthName, days };
    cacheSet(key, result, TTL_SHORT);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch monthly stats");
    res.status(500).json({ error: "Failed to fetch monthly stats" });
  }
});

router.get("/stats/daily", async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 364), 730);
  const key = `stats/daily:${days}`;
  const cached = cacheGet(key);
  if (cached) { res.json(cached); return; }
  try {
    const [page1, page2] = await Promise.all([
      stravaFetch("/athlete/activities", { per_page: 200, page: 1 }) as Promise<Array<Record<string, unknown>>>,
      stravaFetch("/athlete/activities", { per_page: 200, page: 2 }) as Promise<Array<Record<string, unknown>>>,
    ]);
    const activities = [...(page1 ?? []), ...(page2 ?? [])];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

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
      if (!dateStr || new Date(dateStr) < cutoff) continue;
      const sport = normalizeForHeatmap((act.sport_type as string) || "Other");
      const key2 = `${dateStr}|${sport}`;
      const existing = dayMap.get(key2);
      if (existing) {
        existing.moving_time += (act.moving_time as number) || 0;
        existing.distance    += (act.distance    as number) || 0;
        existing.count       += 1;
      } else {
        dayMap.set(key2, { moving_time: (act.moving_time as number) || 0, distance: (act.distance as number) || 0, count: 1 });
      }
    }

    const result = Array.from(dayMap.entries()).map(([k, data]) => {
      const [date, sport_type] = k.split("|");
      return { date, sport_type, ...data };
    }).sort((a, b) => a.date.localeCompare(b.date));

    cacheSet(key, result, TTL_LONG);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch daily stats");
    res.status(500).json({ error: "Failed to fetch daily stats" });
  }
});

export default router;

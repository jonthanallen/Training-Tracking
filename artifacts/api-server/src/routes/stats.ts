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
    // Fetch enough activities to cover the requested weeks
    const perPage = Math.min(weeks * 10, 200);
    const activities = await stravaFetch("/athlete/activities", {
      per_page: perPage,
      page: 1,
    }) as Array<Record<string, unknown>>;

    // Group by week_start (Monday)
    const weekMap = new Map<string, { distance: number; moving_time: number; elevation_gain: number; count: number; sport_type: string }>();

    const getMondayISO = (date: Date): string => {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1 - day);
      d.setUTCDate(d.getUTCDate() + diff);
      return d.toISOString().split("T")[0];
    };

    for (const act of activities) {
      const startDate = new Date(act.start_date as string);
      const weekStart = getMondayISO(startDate);
      const existing = weekMap.get(weekStart);
      if (existing) {
        existing.distance += (act.distance as number) || 0;
        existing.moving_time += (act.moving_time as number) || 0;
        existing.elevation_gain += (act.total_elevation_gain as number) || 0;
        existing.count += 1;
      } else {
        weekMap.set(weekStart, {
          distance: (act.distance as number) || 0,
          moving_time: (act.moving_time as number) || 0,
          elevation_gain: (act.total_elevation_gain as number) || 0,
          count: 1,
          sport_type: (act.sport_type as string) || "Workout",
        });
      }
    }

    // Sort by week descending and take `weeks` most recent
    const sorted = Array.from(weekMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, weeks)
      .reverse()
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

export default router;

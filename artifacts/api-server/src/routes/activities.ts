import { Router } from "express";
import { stravaFetch } from "../lib/strava";

const router = Router();

const STRAVA_MAX_PER_PAGE = 200;

router.get("/activities", async (req, res) => {
  try {
    const { page = "1", per_page = "30", type, before, after } = req.query as Record<string, string>;
    const target = Number(per_page);

    if (!type) {
      const activities = await stravaFetch("/athlete/activities", {
        page: Number(page),
        per_page: target,
        before: before ? Number(before) : undefined,
        after: after ? Number(after) : undefined,
      });
      res.json(activities);
      return;
    }

    // Type filter active: loop Strava pages (cursor via `before`) until we fill the target count
    const result: Array<Record<string, unknown>> = [];
    let curBefore: number | undefined = before ? Number(before) : undefined;
    const afterNum = after ? Number(after) : undefined;

    while (result.length < target) {
      const batch = await stravaFetch("/athlete/activities", {
        per_page: STRAVA_MAX_PER_PAGE,
        before: curBefore,
        after: afterNum,
      }) as Array<Record<string, unknown>>;

      if (!batch || batch.length === 0) break;

      const CORE_TYPES = ["Run", "VirtualRun", "Ride", "VirtualRide", "Swim"];
      const matching = type === "Other"
        ? batch.filter((a) => !CORE_TYPES.includes(a.sport_type as string) && !CORE_TYPES.includes(a.type as string))
        : batch.filter((a) => a.sport_type === type || a.type === type);
      result.push(...matching);

      if (batch.length < STRAVA_MAX_PER_PAGE) break; // exhausted all Strava history

      // Advance cursor to just before the oldest activity in this batch
      const lastDate = batch[batch.length - 1]?.start_date as string | undefined;
      if (!lastDate) break;
      curBefore = Math.floor(new Date(lastDate).getTime() / 1000) - 1;
    }

    res.json(result.slice(0, target));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch activities");
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

router.get("/activities/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await stravaFetch(`/activities/${id}`);
    res.json(activity);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch activity");
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

router.get("/activities/:id/streams", async (req, res) => {
  try {
    const { id } = req.params;
    const keys = "time,distance,latlng,altitude,heartrate,cadence,watts,velocity_smooth,grade_smooth";
    const raw = await stravaFetch(`/activities/${id}/streams`, {
      keys,
      key_by_type: "true",
    }) as Record<string, { data: unknown[] }>;

    const streams: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value && Array.isArray(value.data)) {
        streams[key] = value.data;
      }
    }
    res.json(streams);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch activity streams");
    res.status(500).json({ error: "Failed to fetch streams" });
  }
});

export default router;

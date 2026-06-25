import { Router } from "express";
import { stravaFetch } from "../lib/strava";

const router = Router();

router.get("/activities", async (req, res) => {
  try {
    const { page = "1", per_page = "30", type, before, after } = req.query as Record<string, string>;
    const activities = await stravaFetch("/athlete/activities", {
      page: Number(page),
      per_page: Number(per_page),
      before: before ? Number(before) : undefined,
      after: after ? Number(after) : undefined,
    });
    // Optionally filter by type client-side (Strava API doesn't support type filter in list)
    let result = activities as Array<Record<string, unknown>>;
    if (type) {
      result = result.filter((a) => a.sport_type === type || a.type === type);
    }
    res.json(result);
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

    // Flatten: { time: { data: [...] } } → { time: [...] }
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

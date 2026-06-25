import { Router } from "express";
import { stravaFetch } from "../lib/strava";

const router = Router();

router.get("/athlete", async (req, res) => {
  try {
    const athlete = await stravaFetch("/athlete");
    res.json(athlete);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch athlete");
    res.status(500).json({ error: "Failed to fetch athlete profile" });
  }
});

export default router;

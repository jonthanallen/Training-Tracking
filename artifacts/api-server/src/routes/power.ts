import { Router } from "express";
import { stravaFetch } from "../lib/strava";

const router = Router();

// ─── Cache ────────────────────────────────────────────────────────────────────
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
const TTL_POWER = 60 * 60 * 1000; // 1 hour

// ─── Power curve ──────────────────────────────────────────────────────────────
const DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const LABELS    = ["1s","5s","10s","30s","1min","2min","5min","10min","20min","30min","1hr"];
const RIDE_TYPES = new Set(["Ride","VirtualRide","EBikeRide","EMountainBikeRide","GravelRide"]);

function maxMeanPower(watts: number[], secs: number): number | null {
  if (watts.length < secs) return null;
  let sum = 0;
  for (let i = 0; i < secs; i++) sum += watts[i];
  let max = sum;
  for (let i = secs; i < watts.length; i++) {
    sum += watts[i] - watts[i - secs];
    if (sum > max) max = sum;
  }
  return Math.round(max / secs);
}

function rangeAfter(range: string): number | undefined {
  const now = Math.floor(Date.now() / 1000);
  if (range === "6w")       return now - 42 * 86400;
  if (range === "ytd")      return Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
  return undefined; // lifetime
}

router.get("/power-curve", async (req, res) => {
  const range = (req.query.range as string) || "6w";
  const key = `power-curve:${range}`;
  const cached = cacheGet(key);
  if (cached) { res.json(cached); return; }

  try {
    // Fetch bike activities in range
    const after = rangeAfter(range);
    const MAX_ACTIVITIES = range === "lifetime" ? 100 : 60;
    const activities: Array<Record<string, unknown>> = [];
    let page = 1;

    while (activities.length < MAX_ACTIVITIES) {
      const batch = await stravaFetch("/athlete/activities", {
        per_page: 200,
        page,
        ...(after ? { after } : {}),
      }) as Array<Record<string, unknown>>;
      if (!batch?.length) break;

      const bikeWithPower = batch.filter(
        (a) => RIDE_TYPES.has(a.sport_type as string) && a.device_watts === true
      );
      activities.push(...bikeWithPower);
      if (batch.length < 200) break;
      page++;
    }

    const toProcess = activities.slice(0, MAX_ACTIVITIES);

    // Compute power curve: best mean power at each duration across all activities
    const best: Record<number, number> = {};

    // Fetch streams in small batches to respect rate limits
    const BATCH = 5;
    for (let i = 0; i < toProcess.length; i += BATCH) {
      const chunk = toProcess.slice(i, i + BATCH);
      await Promise.all(chunk.map(async (act) => {
        try {
          const raw = await stravaFetch(`/activities/${act.id}/streams`, {
            keys: "watts",
            key_by_type: "true",
          }) as Record<string, { data: number[] }>;
          const watts = raw?.watts?.data;
          if (!Array.isArray(watts) || watts.length < 1) return;

          for (const dur of DURATIONS) {
            const mp = maxMeanPower(watts, dur);
            if (mp !== null && (!best[dur] || mp > best[dur])) {
              best[dur] = mp;
            }
          }
        } catch {
          // stream unavailable for this activity — skip
        }
      }));
    }

    const result = DURATIONS.map((secs, i) => ({
      seconds: secs,
      label: LABELS[i],
      watts: best[secs] ?? null,
    }));

    cacheSet(key, result, TTL_POWER);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to compute power curve");
    res.status(500).json({ error: "Failed to compute power curve" });
  }
});

export default router;

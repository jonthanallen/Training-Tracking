import { logger } from "./logger";

interface TokenCache {
  access_token: string;
  expires_at: number;
}

let tokenCache: TokenCache | null = null;

export async function getStravaAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (tokenCache && tokenCache.expires_at > now + 60) {
    return tokenCache.access_token;
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Strava credentials: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN");
  }

  logger.info("Refreshing Strava access token");

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_at: number };
  tokenCache = { access_token: data.access_token, expires_at: data.expires_at };
  logger.info({ expires_at: data.expires_at }, "Strava access token refreshed");
  return data.access_token;
}

export async function stravaFetch(path: string, params?: Record<string, string | number | undefined>): Promise<unknown> {
  const token = await getStravaAccessToken();

  const url = new URL(`https://www.strava.com/api/v3${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error ${res.status} for ${path}: ${text}`);
  }

  return res.json();
}

import type { Context } from "@netlify/functions";

// Garmin Health API endpoints
const GARMIN_API_BASE = "https://apis.garmin.com/wellness-api/rest";

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function buildOAuthHeader(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  tokenSecret: string,
  queryParams: Record<string, string> = {}
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...oauthParams, ...queryParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = await hmacSha1(signingKey, baseString);

  oauthParams["oauth_signature"] = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const consumerKey = Deno.env.get("GARMIN_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("GARMIN_CONSUMER_SECRET");

  if (!consumerKey || !consumerSecret) {
    return new Response(
      JSON.stringify({ error: "Garmin API not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { access_token, access_token_secret, date } = await req.json();

    if (!access_token || !access_token_secret) {
      return new Response(
        JSON.stringify({ error: "Missing Garmin access tokens" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default to today's date
    const targetDate = date || new Date().toISOString().split("T")[0];

    // Convert date to epoch seconds for Garmin API
    const startOfDay = Math.floor(new Date(targetDate + "T00:00:00Z").getTime() / 1000);
    const endOfDay = startOfDay + 86400;

    // Fetch daily summary
    const dailyUrl = `${GARMIN_API_BASE}/dailies`;
    const queryParams = {
      uploadStartTimeInSeconds: startOfDay.toString(),
      uploadEndTimeInSeconds: endOfDay.toString(),
    };

    const fullUrl = `${dailyUrl}?${new URLSearchParams(queryParams).toString()}`;

    const authHeader = await buildOAuthHeader(
      "GET",
      dailyUrl,
      consumerKey,
      consumerSecret,
      access_token,
      access_token_secret,
      queryParams
    );

    const dailyResponse = await fetch(fullUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
    });

    let dailyData: any = null;
    if (dailyResponse.ok) {
      const dailies = await dailyResponse.json();
      dailyData = Array.isArray(dailies) ? dailies[0] : dailies;
    }

    // Also fetch sleep data
    const sleepUrl = `${GARMIN_API_BASE}/sleeps`;
    const sleepFullUrl = `${sleepUrl}?${new URLSearchParams(queryParams).toString()}`;
    const sleepAuthHeader = await buildOAuthHeader(
      "GET",
      sleepUrl,
      consumerKey,
      consumerSecret,
      access_token,
      access_token_secret,
      queryParams
    );

    const sleepResponse = await fetch(sleepFullUrl, {
      method: "GET",
      headers: { Authorization: sleepAuthHeader },
    });

    let sleepData: any = null;
    if (sleepResponse.ok) {
      const sleeps = await sleepResponse.json();
      sleepData = Array.isArray(sleeps) ? sleeps[0] : sleeps;
    }

    // Normalize the data into our format
    const result = {
      date: targetDate,
      steps: dailyData?.steps || null,
      calories_burned: dailyData?.activeKilocalories || dailyData?.totalKilocalories || null,
      active_minutes: dailyData?.moderateIntensityDurationInSeconds
        ? Math.round(
            ((dailyData.moderateIntensityDurationInSeconds || 0) +
              (dailyData.vigorousIntensityDurationInSeconds || 0)) /
              60
          )
        : null,
      heart_rate_avg: dailyData?.averageHeartRateInBeatsPerMinute || null,
      heart_rate_resting: dailyData?.restingHeartRateInBeatsPerMinute || null,
      distance_km: dailyData?.distanceInMeters
        ? Math.round((dailyData.distanceInMeters / 1000) * 10) / 10
        : null,
      floors_climbed: dailyData?.floorsClimbed || null,
      stress_level: dailyData?.averageStressLevel || null,
      body_battery: dailyData?.bodyBatteryChargedValue || null,
      sleep_hours: sleepData?.durationInSeconds
        ? Math.round((sleepData.durationInSeconds / 3600) * 10) / 10
        : null,
      sleep_score: sleepData?.overallSleepScore?.value || null,
      raw_daily: dailyData,
      raw_sleep: sleepData,
      last_synced: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

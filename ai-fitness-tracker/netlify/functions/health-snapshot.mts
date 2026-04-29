import type { Context } from "@netlify/functions";
import { handleCors, getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

// ── Supabase helpers (lightweight, no SDK) ────────────────────────

const SUPABASE_URL = () => getEnv("SUPABASE_URL")!;
const SUPABASE_KEY = () => getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY")!;

async function supabaseGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': SUPABASE_KEY(),
      'Authorization': `Bearer ${SUPABASE_KEY()}`,
    },
  });
  return res.json();
}

// ── Open Wearables API helper ─────────────────────────────────────

const OW_URL = () => getEnv("OPEN_WEARABLES_URL");
const OW_KEY = () => getEnv("OPEN_WEARABLES_API_KEY");

async function owFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${OW_URL()}${path}`, {
    ...options,
    headers: {
      'X-Open-Wearables-API-Key': OW_KEY()!,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OW API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── GET /api/health-snapshot?device_id=xxx ────────────────────────
// Quick snapshot of today's health data for APEX coaching context

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405, origin);
  }

  if (!OW_URL() || !OW_KEY()) {
    return errorResponse("Health service not configured", 503, origin);
  }

  try {
    const url = new URL(req.url);
    const deviceId = url.searchParams.get('device_id');

    if (!deviceId) {
      return errorResponse("device_id query parameter is required", 400, origin);
    }

    // 1. Look up ow_user_id
    const profiles = await supabaseGet(
      'ja_profiles',
      `device_id=eq.${encodeURIComponent(deviceId)}&select=ow_user_id&limit=1`
    );

    if (!Array.isArray(profiles) || profiles.length === 0 || !profiles[0].ow_user_id) {
      return errorResponse("No health service user found. Connect Garmin first.", 404, origin);
    }

    const owUserId = profiles[0].ow_user_id;
    const today = new Date().toISOString().split('T')[0];

    // 2. Parallel fetch all health data
    const [activityData, sleepData, scoresData, bodyData] = await Promise.allSettled([
      owFetch(
        `/api/v1/users/${encodeURIComponent(owUserId)}/summaries/activity?start_date=${today}&end_date=${today}`
      ),
      owFetch(
        `/api/v1/users/${encodeURIComponent(owUserId)}/summaries/sleep?start_date=${today}&end_date=${today}`
      ),
      owFetch(
        `/api/v1/users/${encodeURIComponent(owUserId)}/health-scores?start_date=${today}&end_date=${today}`
      ),
      owFetch(
        `/api/v1/users/${encodeURIComponent(owUserId)}/summaries/body?latest_window_hours=48`
      ),
    ]);

    // Extract data from settled promises (graceful degradation)
    const activity = activityData.status === 'fulfilled' ? activityData.value : null;
    const sleep = sleepData.status === 'fulfilled' ? sleepData.value : null;
    const scores = scoresData.status === 'fulfilled' ? scoresData.value : null;
    const body = bodyData.status === 'fulfilled' ? bodyData.value : null;

    // Normalize activity — handle both array and object responses
    const activityEntry = Array.isArray(activity) ? activity[0] : activity;
    const sleepEntry = Array.isArray(sleep) ? sleep[0] : sleep;
    const scoresEntry = Array.isArray(scores) ? scores[0] : scores;
    const bodyEntry = Array.isArray(body) ? body[0] : body;

    // 3. Combine into a single snapshot object
    const snapshot = {
      date: today,
      // Activity
      steps: activityEntry?.steps ?? activityEntry?.total_steps ?? null,
      calories_active: activityEntry?.calories_active ?? activityEntry?.active_calories ?? null,
      heart_rate_resting: activityEntry?.heart_rate_resting ?? activityEntry?.resting_heart_rate ?? null,
      heart_rate_avg: activityEntry?.heart_rate_avg ?? activityEntry?.average_heart_rate ?? null,
      // Sleep
      sleep_hours: sleepEntry?.duration_hours ?? sleepEntry?.total_sleep_hours ?? (
        sleepEntry?.duration_seconds ? Math.round((sleepEntry.duration_seconds / 3600) * 10) / 10 : null
      ),
      sleep_score: sleepEntry?.score ?? sleepEntry?.sleep_score ?? sleepEntry?.overall_score ?? null,
      sleep_stages: sleepEntry?.stages ?? sleepEntry?.sleep_stages ?? null,
      // Scores / vitals
      stress_level: scoresEntry?.stress ?? scoresEntry?.stress_level ?? activityEntry?.stress_level ?? null,
      body_battery: scoresEntry?.body_battery ?? activityEntry?.body_battery ?? null,
      hrv: scoresEntry?.hrv ?? scoresEntry?.heart_rate_variability ?? null,
      // Body composition
      weight_kg: bodyEntry?.weight_kg ?? bodyEntry?.weight ?? null,
      body_fat_pct: bodyEntry?.body_fat_percentage ?? bodyEntry?.body_fat_pct ?? null,
      // Sync info
      last_sync: activityEntry?.last_sync ?? activityEntry?.synced_at ?? new Date().toISOString(),
    };

    return jsonResponse(snapshot, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch health snapshot", 500, origin);
  }
};

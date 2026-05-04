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

// ── Terra API helper ─────────────────────────────────────────────

async function terraFetch(path: string, method = 'GET', body?: object) {
  const res = await fetch(`https://api.tryterra.co/v2${path}`, {
    method,
    headers: {
      'dev-id': getEnv('TERRA_DEV_ID')!,
      'x-api-key': getEnv('TERRA_API_KEY')!,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Terra API error ${res.status}: ${text}`);
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

  if (!getEnv('TERRA_API_KEY') || !getEnv('TERRA_DEV_ID')) {
    return errorResponse("Health service not configured", 503, origin);
  }

  try {
    const url = new URL(req.url);
    const deviceId = url.searchParams.get('device_id');

    if (!deviceId) {
      return errorResponse("device_id query parameter is required", 400, origin);
    }

    // 1. Look up terra_user_id
    const profiles = await supabaseGet(
      'ja_profiles',
      `device_id=eq.${encodeURIComponent(deviceId)}&select=terra_user_id&limit=1`
    );

    if (!Array.isArray(profiles) || profiles.length === 0 || !profiles[0].terra_user_id) {
      return errorResponse("No health service user found. Connect Garmin first.", 404, origin);
    }

    const terraUserId = profiles[0].terra_user_id;
    const today = new Date().toISOString().split('T')[0];

    // 2. Parallel fetch daily, sleep, and body data from Terra
    const baseParams = `user_id=${encodeURIComponent(terraUserId)}&start_date=${today}&end_date=${today}&to_webhook=false`;

    const [dailyResult, sleepResult, bodyResult] = await Promise.allSettled([
      terraFetch(`/daily?${baseParams}&with_samples=false`),
      terraFetch(`/sleep?${baseParams}`),
      terraFetch(`/body?${baseParams}`),
    ]);

    // Extract data from settled promises (graceful degradation)
    const dailyResponse = dailyResult.status === 'fulfilled' ? dailyResult.value : null;
    const sleepResponse = sleepResult.status === 'fulfilled' ? sleepResult.value : null;
    const bodyResponse = bodyResult.status === 'fulfilled' ? bodyResult.value : null;

    // Terra wraps data in { data: [...] }
    const daily = dailyResponse?.data?.[0] || null;
    const sleep = sleepResponse?.data?.[0] || null;
    const body = bodyResponse?.data?.[0] || null;

    // 3. Calculate total sleep hours from sleep stage durations
    let sleepHours: number | null = null;
    let sleepStages: { light: number; deep: number; rem: number; awake: number } | null = null;

    if (sleep?.sleep_durations_data) {
      const asleep = sleep.sleep_durations_data.asleep || {};
      const awake = sleep.sleep_durations_data.awake || {};

      const lightSeconds = asleep.duration_light_sleep_state_seconds || 0;
      const deepSeconds = asleep.duration_deep_sleep_state_seconds || 0;
      const remSeconds = asleep.duration_REM_sleep_state_seconds || 0;
      const awakeSeconds = awake.duration_awake_state_seconds || 0;

      const totalSleepSeconds = lightSeconds + deepSeconds + remSeconds;
      sleepHours = Math.round((totalSleepSeconds / 3600) * 10) / 10;

      sleepStages = {
        light: Math.round((lightSeconds / 3600) * 10) / 10,
        deep: Math.round((deepSeconds / 3600) * 10) / 10,
        rem: Math.round((remSeconds / 3600) * 10) / 10,
        awake: Math.round((awakeSeconds / 3600) * 10) / 10,
      };
    }

    // 4. Combine into our HealthSnapshot format
    const snapshot = {
      date: today,
      // Activity
      steps: daily?.distance_data?.steps ?? null,
      calories_active: daily?.calories_data?.net_activity_calories ?? null,
      // Heart rate — prefer daily, fall back to body
      heart_rate_resting:
        daily?.heart_rate_data?.summary?.resting_hr_bpm ??
        body?.heart_rate_data?.summary?.resting_hr_bpm ??
        null,
      heart_rate_avg: daily?.heart_rate_data?.summary?.avg_hr_bpm ?? null,
      // Sleep
      sleep_hours: sleepHours,
      sleep_score: sleep?.sleep_quality_score_data?.sleep_quality_score ?? null,
      sleep_stages: sleepStages,
      // Stress & recovery (Garmin-specific)
      stress_level: daily?.stress_data?.avg_stress_level ?? null,
      body_battery: daily?.device_data?.other_devices?.[0]?.body_battery_level ?? null,
      // HRV — check daily first, then sleep
      hrv:
        daily?.heart_rate_data?.summary?.hrv_rmssd ??
        sleep?.heart_rate_data?.hrv?.rmssd ??
        null,
      // Body composition
      weight_kg: body?.weight_kg ?? null,
      body_fat_pct: body?.body_fat_percentage ?? null,
      // Sync info
      last_sync: new Date().toISOString(),
    };

    return jsonResponse(snapshot, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch health snapshot", 500, origin);
  }
};

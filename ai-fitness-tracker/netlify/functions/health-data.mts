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

// ── GET /api/health-data?device_id=xxx&type=...&start_date=...&end_date=... ──
// Fetch health metrics for a user

const VALID_TYPES = ['timeseries', 'activity', 'sleep', 'body', 'scores'] as const;
type DataType = typeof VALID_TYPES[number];

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
    const type = url.searchParams.get('type') as DataType | null;
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    if (!deviceId) {
      return errorResponse("device_id query parameter is required", 400, origin);
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return errorResponse(
        `type query parameter is required and must be one of: ${VALID_TYPES.join(', ')}`,
        400,
        origin
      );
    }

    // body type doesn't require date range
    if (type !== 'body' && (!startDate || !endDate)) {
      return errorResponse("start_date and end_date query parameters are required", 400, origin);
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

    // 2. Call the appropriate OW endpoint based on type
    let data: any;

    switch (type) {
      case 'timeseries': {
        const params = new URLSearchParams();
        params.append('types[]', 'heart_rate');
        params.append('types[]', 'steps');
        params.append('types[]', 'garmin_stress_level');
        params.append('types[]', 'garmin_body_battery');
        params.append('types[]', 'heart_rate_variability_rmssd');
        params.append('start_time', `${startDate}T00:00:00Z`);
        params.append('end_time', `${endDate}T23:59:59Z`);
        params.append('resolution', '1hour');
        data = await owFetch(
          `/api/v1/users/${encodeURIComponent(owUserId)}/timeseries?${params.toString()}`
        );
        break;
      }

      case 'activity': {
        data = await owFetch(
          `/api/v1/users/${encodeURIComponent(owUserId)}/summaries/activity?start_date=${startDate}&end_date=${endDate}`
        );
        break;
      }

      case 'sleep': {
        data = await owFetch(
          `/api/v1/users/${encodeURIComponent(owUserId)}/summaries/sleep?start_date=${startDate}&end_date=${endDate}`
        );
        break;
      }

      case 'body': {
        data = await owFetch(
          `/api/v1/users/${encodeURIComponent(owUserId)}/summaries/body`
        );
        break;
      }

      case 'scores': {
        data = await owFetch(
          `/api/v1/users/${encodeURIComponent(owUserId)}/health-scores?start_date=${startDate}&end_date=${endDate}`
        );
        break;
      }
    }

    // 3. Return the data as-is (passthrough)
    return jsonResponse(data, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch health data", 500, origin);
  }
};

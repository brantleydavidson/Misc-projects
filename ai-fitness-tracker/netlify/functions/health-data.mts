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

// ── GET /api/health-data?device_id=xxx&type=...&start_date=...&end_date=... ──
// Fetch health metrics for a user via Terra API

const VALID_TYPES = ['daily', 'sleep', 'body', 'activity'] as const;
type DataType = typeof VALID_TYPES[number];

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

    if (!startDate || !endDate) {
      return errorResponse("start_date and end_date query parameters are required", 400, origin);
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

    // 2. Build Terra API query params
    const params = new URLSearchParams({
      user_id: terraUserId,
      start_date: startDate,
      end_date: endDate,
      to_webhook: 'false',
    });

    // Add with_samples for daily data
    if (type === 'daily') {
      params.append('with_samples', 'true');
    }

    // 3. Call the appropriate Terra endpoint
    const data = await terraFetch(`/${type}?${params.toString()}`);

    // 4. Return the data as-is (passthrough)
    return jsonResponse(data, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch health data", 500, origin);
  }
};

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

async function supabasePatch(table: string, query: string, body: object) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY(),
      'Authorization': `Bearer ${SUPABASE_KEY()}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return res;
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

// ── GET /api/health-status?device_id=xxx ──────────────────────────
// Check if user has connected Garmin via Terra

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

    // 1. Look up terra_user_id from ja_profiles by device_id
    const profiles = await supabaseGet(
      'ja_profiles',
      `device_id=eq.${encodeURIComponent(deviceId)}&select=terra_user_id&limit=1`
    );

    if (!Array.isArray(profiles) || profiles.length === 0 || !profiles[0].terra_user_id) {
      return jsonResponse({ connected: false }, 200, origin);
    }

    const terraUserId = profiles[0].terra_user_id;

    // 2. Verify the user is still connected via Terra
    try {
      const userInfo = await terraFetch(`/userInfo?user_id=${encodeURIComponent(terraUserId)}`);

      return jsonResponse({
        connected: true,
        provider: 'garmin',
        terra_user_id: terraUserId,
        last_sync: userInfo.user?.last_webhook_update || null,
      }, 200, origin);

    } catch (terraErr: any) {
      // Terra returned an error — user likely deauthed
      // Clear terra_user_id from profile
      await supabasePatch(
        'ja_profiles',
        `device_id=eq.${encodeURIComponent(deviceId)}`,
        { terra_user_id: null }
      );

      return jsonResponse({ connected: false }, 200, origin);
    }

  } catch (err: any) {
    return errorResponse(err.message || "Failed to check health status", 500, origin);
  }
};

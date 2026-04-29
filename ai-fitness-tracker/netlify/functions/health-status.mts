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

// ── GET /api/health-status?device_id=xxx ──────────────────────────
// Check if user has connected Garmin and data sync status

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

    // 1. Look up ow_user_id from ja_profiles by device_id
    const profiles = await supabaseGet(
      'ja_profiles',
      `device_id=eq.${encodeURIComponent(deviceId)}&select=ow_user_id&limit=1`
    );

    if (!Array.isArray(profiles) || profiles.length === 0 || !profiles[0].ow_user_id) {
      return jsonResponse({ connected: false }, 200, origin);
    }

    const owUserId = profiles[0].ow_user_id;

    // 2. Get user details + connections from OW
    const owUser = await owFetch(`/api/v1/users/${encodeURIComponent(owUserId)}`);

    // 3. Check for Garmin connection
    const connections = owUser.connections || owUser.providers || [];
    const garminConnection = Array.isArray(connections)
      ? connections.find((c: any) => c.provider === 'garmin' || c.name === 'garmin')
      : null;

    if (!garminConnection) {
      return jsonResponse({
        connected: false,
        ow_user_id: owUserId,
      }, 200, origin);
    }

    // 4. If connected, also get backfill status
    let backfillStatus = null;
    try {
      backfillStatus = await owFetch(
        `/api/v1/providers/garmin/users/${encodeURIComponent(owUserId)}/backfill/status`
      );
    } catch {
      // Backfill status is non-critical
    }

    return jsonResponse({
      connected: true,
      provider: 'garmin',
      ow_user_id: owUserId,
      backfill_status: backfillStatus,
      last_sync: garminConnection.last_sync || garminConnection.last_synced_at || null,
    }, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to check health status", 500, origin);
  }
};

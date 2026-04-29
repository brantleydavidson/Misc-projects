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

// ── POST /api/health-connect ──────────────────────────────────────
// Creates a user in Open Wearables and returns Garmin OAuth authorization URL
// Body: { device_id: string }

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  if (!OW_URL() || !OW_KEY()) {
    return errorResponse("Health service not configured", 503, origin);
  }

  try {
    const { device_id } = await req.json();

    if (!device_id) {
      return errorResponse("device_id is required", 400, origin);
    }

    // 1. Look up if this device already has an OW user
    const profiles = await supabaseGet(
      'ja_profiles',
      `device_id=eq.${encodeURIComponent(device_id)}&select=id,ow_user_id&limit=1`
    );

    if (!Array.isArray(profiles) || profiles.length === 0) {
      return errorResponse("Profile not found for this device", 404, origin);
    }

    const profile = profiles[0];
    let owUserId = profile.ow_user_id;

    // 2. If no OW user, create one
    if (!owUserId) {
      const owUser = await owFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({ external_id: device_id }),
      });

      owUserId = owUser.id;

      // 3. Store the returned id as ow_user_id in ja_profiles
      await supabasePatch(
        'ja_profiles',
        `device_id=eq.${encodeURIComponent(device_id)}`,
        { ow_user_id: owUserId }
      );
    }

    // 4. Get Garmin OAuth URL
    const authData = await owFetch(
      `/api/v1/oauth/garmin/authorize?user_id=${encodeURIComponent(owUserId)}`
    );

    // 5. Return authorization_url and ow_user_id
    return jsonResponse({
      authorization_url: authData.authorization_url || authData.url,
      ow_user_id: owUserId,
    }, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to connect health service", 500, origin);
  }
};

import type { Context } from "@netlify/functions";
import { getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

// ── Supabase helpers (lightweight, no SDK) ────────────────────────

const SUPABASE_URL = () => getEnv("SUPABASE_URL")!;
const SUPABASE_KEY = () => getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY")!;

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

// ── POST /api/terra-webhook ──────────────────────────────────────
// Receives webhook events from Terra API
// Terra sends: { type: string, user: { user_id, reference_id, provider }, data: [...] }

export default async (req: Request, _context: Context) => {
  // No CORS handling for webhooks — these come from Terra servers, not browsers

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Verify that Terra env vars are configured
  if (!getEnv('TERRA_API_KEY') || !getEnv('TERRA_DEV_ID')) {
    return errorResponse("Webhook not configured", 503);
  }

  try {
    const payload = await req.json();

    // Basic validation: ensure we have a type and the payload is valid
    if (!payload || !payload.type) {
      // Always return 200 to Terra to avoid retries on malformed payloads
      return jsonResponse({ status: 'ignored', reason: 'missing type' }, 200);
    }

    const { type, user } = payload;

    switch (type) {
      case 'auth': {
        // User just completed Terra widget and connected their wearable.
        // user.user_id = Terra's user ID
        // user.reference_id = our device_id (passed during authenticateUser)
        if (!user?.user_id || !user?.reference_id) {
          return jsonResponse({ status: 'ignored', reason: 'missing user fields for auth' }, 200);
        }

        // Store terra_user_id in ja_profiles for this device
        await supabasePatch(
          'ja_profiles',
          `device_id=eq.${encodeURIComponent(user.reference_id)}`,
          { terra_user_id: user.user_id }
        );

        return jsonResponse({ status: 'ok', event: 'auth', reference_id: user.reference_id }, 200);
      }

      case 'deauth': {
        // User disconnected their wearable from Terra.
        // Clear terra_user_id from their profile.
        if (!user?.user_id) {
          return jsonResponse({ status: 'ignored', reason: 'missing user_id for deauth' }, 200);
        }

        await supabasePatch(
          'ja_profiles',
          `terra_user_id=eq.${encodeURIComponent(user.user_id)}`,
          { terra_user_id: null }
        );

        return jsonResponse({ status: 'ok', event: 'deauth' }, 200);
      }

      // Data events — we pull data on-demand via snapshot/data endpoints,
      // so just acknowledge these for now. Storage can be added later.
      case 'activity':
      case 'daily':
      case 'sleep':
      case 'body':
      case 'nutrition':
      case 'menstruation': {
        return jsonResponse({ status: 'ok', event: type }, 200);
      }

      default: {
        // Unknown event type — acknowledge to prevent retries
        return jsonResponse({ status: 'ignored', reason: `unknown event type: ${type}` }, 200);
      }
    }

  } catch (err: any) {
    // Always return 200 to Terra to avoid infinite retries.
    // Log the error for debugging but don't let it cause a non-200.
    console.error('Terra webhook error:', err.message || err);
    return jsonResponse({ status: 'error', message: err.message || 'Internal error' }, 200);
  }
};

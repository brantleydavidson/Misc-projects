import type { Context } from "@netlify/functions";
import { handleCors, getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

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

// ── POST /api/health-connect ─────────────────────────────────────
// Initiates Terra widget authentication for Garmin
// Body: { device_id: string, provider?: string }

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  if (!getEnv('TERRA_API_KEY') || !getEnv('TERRA_DEV_ID')) {
    return errorResponse("Health service not configured", 503, origin);
  }

  try {
    const { device_id, provider } = await req.json();

    if (!device_id) {
      return errorResponse("device_id is required", 400, origin);
    }

    // Build redirect URLs based on the request origin
    const redirectOrigin = origin || 'https://jackedai.netlify.app';
    const resource = (provider || 'GARMIN').toUpperCase();

    // Call Terra to get the authentication widget URL
    const terraAuth = await terraFetch('/auth/authenticateUser', 'POST', {
      resource,
      reference_id: device_id,
      auth_success_redirect_url: `${redirectOrigin}/profile?garmin=connected`,
      auth_failure_redirect_url: `${redirectOrigin}/profile?garmin=failed`,
    });

    // Terra returns { status: "success", url: "https://widget.tryterra.co/..." }
    if (!terraAuth.url) {
      throw new Error("Terra did not return an authorization URL");
    }

    // Note: We don't store terra_user_id here — Terra creates the user when
    // they complete the widget, and sends us the user_id via webhook (auth event).
    return jsonResponse({
      authorization_url: terraAuth.url,
    }, 200, origin);

  } catch (err: any) {
    return errorResponse(err.message || "Failed to connect health service", 500, origin);
  }
};

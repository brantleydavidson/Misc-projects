import type { Context } from "@netlify/functions";
import { handleCors, getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

// POST /api/terra-init
// Body: { device_id, redirect_path?, providers? }
// → { url, session_id }
//
// Uses Terra's generateWidgetSession — a multi-provider picker. The user picks
// Garmin / Whoop / Apple Health / Oura / Fitbit / etc inside the widget.
// On success Terra redirects back to {origin}{redirect_path} with terra params,
// and also fires the auth webhook which writes terra_user_id onto the profile.

const DEFAULT_PROVIDERS = [
  "GARMIN",
  "WHOOP",
  "FITBIT",
  "OURA",
  "APPLE",
  "GOOGLE",
  "POLAR",
  "SAMSUNG",
];

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return errorResponse("Method not allowed", 405, origin);
  if (!getEnv("TERRA_API_KEY") || !getEnv("TERRA_DEV_ID"))
    return errorResponse("Terra not configured", 503, origin);

  try {
    const { device_id, redirect_path, providers } = await req.json();
    if (!device_id) return errorResponse("device_id required", 400, origin);

    const redirectOrigin = origin || "https://bejacked.ai";
    const path = redirect_path || "/?terra=connected";
    const successUrl = `${redirectOrigin}${path}`;
    const failureUrl = `${redirectOrigin}${path.includes("?") ? "&" : "?"}terra=failed`;

    const res = await fetch("https://api.tryterra.co/v2/auth/generateWidgetSession", {
      method: "POST",
      headers: {
        "dev-id": getEnv("TERRA_DEV_ID")!,
        "x-api-key": getEnv("TERRA_API_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference_id: device_id,
        providers: (providers && providers.length ? providers : DEFAULT_PROVIDERS).join(","),
        language: "en",
        auth_success_redirect_url: successUrl,
        auth_failure_redirect_url: failureUrl,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return errorResponse(`Terra widget failed: ${text}`, 502, origin);
    }
    const data = await res.json();
    if (!data.url) return errorResponse("Terra did not return widget URL", 502, origin);

    return jsonResponse({ url: data.url, session_id: data.session_id }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to init Terra", 500, origin);
  }
};

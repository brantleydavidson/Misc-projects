import type { Context } from "@netlify/functions";

// Garmin Connect uses OAuth 1.0a
// Required env vars: GARMIN_CONSUMER_KEY, GARMIN_CONSUMER_SECRET

const GARMIN_REQUEST_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/request_token";
const GARMIN_AUTHORIZE_URL = "https://connect.garmin.com/oauthConfirm";
const GARMIN_ACCESS_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/access_token";

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function buildOAuthHeader(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  tokenSecret: string = "",
  extraParams: Record<string, string> = {}
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
    ...extraParams,
  };

  // Build signature base string
  const allParams = { ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = await hmacSha1(signingKey, baseString);

  oauthParams["oauth_signature"] = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

// In-memory token store (for production, use a database like Supabase)
// This simple approach stores request tokens temporarily during the OAuth flow
const pendingTokens = new Map<string, string>();

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const consumerKey = Deno.env.get("GARMIN_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("GARMIN_CONSUMER_SECRET");

  if (!consumerKey || !consumerSecret) {
    return new Response(
      JSON.stringify({
        error: "Garmin API not configured",
        setup_required: true,
        instructions:
          "Set GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET in Netlify env vars. Get these from developer.garmin.com.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { action, callback_url, oauth_token, oauth_verifier } = await req.json();

    if (action === "get_request_token") {
      // Step 1: Get a request token from Garmin
      const authHeader = await buildOAuthHeader(
        "POST",
        GARMIN_REQUEST_TOKEN_URL,
        consumerKey,
        consumerSecret
      );

      const response = await fetch(GARMIN_REQUEST_TOKEN_URL, {
        method: "POST",
        headers: { Authorization: authHeader },
      });

      if (!response.ok) {
        const errText = await response.text();
        return new Response(
          JSON.stringify({ error: `Garmin request token failed: ${errText}` }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const body = await response.text();
      const params = new URLSearchParams(body);
      const requestToken = params.get("oauth_token") || "";
      const requestTokenSecret = params.get("oauth_token_secret") || "";

      // Store the token secret temporarily (keyed by token)
      pendingTokens.set(requestToken, requestTokenSecret);

      // Build the authorization URL
      const authUrl = `${GARMIN_AUTHORIZE_URL}?oauth_token=${requestToken}`;

      return new Response(
        JSON.stringify({
          auth_url: authUrl,
          oauth_token: requestToken,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "exchange_token") {
      // Step 3: Exchange request token + verifier for access token
      if (!oauth_token || !oauth_verifier) {
        return new Response(
          JSON.stringify({ error: "Missing oauth_token or oauth_verifier" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Retrieve the stored token secret
      const tokenSecret = pendingTokens.get(oauth_token) || "";
      pendingTokens.delete(oauth_token);

      const authHeader = await buildOAuthHeader(
        "POST",
        GARMIN_ACCESS_TOKEN_URL,
        consumerKey,
        consumerSecret,
        tokenSecret,
        { oauth_token, oauth_verifier }
      );

      const response = await fetch(GARMIN_ACCESS_TOKEN_URL, {
        method: "POST",
        headers: { Authorization: authHeader },
      });

      if (!response.ok) {
        const errText = await response.text();
        return new Response(
          JSON.stringify({ error: `Garmin access token failed: ${errText}` }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const body = await response.text();
      const params = new URLSearchParams(body);
      const accessToken = params.get("oauth_token") || "";
      const accessTokenSecret = params.get("oauth_token_secret") || "";

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          access_token_secret: accessTokenSecret,
          connected: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'get_request_token' or 'exchange_token'" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

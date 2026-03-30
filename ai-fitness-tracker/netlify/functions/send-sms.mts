import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse, sanitizeString,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/send-sms
 * Body: { to: string, template: string, data?: Record<string, string>, device_id: string }
 *
 * Supported templates:
 *   - weigh_in_reminder: Morning weigh-in nudge
 *   - missed_checkin: Gentle nudge after no food logged
 *   - streak_milestone: Achievement celebration
 *   - custom: Send custom message (data.message required)
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

type SmsTemplate = 'weigh_in_reminder' | 'missed_checkin' | 'streak_milestone' | 'custom';

function renderSmsTemplate(template: SmsTemplate, data: Record<string, string> = {}): string {
  const name = data.name || 'there';

  switch (template) {
    case 'weigh_in_reminder':
      return `Hey ${name}, it's weigh-in day! Step on the scale and log it in JackedAI. Consistency > perfection. 💪`;

    case 'missed_checkin':
      return `Hey ${name}, APEX noticed you didn't log yesterday. No stress — just snap a meal when you're ready. jackedai.netlify.app/snap`;

    case 'streak_milestone':
      return `🔥 ${data.streak || '7'}-day streak! You've logged ${data.streak || '7'} days in a row, ${name}. Keep executing the protocol.`;

    case 'custom':
      return data.message || 'JackedAI: Check in with your coach today.';
  }
}

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const fromNumber = getEnv("TWILIO_PHONE_NUMBER");

  try {
    const body = await req.json();
    const to = sanitizeString(body.to || '', 20).replace(/[^\d+]/g, '');
    const template = body.template as SmsTemplate;
    const data = body.data || {};
    const deviceId = sanitizeString(body.device_id || '', 50);

    if (!to || to.length < 10) {
      return errorResponse("Valid phone number required (E.164 format, e.g. +1234567890)", 400, origin);
    }

    const validTemplates: SmsTemplate[] = ['weigh_in_reminder', 'missed_checkin', 'streak_milestone', 'custom'];
    if (!validTemplates.includes(template)) {
      return errorResponse("Invalid template", 400, origin);
    }

    // Rate limit: 10 SMS per hour per device
    if (deviceId) {
      const rl = checkRateLimit(deviceId, 'send-sms', { windowMs: 3600_000, maxRequests: 10 });
      if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);
    }

    const message = renderSmsTemplate(template, data);

    if (!accountSid || !authToken || !fromNumber) {
      // Dev mode: log but don't send
      console.log(`[SMS DEV] To: ${to} | Message: ${message}`);
      return jsonResponse({
        sent: false,
        dev_mode: true,
        message: "Twilio not configured. SMS logged to console.",
        preview: message,
      }, 200, origin);
    }

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', fromNumber);
    params.append('Body', message);

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      return errorResponse(`Twilio error: ${err}`, 502, origin);
    }

    const result = await res.json();
    return jsonResponse({ sent: true, sid: result.sid }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};

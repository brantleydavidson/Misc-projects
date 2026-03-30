import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse, sanitizeString,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/send-email
 * Body: { to: string, template: string, data?: Record<string, string>, device_id: string }
 *
 * Supported templates:
 *   - welcome: Welcome email after onboarding
 *   - weekly_report: Weekly macro/activity summary
 *   - streak_milestone: Achievement notification
 *   - missed_checkin: Gentle nudge after missed day
 *
 * Uses Resend API (RESEND_API_KEY env var).
 * If Resend is not configured, logs the email and returns success (for dev).
 */

type EmailTemplate = 'welcome' | 'weekly_report' | 'streak_milestone' | 'missed_checkin';

const FROM_EMAIL = 'JackedAI <noreply@jackedai.app>';

function renderTemplate(template: EmailTemplate, data: Record<string, string> = {}): { subject: string; html: string } {
  const name = data.name || 'there';

  switch (template) {
    case 'welcome':
      return {
        subject: 'Welcome to JackedAI — Your AI Coach Is Ready',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0A1628; color: #E2E8F0;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="background: linear-gradient(135deg, #00E5CC, #FF2D78); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 28px; margin: 0;">JackedAI</h1>
              <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Your AI Fitness Protocol</p>
            </div>
            <p>Hey ${name},</p>
            <p>Your APEX coach is locked and loaded. Here's what you can do right now:</p>
            <ul style="padding-left: 20px; line-height: 1.8;">
              <li><strong>Snap your meals</strong> — AI identifies food and tracks macros instantly</li>
              <li><strong>Talk to your coach</strong> — brainstorm targets, get meal advice, adjust your plan</li>
              <li><strong>Check in daily</strong> — log Garmin data, track trends over time</li>
            </ul>
            <p>Your targets are set based on sports science (ISSN guidelines). If they don't feel right, just tell your coach — APEX will adjust them for you.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://jackedai.netlify.app" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #00E5CC, #FF2D78); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">Open JackedAI</a>
            </div>
            <p style="color: #64748B; font-size: 12px; text-align: center;">Let's get jacked. — APEX</p>
          </div>`,
      };

    case 'weekly_report':
      return {
        subject: `Your Week in Review — ${data.week || 'This Week'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0A1628; color: #E2E8F0;">
            <h1 style="color: #00E5CC; font-size: 20px;">Weekly Report</h1>
            <p>Hey ${name}, here's how your week went:</p>
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin: 16px 0;">
              <table style="width: 100%; color: #E2E8F0; font-size: 14px;">
                <tr><td>Avg Calories</td><td style="text-align: right; font-weight: bold;">${data.avg_calories || '—'}</td></tr>
                <tr><td>Avg Protein</td><td style="text-align: right; font-weight: bold;">${data.avg_protein || '—'}g</td></tr>
                <tr><td>Avg Steps</td><td style="text-align: right; font-weight: bold;">${data.avg_steps || '—'}</td></tr>
                <tr><td>Workouts</td><td style="text-align: right; font-weight: bold;">${data.workouts || '0'}</td></tr>
                <tr><td>Days Logged</td><td style="text-align: right; font-weight: bold;">${data.days_logged || '0'}/7</td></tr>
                ${data.weight_change ? `<tr><td>Weight Change</td><td style="text-align: right; font-weight: bold; color: ${Number(data.weight_change) <= 0 ? '#22C55E' : '#EF4444'};">${data.weight_change} lbs</td></tr>` : ''}
              </table>
            </div>
            ${data.coach_note ? `<p style="font-style: italic; color: #94A3B8;">"${data.coach_note}"</p>` : ''}
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://jackedai.netlify.app/trends" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #00E5CC, #FF2D78); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">View Full Trends</a>
            </div>
          </div>`,
      };

    case 'streak_milestone':
      return {
        subject: `${data.streak || '7'}-Day Streak! Keep Going.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0A1628; color: #E2E8F0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 12px;">🔥</div>
            <h1 style="color: #FF2D78; font-size: 24px;">${data.streak}-Day Streak!</h1>
            <p>You've logged ${data.streak} days in a row. Consistency is the protocol — and you're executing.</p>
            <div style="margin: 24px 0;">
              <a href="https://jackedai.netlify.app" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #00E5CC, #FF2D78); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">Keep It Going</a>
            </div>
          </div>`,
      };

    case 'missed_checkin':
      return {
        subject: 'Hey — Your Coach Noticed You Were Quiet Yesterday',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0A1628; color: #E2E8F0;">
            <p>Hey ${name},</p>
            <p>No check-in yesterday — that's okay. One missed day doesn't reset anything.</p>
            <p>When you're ready, snap a meal or drop in for a quick chat. APEX is here.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="https://jackedai.netlify.app/snap" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #00E5CC, #FF2D78); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">Snap a Meal</a>
            </div>
            <p style="color: #64748B; font-size: 12px;">Don't want these? Update notification preferences in the app.</p>
          </div>`,
      };
  }
}

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const resendKey = getEnv("RESEND_API_KEY");

  try {
    const body = await req.json();
    const to = sanitizeString(body.to || '', 200);
    const template = body.template as EmailTemplate;
    const data = body.data || {};
    const deviceId = sanitizeString(body.device_id || '', 50);

    if (!to || !template) {
      return errorResponse("'to' and 'template' required", 400, origin);
    }

    const validTemplates: EmailTemplate[] = ['welcome', 'weekly_report', 'streak_milestone', 'missed_checkin'];
    if (!validTemplates.includes(template)) {
      return errorResponse("Invalid template", 400, origin);
    }

    // Rate limit: 5 emails per hour per device
    if (deviceId) {
      const rl = checkRateLimit(deviceId, 'send-email', { windowMs: 3600_000, maxRequests: 5 });
      if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);
    }

    const rendered = renderTemplate(template, data);

    if (!resendKey) {
      // Dev mode: log but don't send
      console.log(`[EMAIL DEV] To: ${to} | Subject: ${rendered.subject}`);
      return jsonResponse({
        sent: false,
        dev_mode: true,
        message: "RESEND_API_KEY not configured. Email logged to console.",
        subject: rendered.subject,
      }, 200, origin);
    }

    // Send via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: rendered.subject,
        html: rendered.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return errorResponse(`Email service error: ${err}`, 502, origin);
    }

    const result = await res.json();
    return jsonResponse({ sent: true, id: result.id }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};

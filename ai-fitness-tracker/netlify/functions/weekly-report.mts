import type { Context } from "@netlify/functions";
import { getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

/**
 * Weekly Report Generator
 *
 * Scheduled function — runs every Monday at 8am UTC.
 * Configure in netlify.toml:
 *   [functions."weekly-report"]
 *   schedule = "0 8 * * 1"
 *
 * For each user with an email, generates a weekly summary
 * and sends it via the send-email function.
 */

export default async (req: Request, _context: Context) => {
  // Allow both scheduled invocation and manual POST trigger
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY");
  const resendKey = getEnv("RESEND_API_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return errorResponse("Supabase not configured", 503);
  }

  try {
    // 1. Get all profiles with email addresses
    const profilesRes = await fetch(
      `${supabaseUrl}/rest/v1/ja_profiles?select=id,device_id,email,age,calorie_target,protein_target&email=not.is.null&onboarding_complete=eq.true&limit=500`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const profiles = await profilesRes.json();

    if (!Array.isArray(profiles) || profiles.length === 0) {
      return jsonResponse({ message: "No users with emails found", sent: 0 }, 200);
    }

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStart = weekAgo.toISOString().split('T')[0];
    const weekEnd = today.toISOString().split('T')[0];

    let sentCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
      try {
        // 2. Get food entries for the last 7 days
        const foodRes = await fetch(
          `${supabaseUrl}/rest/v1/ja_food_entries?select=calories,protein,carbs,fat,created_at&profile_id=eq.${profile.id}&created_at=gte.${weekStart}T00:00:00&created_at=lt.${weekEnd}T23:59:59`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );
        const foodEntries = await foodRes.json();

        // 3. Get activity data for the last 7 days
        const activityRes = await fetch(
          `${supabaseUrl}/rest/v1/ja_activity_logs?select=activity_data,log_date&profile_id=eq.${profile.id}&log_date=gte.${weekStart}&log_date=lte.${weekEnd}`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );
        const activityLogs = await activityRes.json();

        // 4. Calculate weekly stats
        const entries = Array.isArray(foodEntries) ? foodEntries : [];
        const activities = Array.isArray(activityLogs) ? activityLogs : [];

        // Group food entries by day to count logging days
        const foodDays = new Set(entries.map((e: any) => e.created_at?.split('T')[0]));
        const daysLogged = foodDays.size;

        const totalCals = entries.reduce((s: number, e: any) => s + (e.calories || 0), 0);
        const totalProtein = entries.reduce((s: number, e: any) => s + (e.protein || 0), 0);
        const avgCalories = daysLogged > 0 ? Math.round(totalCals / daysLogged) : 0;
        const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;

        // Steps
        const stepsData = activities
          .map((a: any) => a.activity_data?.steps)
          .filter((s: any) => s != null && s > 0);
        const avgSteps = stepsData.length > 0
          ? Math.round(stepsData.reduce((s: number, v: number) => s + v, 0) / stepsData.length)
          : 0;

        // Workouts
        const totalWorkouts = activities.reduce((s: number, a: any) => {
          return s + (a.activity_data?.workouts?.length || 0);
        }, 0);

        // Weight change
        const weights = activities
          .map((a: any) => ({ date: a.log_date, weight: a.activity_data?.weight_kg }))
          .filter((w: any) => w.weight != null && w.weight > 0)
          .sort((a: any, b: any) => a.date.localeCompare(b.date));

        let weightChange = '';
        if (weights.length >= 2) {
          const delta = weights[weights.length - 1].weight - weights[0].weight;
          const deltaLbs = Math.round(delta * 2.205 * 10) / 10;
          weightChange = `${deltaLbs > 0 ? '+' : ''}${deltaLbs}`;
        }

        // Skip users with zero activity this week
        if (daysLogged === 0 && activities.length === 0) continue;

        // 5. Send the email
        const weekLabel = `${weekStart} — ${weekEnd}`;
        const emailData = {
          name: profile.email.split('@')[0],
          week: weekLabel,
          avg_calories: avgCalories > 0 ? String(avgCalories) : '—',
          avg_protein: avgProtein > 0 ? String(avgProtein) : '—',
          avg_steps: avgSteps > 0 ? avgSteps.toLocaleString() : '—',
          workouts: String(totalWorkouts),
          days_logged: String(daysLogged),
          weight_change: weightChange,
          coach_note: getCoachNote(daysLogged, avgCalories, profile.calorie_target, avgProtein, profile.protein_target),
        };

        if (resendKey) {
          // Use Resend directly (faster than calling send-email function)
          const { subject, html } = renderWeeklyReport(emailData);
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: 'BeJacked <noreply@bejacked.ai>',
              to: [profile.email],
              subject,
              html,
            }),
          });
          sentCount++;
        } else {
          console.log(`[Weekly Report] Would send to ${profile.email}:`, emailData);
          sentCount++;
        }
      } catch (err: any) {
        errorCount++;
        console.error(`[Weekly Report] Error for ${profile.email}:`, err.message);
      }
    }

    return jsonResponse({
      message: `Weekly reports processed: ${sentCount} sent, ${errorCount} errors`,
      sent: sentCount,
      errors: errorCount,
      total_users: profiles.length,
    }, 200);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

function getCoachNote(
  daysLogged: number,
  avgCals: number,
  targetCals: number | null,
  avgProtein: number,
  targetProtein: number | null,
): string {
  if (daysLogged >= 6) return "Incredible consistency this week. That's how results are built — one day at a time.";
  if (daysLogged >= 4) return "Solid week of tracking. The days you log are the days you're in control.";
  if (daysLogged >= 2) return "A few days logged is better than none. Try to get to 5+ next week — momentum builds fast.";
  if (daysLogged === 0) return "Missing you this week. Even logging one meal a day makes a difference.";

  if (targetCals && avgCals > 0) {
    if (avgCals < targetCals * 0.85) return "You're running a solid deficit. Make sure you're getting enough protein to preserve muscle.";
    if (avgCals > targetCals * 1.1) return "Slightly over target this week — not a big deal. Let's tighten it up next week.";
  }

  return "Keep showing up. Consistency beats perfection every time.";
}

function renderWeeklyReport(data: Record<string, string>): { subject: string; html: string } {
  const name = data.name || 'there';
  return {
    subject: `Your Week in Review — ${data.week || 'This Week'}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0A1628; color: #E2E8F0;">
        <h1 style="color: #00E5CC; font-size: 20px;">Weekly Report</h1>
        <p>Hey ${name}, here's how your week went:</p>
        <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin: 16px 0;">
          <table style="width: 100%; color: #E2E8F0; font-size: 14px; border-collapse: collapse;">
            <tr><td style="padding: 4px 0;">Avg Calories</td><td style="text-align: right; font-weight: bold;">${data.avg_calories || '—'}</td></tr>
            <tr><td style="padding: 4px 0;">Avg Protein</td><td style="text-align: right; font-weight: bold;">${data.avg_protein || '—'}g</td></tr>
            <tr><td style="padding: 4px 0;">Avg Steps</td><td style="text-align: right; font-weight: bold;">${data.avg_steps || '—'}</td></tr>
            <tr><td style="padding: 4px 0;">Workouts</td><td style="text-align: right; font-weight: bold;">${data.workouts || '0'}</td></tr>
            <tr><td style="padding: 4px 0;">Days Logged</td><td style="text-align: right; font-weight: bold;">${data.days_logged || '0'}/7</td></tr>
            ${data.weight_change ? `<tr><td style="padding: 4px 0;">Weight Change</td><td style="text-align: right; font-weight: bold; color: ${Number(data.weight_change) <= 0 ? '#22C55E' : '#EF4444'};">${data.weight_change} lbs</td></tr>` : ''}
          </table>
        </div>
        ${data.coach_note ? `<p style="font-style: italic; color: #94A3B8;">"${data.coach_note}"</p>` : ''}
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://jackedai.netlify.app/trends" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #00E5CC, #FF2D78); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">View Full Trends</a>
        </div>
      </div>`,
  };
}

// Netlify scheduled function config (also needs netlify.toml entry)
export const config = {
  schedule: "0 8 * * 1", // Every Monday at 8am UTC
};

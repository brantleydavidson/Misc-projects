import type { Context } from "@netlify/functions";
import { getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

/**
 * Scheduled SMS Reminders
 *
 * Runs daily at 7am and 8pm UTC.
 * Configure in netlify.toml:
 *   [functions."sms-reminders"]
 *   schedule = "0 7,20 * * *"
 *
 * Morning (7am UTC / ~2am EST → adjust for user timezone):
 *   - Weigh-in reminders on the user's chosen weigh-in day
 *
 * Evening (8pm UTC / ~3pm EST):
 *   - Missed check-in nudges if no food logged today
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *           SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

export default async (req: Request, _context: Context) => {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY");
  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const fromNumber = getEnv("TWILIO_PHONE_NUMBER");

  if (!supabaseUrl || !supabaseKey) {
    return errorResponse("Supabase not configured", 503);
  }

  if (!accountSid || !authToken || !fromNumber) {
    return jsonResponse({ message: "Twilio not configured. Skipping SMS reminders.", sent: 0 }, 200);
  }

  try {
    const now = new Date();
    const hour = now.getUTCHours();
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...

    // Get profiles with phone numbers and SMS opted in
    const profilesRes = await fetch(
      `${supabaseUrl}/rest/v1/ja_profiles?select=id,device_id,phone,weekly_weigh_in_day,sms_opted_in&phone=not.is.null&sms_opted_in=eq.true&onboarding_complete=eq.true&limit=500`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const profiles = await profilesRes.json();

    if (!Array.isArray(profiles) || profiles.length === 0) {
      return jsonResponse({ message: "No users with phone numbers opted in", sent: 0 }, 200);
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
      try {
        if (hour < 12) {
          // Morning: Weigh-in reminders
          const weighDay = profile.weekly_weigh_in_day ?? 1; // Default Monday
          if (dayOfWeek !== weighDay) continue;

          await sendTwilioSms(
            accountSid, authToken, fromNumber,
            profile.phone,
            `Good morning! It's weigh-in day. Step on the scale and log it in BeJacked — tracking trends matters more than any single number. 💪`
          );
          sentCount++;
        } else {
          // Evening: Missed check-in nudges
          // Check if user logged any food today
          const foodRes = await fetch(
            `${supabaseUrl}/rest/v1/ja_food_entries?select=id&profile_id=eq.${profile.id}&created_at=gte.${today}T00:00:00&limit=1`,
            {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
              },
            }
          );
          const foods = await foodRes.json();

          if (Array.isArray(foods) && foods.length === 0) {
            await sendTwilioSms(
              accountSid, authToken, fromNumber,
              profile.phone,
              `Hey, APEX noticed no meals logged today. No pressure — just snap one meal before bed. Even one entry keeps the data flowing. 📸`
            );
            sentCount++;
          }
        }
      } catch (err: any) {
        errorCount++;
        console.error(`[SMS Reminder] Error for ${profile.phone}:`, err.message);
      }
    }

    return jsonResponse({
      message: `SMS reminders: ${sentCount} sent, ${errorCount} errors`,
      sent: sentCount,
      errors: errorCount,
      total_users: profiles.length,
      trigger: hour < 12 ? 'morning_weighin' : 'evening_checkin',
    }, 200);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
};

async function sendTwilioSms(
  accountSid: string, authToken: string, from: string,
  to: string, body: string
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', from);
  params.append('Body', body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio: ${err}`);
  }
}

export const config = {
  schedule: "0 7,20 * * *", // 7am and 8pm UTC daily
};

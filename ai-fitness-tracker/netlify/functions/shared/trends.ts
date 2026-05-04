/**
 * Historical trend computation for APEX Coach context
 * - Queries Supabase for 14-day food, activity, water data
 * - Computes averages, hit rates, patterns, and proactive insights
 * - Caches results in ja_trend_cache (recomputes if >6 hours stale)
 */

interface DayFood {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entry_count: number;
}

interface TrendSummary {
  days: number;
  avg_calories: number;
  avg_protein: number;
  avg_carbs: number;
  avg_fat: number;
  calorie_hit_rate: number; // fraction 0-1
  protein_hit_rate: number;
  weight_start: number | null;
  weight_end: number | null;
  weight_change: number | null;
  avg_steps: number | null;
  avg_sleep: number | null;
  avg_water_ml: number | null;
  workout_count: number;
  logging_days: number;
  weekday_avg_calories: number;
  weekend_avg_calories: number;
  weekday_avg_protein: number;
  weekend_avg_protein: number;
}

interface ProactiveInsight {
  type: 'warning' | 'info' | 'positive';
  message: string;
}

// ── Main entry: get cached or compute fresh trends ─────────────────

export async function getCachedOrComputeTrends(
  profileId: string,
  profile: { calorie_target?: number; protein_target?: number; water_target_liters?: number },
  supabaseUrl: string,
  supabaseKey: string,
): Promise<{ trends: string; insights: string }> {
  // Check cache
  const cacheRes = await fetch(
    `${supabaseUrl}/rest/v1/ja_trend_cache?profile_id=eq.${profileId}&select=summary_14d,computed_at`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
  );

  if (cacheRes.ok) {
    const rows = await cacheRes.json();
    if (rows.length > 0) {
      const cache = rows[0];
      const age = Date.now() - new Date(cache.computed_at).getTime();
      if (age < 6 * 60 * 60 * 1000 && cache.summary_14d) {
        // Cache is fresh
        const summary = cache.summary_14d as TrendSummary;
        return {
          trends: formatTrendsForPrompt(summary, profile),
          insights: formatInsightsForPrompt(computeInsights(summary, profile)),
        };
      }
    }
  }

  // Compute fresh
  const summary = await computeTrendSummary(profileId, 14, profile, supabaseUrl, supabaseKey);
  const insights = computeInsights(summary, profile);

  // Write cache (fire-and-forget)
  writeCache(profileId, summary, supabaseUrl, supabaseKey).catch(() => {});

  return {
    trends: formatTrendsForPrompt(summary, profile),
    insights: formatInsightsForPrompt(insights),
  };
}

// ── Compute trend summary from raw data ────────────────────────────

async function computeTrendSummary(
  profileId: string,
  days: number,
  profile: { calorie_target?: number; protein_target?: number; water_target_liters?: number },
  supabaseUrl: string,
  supabaseKey: string,
): Promise<TrendSummary> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const sinceDateStr = sinceStr.split('T')[0];

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  // Parallel queries
  const [foodRes, activityRes, waterRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/ja_food_entries?profile_id=eq.${profileId}&created_at=gte.${sinceStr}&select=calories,protein,carbs,fat,created_at`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/ja_activity_logs?profile_id=eq.${profileId}&log_date=gte.${sinceDateStr}&select=log_date,activity_data`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/ja_water_logs?profile_id=eq.${profileId}&log_date=gte.${sinceDateStr}&select=log_date,water_ml`, { headers }),
  ]);

  const foodEntries = foodRes.ok ? await foodRes.json() : [];
  const activityRows = activityRes.ok ? await activityRes.json() : [];
  const waterRows = waterRes.ok ? await waterRes.json() : [];

  // Aggregate food by day
  const foodByDay: Record<string, DayFood> = {};
  for (const entry of foodEntries) {
    const day = (entry.created_at || '').split('T')[0];
    if (!day) continue;
    if (!foodByDay[day]) foodByDay[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, entry_count: 0 };
    foodByDay[day].calories += entry.calories || 0;
    foodByDay[day].protein += entry.protein || 0;
    foodByDay[day].carbs += entry.carbs || 0;
    foodByDay[day].fat += entry.fat || 0;
    foodByDay[day].entry_count++;
  }

  const foodDays = Object.entries(foodByDay);
  const loggingDays = foodDays.filter(([, d]) => d.entry_count > 0).length;

  // Averages
  const totalCal = foodDays.reduce((s, [, d]) => s + d.calories, 0);
  const totalPro = foodDays.reduce((s, [, d]) => s + d.protein, 0);
  const totalCarb = foodDays.reduce((s, [, d]) => s + d.carbs, 0);
  const totalFat = foodDays.reduce((s, [, d]) => s + d.fat, 0);
  const n = loggingDays || 1;

  // Hit rates
  const calTarget = profile.calorie_target || 2000;
  const proTarget = profile.protein_target || 150;
  const calHits = foodDays.filter(([, d]) => d.calories >= calTarget * 0.9 && d.calories <= calTarget * 1.1).length;
  const proHits = foodDays.filter(([, d]) => d.protein >= proTarget * 0.9).length;

  // Weekday vs weekend
  const weekdayDays = foodDays.filter(([date]) => { const d = new Date(date + 'T12:00:00').getDay(); return d >= 1 && d <= 5; });
  const weekendDays = foodDays.filter(([date]) => { const d = new Date(date + 'T12:00:00').getDay(); return d === 0 || d === 6; });
  const wdCalAvg = weekdayDays.length ? weekdayDays.reduce((s, [, d]) => s + d.calories, 0) / weekdayDays.length : 0;
  const weCalAvg = weekendDays.length ? weekendDays.reduce((s, [, d]) => s + d.calories, 0) / weekendDays.length : 0;
  const wdProAvg = weekdayDays.length ? weekdayDays.reduce((s, [, d]) => s + d.protein, 0) / weekdayDays.length : 0;
  const weProAvg = weekendDays.length ? weekendDays.reduce((s, [, d]) => s + d.protein, 0) / weekendDays.length : 0;

  // Activity data — extract weights, steps, workouts
  let weights: { date: string; kg: number }[] = [];
  let totalSteps = 0;
  let stepsCount = 0;
  let totalSleep = 0;
  let sleepCount = 0;
  let workoutCount = 0;

  for (const row of activityRows) {
    const data = row.activity_data || {};
    if (data.weight_kg) weights.push({ date: row.log_date, kg: data.weight_kg });
    if (data.morning?.weight_kg) weights.push({ date: row.log_date, kg: data.morning.weight_kg });
    if (data.steps) { totalSteps += data.steps; stepsCount++; }
    if (data.sleep_hours) { totalSleep += data.sleep_hours; sleepCount++; }
    if (data.evening?.sleep_hours) { totalSleep += data.evening.sleep_hours; sleepCount++; }
    if (data.workouts?.length) workoutCount += data.workouts.length;
  }

  weights.sort((a, b) => a.date.localeCompare(b.date));

  // Water
  const waterDays = waterRows.filter((r: any) => r.water_ml > 0);
  const avgWater = waterDays.length ? waterDays.reduce((s: number, r: any) => s + r.water_ml, 0) / waterDays.length : null;

  return {
    days,
    avg_calories: Math.round(totalCal / n),
    avg_protein: Math.round(totalPro / n),
    avg_carbs: Math.round(totalCarb / n),
    avg_fat: Math.round(totalFat / n),
    calorie_hit_rate: loggingDays ? calHits / loggingDays : 0,
    protein_hit_rate: loggingDays ? proHits / loggingDays : 0,
    weight_start: weights.length >= 2 ? weights[0].kg : null,
    weight_end: weights.length >= 2 ? weights[weights.length - 1].kg : null,
    weight_change: weights.length >= 2 ? Math.round((weights[weights.length - 1].kg - weights[0].kg) * 10) / 10 : null,
    avg_steps: stepsCount ? Math.round(totalSteps / stepsCount) : null,
    avg_sleep: sleepCount ? Math.round(totalSleep / sleepCount * 10) / 10 : null,
    avg_water_ml: avgWater ? Math.round(avgWater) : null,
    workout_count: workoutCount,
    logging_days: loggingDays,
    weekday_avg_calories: Math.round(wdCalAvg),
    weekend_avg_calories: Math.round(weCalAvg),
    weekday_avg_protein: Math.round(wdProAvg),
    weekend_avg_protein: Math.round(weProAvg),
  };
}

// ── Proactive insights ─────────────────────────────────────────────

function computeInsights(
  summary: TrendSummary,
  profile: { calorie_target?: number; protein_target?: number; water_target_liters?: number },
): ProactiveInsight[] {
  const insights: ProactiveInsight[] = [];
  const calTarget = profile.calorie_target || 2000;
  const proTarget = profile.protein_target || 150;
  const waterTarget = (profile.water_target_liters || 3) * 1000;

  // Protein consistently under
  if (summary.protein_hit_rate < 0.5 && summary.logging_days >= 5) {
    const deficit = proTarget - summary.avg_protein;
    insights.push({
      type: 'warning',
      message: `Protein has been under target — averaging ${summary.avg_protein}g vs ${proTarget}g goal (${deficit}g short/day)`,
    });
  }

  // Calorie target missed consistently
  if (summary.calorie_hit_rate < 0.4 && summary.logging_days >= 5) {
    if (summary.avg_calories > calTarget * 1.1) {
      insights.push({ type: 'warning', message: `Averaging ${summary.avg_calories} cal/day — ${Math.round(summary.avg_calories - calTarget)} over target` });
    } else if (summary.avg_calories < calTarget * 0.85) {
      insights.push({ type: 'warning', message: `Averaging only ${summary.avg_calories} cal/day — ${Math.round(calTarget - summary.avg_calories)} under target. May be under-fueling.` });
    }
  }

  // Weight stalled
  if (summary.weight_change !== null && Math.abs(summary.weight_change) < 0.3 && summary.days >= 14) {
    insights.push({ type: 'info', message: `Weight has been flat (${summary.weight_change}kg change over ${summary.days} days) — may need to adjust targets` });
  }

  // Weekend pattern
  if (summary.weekday_avg_calories && summary.weekend_avg_calories) {
    const diff = summary.weekend_avg_calories - summary.weekday_avg_calories;
    if (diff > 400) {
      insights.push({ type: 'info', message: `Weekend calories average ${Math.round(diff)} higher than weekdays (${summary.weekend_avg_calories} vs ${summary.weekday_avg_calories})` });
    }
    const proDiff = summary.weekday_avg_protein - summary.weekend_avg_protein;
    if (proDiff > 30) {
      insights.push({ type: 'info', message: `Protein drops by ~${Math.round(proDiff)}g on weekends vs weekdays` });
    }
  }

  // Water low
  if (summary.avg_water_ml && summary.avg_water_ml < waterTarget * 0.6) {
    insights.push({ type: 'warning', message: `Water intake averaging ${summary.avg_water_ml}ml/day — only ${Math.round(summary.avg_water_ml / waterTarget * 100)}% of ${waterTarget}ml target` });
  }

  // Logging consistency
  if (summary.logging_days < summary.days * 0.5 && summary.days >= 7) {
    insights.push({ type: 'info', message: `Only ${summary.logging_days} of last ${summary.days} days logged — consistency helps accuracy` });
  }

  // Positive: good streak
  if (summary.protein_hit_rate > 0.8 && summary.logging_days >= 7) {
    insights.push({ type: 'positive', message: `Protein on target ${Math.round(summary.protein_hit_rate * 100)}% of days — strong consistency` });
  }

  return insights;
}

// ── Format for prompt ──────────────────────────────────────────────

function formatTrendsForPrompt(
  summary: TrendSummary,
  profile: { calorie_target?: number; protein_target?: number },
): string {
  if (summary.logging_days === 0) return '';

  const calTarget = profile.calorie_target || 2000;
  const proTarget = profile.protein_target || 150;

  let block = `
HISTORICAL TRENDS (last ${summary.days} days, ${summary.logging_days} days logged):
- Avg daily intake: ${summary.avg_calories} cal | ${summary.avg_protein}g protein | ${summary.avg_carbs}g carbs | ${summary.avg_fat}g fat
- Calorie target hit rate: ${Math.round(summary.calorie_hit_rate * 100)}% (target: ${calTarget})
- Protein target hit rate: ${Math.round(summary.protein_hit_rate * 100)}% (target: ${proTarget}g)`;

  if (summary.weight_start && summary.weight_end) {
    block += `\n- Weight trend: ${summary.weight_start}kg → ${summary.weight_end}kg (${summary.weight_change! > 0 ? '+' : ''}${summary.weight_change}kg)`;
  }
  if (summary.avg_steps) block += `\n- Avg daily steps: ${summary.avg_steps.toLocaleString()}`;
  if (summary.avg_sleep) block += `\n- Avg sleep: ${summary.avg_sleep} hrs`;
  if (summary.workout_count) block += `\n- Workouts: ${summary.workout_count} sessions`;
  if (summary.avg_water_ml) block += `\n- Avg water: ${summary.avg_water_ml}ml/day`;

  if (summary.weekday_avg_calories && summary.weekend_avg_calories) {
    const diff = Math.abs(summary.weekend_avg_calories - summary.weekday_avg_calories);
    if (diff > 200) {
      block += `\n- Pattern: Weekday avg ${summary.weekday_avg_calories} cal vs weekend ${summary.weekend_avg_calories} cal`;
    }
  }

  return block;
}

function formatInsightsForPrompt(insights: ProactiveInsight[]): string {
  if (!insights.length) return '';
  return `
PROACTIVE INSIGHTS (mention naturally if relevant, don't force):
${insights.map(i => `- ${i.message}`).join('\n')}`;
}

// ── Cache management ───────────────────────────────────────────────

async function writeCache(
  profileId: string,
  summary: TrendSummary,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  // Upsert via ON CONFLICT
  await fetch(`${supabaseUrl}/rest/v1/ja_trend_cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      profile_id: profileId,
      summary_14d: summary,
      computed_at: new Date().toISOString(),
    }),
  });
}

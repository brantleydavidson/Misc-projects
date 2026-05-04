import type { UserProfile } from '../types';

/**
 * BMR via Mifflin-St Jeor (most validated for general population).
 * If body_fat_pct is available, uses Katch-McArdle instead (better for lifters).
 */
export function calculateBMR(profile: UserProfile): number {
  const { biological_sex, current_weight_kg, height_cm, age } = profile;
  if (!current_weight_kg || !height_cm || !age) return 0;

  // Katch-McArdle if we have body fat data (more accurate for lifters)
  if (profile.body_fat_pct && profile.body_fat_pct > 0 && profile.body_fat_pct < 60) {
    const lbm_kg = current_weight_kg * (1 - profile.body_fat_pct / 100);
    return 370 + (21.6 * lbm_kg);
  }

  // Mifflin-St Jeor (standard fallback)
  if (biological_sex === 'female') {
    return (10 * current_weight_kg) + (6.25 * height_cm) - (5 * age) - 161;
  }
  return (10 * current_weight_kg) + (6.25 * height_cm) - (5 * age) + 5;
}

/**
 * Activity multiplier — conservative by default.
 * Research shows most people overestimate activity level.
 * Desk job + 4x lifting ≈ 1.4, not 1.55.
 */
export function getActivityMultiplier(profile: UserProfile): { multiplier: number; label: string } {
  const { job_type, exercise_frequency } = profile;
  const freq = exercise_frequency || 0;

  const isPhysicalJob = ['physical', 'manual', 'labor', 'construction', 'warehouse']
    .some(k => job_type?.toLowerCase().includes(k));
  const isOnFeet = job_type?.toLowerCase().includes('on_feet') ||
    job_type?.toLowerCase().includes('feet') ||
    job_type?.toLowerCase().includes('standing');

  // Base from job type
  let base = 1.2; // desk / sedentary
  if (isPhysicalJob) base = 1.5;
  else if (isOnFeet) base = 1.35;

  // Add for exercise — each session adds roughly 0.03-0.05 to the multiplier
  // This is more conservative than the traditional tiers
  const exerciseBonus = Math.min(freq, 7) * 0.04;

  const multiplier = Math.round((base + exerciseBonus) * 100) / 100;

  // Label
  let label = 'Sedentary';
  if (multiplier >= 1.7) label = 'Extremely Active';
  else if (multiplier >= 1.55) label = 'Very Active';
  else if (multiplier >= 1.4) label = 'Moderately Active';
  else if (multiplier >= 1.25) label = 'Lightly Active';

  return { multiplier, label };
}

export function calculateTDEE(profile: UserProfile): number {
  const bmr = calculateBMR(profile);
  const { multiplier } = getActivityMultiplier(profile);
  return Math.round(bmr * multiplier);
}

/**
 * Evidence-based macro calculation (ISSN guidelines):
 * - Deficit: percentage-based (15-25% of TDEE), not flat 500 cal
 * - Protein: 1g/lb of current bodyweight during a cut (ISSN: 1.6-2.2 g/kg)
 * - Fat: 0.35g/lb minimum for hormonal health, ~25-30% of calories
 * - Carbs: remainder after protein and fat
 * - Floor: never below 1200 cal (women) or 1500 cal (men)
 */
export function calculateMacros(profile: UserProfile): {
  calories: number; protein: number; carbs: number; fat: number;
} {
  const tdee = calculateTDEE(profile);
  const isFemale = profile.biological_sex === 'female';

  // Percentage-based deficit (more accurate than flat number)
  const deficitPct = profile.weight_loss_pace === 'aggressive' ? 0.25 :
    profile.weight_loss_pace === 'moderate' ? 0.22 : 0.18;

  const calorieFloor = isFemale ? 1200 : 1500;
  const calories = Math.max(calorieFloor, Math.round(tdee * (1 - deficitPct)));

  // Protein: 1g per lb of current bodyweight (gold standard during a cut)
  // Use current weight, not goal weight — you need protein to preserve current muscle mass
  const currentLbs = (profile.current_weight_kg || 80) * 2.205;
  const goalLbs = (profile.goal_weight_kg || profile.current_weight_kg || 80) * 2.205;
  // Use the higher of goal weight and 0.8x current weight to avoid too-low targets
  const proteinLbs = Math.max(goalLbs, currentLbs * 0.8);
  const protein = Math.round(proteinLbs);
  const proteinCals = protein * 4;

  // Fat: 0.35g per lb bodyweight (hormonal health floor), but also at least 20% of calories
  const fatFromWeight = Math.round(currentLbs * 0.35);
  const fatFromPct = Math.round((calories * 0.22) / 9); // 22% floor
  const fat = Math.max(fatFromWeight, fatFromPct);
  const fatCals = fat * 9;

  // Carbs: remainder — with a 100g minimum for training performance
  const remainingCals = calories - proteinCals - fatCals;
  const carbs = Math.round(Math.max(100, remainingCals / 4));

  // Safety check: if protein + fat exceed calories, reduce fat to percentage-based
  if (proteinCals + fatCals > calories * 0.85) {
    const adjustedFat = Math.round((calories * 0.25) / 9);
    const adjustedCarbCals = calories - proteinCals - (adjustedFat * 9);
    return {
      calories,
      protein,
      carbs: Math.round(Math.max(100, adjustedCarbCals / 4)),
      fat: adjustedFat,
    };
  }

  return { calories, protein, carbs, fat };
}

/**
 * Water target based on bodyweight + activity level.
 * Base: 35ml per kg (~0.5 oz per lb), plus 500ml per training day.
 */
export function calculateWaterTarget(profile: UserProfile): number {
  const weight = profile.current_weight_kg || 80;
  let liters = (weight * 35) / 1000; // 35ml per kg base

  // Add for training days
  const freq = profile.exercise_frequency || 0;
  liters += freq * 0.5; // 500ml per training day per week

  // Physical job bonus
  const isPhysicalJob = ['physical', 'manual', 'labor']
    .some(k => profile.job_type?.toLowerCase().includes(k));
  if (isPhysicalJob) liters += 0.75;

  // Cap between 2L and 6L
  liters = Math.max(2, Math.min(6, liters));
  return Math.round(liters * 10) / 10;
}

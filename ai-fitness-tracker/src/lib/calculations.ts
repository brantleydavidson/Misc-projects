import type { UserProfile } from '../types';

export function calculateBMR(profile: UserProfile): number {
  const { biological_sex, current_weight_kg, height_cm, age } = profile;
  if (!current_weight_kg || !height_cm || !age) return 0;

  if (biological_sex === 'female') {
    return (10 * current_weight_kg) + (6.25 * height_cm) - (5 * age) - 161;
  }
  // Default to male formula
  return (10 * current_weight_kg) + (6.25 * height_cm) - (5 * age) + 5;
}

export function getActivityMultiplier(profile: UserProfile): { multiplier: number; label: string } {
  const { job_type, exercise_frequency } = profile;
  const freq = exercise_frequency || 0;
  const isPhysicalJob = job_type?.toLowerCase().includes('physical') ||
    job_type?.toLowerCase().includes('manual') ||
    job_type?.toLowerCase().includes('labor') ||
    job_type?.toLowerCase().includes('construction') ||
    job_type?.toLowerCase().includes('warehouse');

  if (isPhysicalJob && freq >= 5) return { multiplier: 1.9, label: 'Extremely Active' };
  if (isPhysicalJob && freq >= 3) return { multiplier: 1.725, label: 'Very Active' };
  if (freq >= 4 || isPhysicalJob) return { multiplier: 1.55, label: 'Moderately Active' };
  if (freq >= 1) return { multiplier: 1.375, label: 'Lightly Active' };
  return { multiplier: 1.2, label: 'Sedentary' };
}

export function calculateTDEE(profile: UserProfile): number {
  const bmr = calculateBMR(profile);
  const { multiplier } = getActivityMultiplier(profile);
  return Math.round(bmr * multiplier);
}

export function calculateMacros(profile: UserProfile): {
  calories: number; protein: number; carbs: number; fat: number;
} {
  const tdee = calculateTDEE(profile);
  const deficit = profile.weight_loss_pace === 'aggressive' ? 750 :
    profile.weight_loss_pace === 'moderate' ? 600 : 500;
  const calories = Math.max(1200, tdee - deficit);

  // High protein for muscle preservation: 1g per lb of goal weight (or current if no goal)
  const targetWeightLbs = ((profile.goal_weight_kg || profile.current_weight_kg || 80) * 2.205);
  const protein = Math.round(targetWeightLbs); // 1g per lb
  const proteinCals = protein * 4;

  // Fat: ~25% of calories
  const fatCals = calories * 0.25;
  const fat = Math.round(fatCals / 9);

  // Remaining from carbs
  const carbCals = calories - proteinCals - fatCals;
  const carbs = Math.round(Math.max(50, carbCals / 4));

  return { calories: Math.round(calories), protein, carbs, fat };
}

export function calculateWaterTarget(profile: UserProfile): number {
  const weight = profile.current_weight_kg || 80;
  let liters = (weight * 35) / 1000; // 35ml per kg base
  const freq = profile.exercise_frequency || 0;
  liters += freq * 0.5 / 7 * 7; // ~500ml per workout
  // Physical job bonus
  const isPhysicalJob = profile.job_type?.toLowerCase().includes('physical') ||
    profile.job_type?.toLowerCase().includes('manual');
  if (isPhysicalJob) liters += 0.75;
  return Math.round(liters * 10) / 10;
}

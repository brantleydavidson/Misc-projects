/**
 * Food Memory System — Self-improving macro estimation
 *
 * Stores:
 * 1. Corrections: When user corrects AI estimates, we remember the delta
 * 2. Learned foods: Foods the user eats regularly with their verified macros
 * 3. Nutrition labels: Products where we've read exact nutrition data
 *
 * This data is sent as context to the AI on every food analysis,
 * so estimates improve per-user over time.
 */

import { supabase, isSupabaseAvailable } from './supabase';

const FOOD_MEMORY_KEY = 'jackedai_food_memory';

export interface FoodCorrection {
  id: string;
  original_name: string;
  corrected_name?: string;
  original_calories: number;
  corrected_calories: number;
  original_protein: number;
  corrected_protein: number;
  original_carbs: number;
  corrected_carbs: number;
  original_fat: number;
  corrected_fat: number;
  correction_note: string; // "bigger portion", "that was 2 servings", etc.
  created_at: string;
}

export interface LearnedFood {
  id: string;
  name: string;
  aliases: string[];        // "morning shake", "my usual coffee", etc.
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  serving_size?: string;    // "1 cup", "large bowl", etc.
  source: 'label' | 'usda' | 'user_verified' | 'ai_estimate';
  confidence: number;       // 0-1, higher = more reliable
  times_logged: number;
  last_logged: string;
  created_at: string;
}

export interface FoodMemory {
  corrections: FoodCorrection[];
  learned_foods: LearnedFood[];
}

function getMemory(): FoodMemory {
  try {
    const raw = localStorage.getItem(FOOD_MEMORY_KEY);
    return raw ? JSON.parse(raw) : { corrections: [], learned_foods: [] };
  } catch {
    return { corrections: [], learned_foods: [] };
  }
}

function saveMemory(memory: FoodMemory): void {
  localStorage.setItem(FOOD_MEMORY_KEY, JSON.stringify(memory));
  // Background sync to Supabase
  syncMemoryToSupabase(memory).catch(() => {});
}

/**
 * Record a correction when user adjusts AI estimates.
 */
export function addCorrection(
  original: { name: string; calories: number; protein: number; carbs: number; fat: number },
  corrected: { name?: string; calories: number; protein: number; carbs: number; fat: number },
  note: string
): void {
  const memory = getMemory();
  memory.corrections.push({
    id: crypto.randomUUID(),
    original_name: original.name,
    corrected_name: corrected.name,
    original_calories: original.calories,
    corrected_calories: corrected.calories,
    original_protein: original.protein,
    corrected_protein: corrected.protein,
    original_carbs: original.carbs,
    corrected_carbs: corrected.carbs,
    original_fat: original.fat,
    corrected_fat: corrected.fat,
    correction_note: note,
    created_at: new Date().toISOString(),
  });

  // Keep last 100 corrections
  if (memory.corrections.length > 100) {
    memory.corrections = memory.corrections.slice(-100);
  }

  // Auto-learn from corrections: if we've corrected the same food 2+ times, create/update a learned food
  autoLearnFromCorrections(memory, corrected.name || original.name);

  saveMemory(memory);
}

/**
 * Add or update a learned food (from nutrition labels, USDA, or user verification).
 */
export function learnFood(food: Omit<LearnedFood, 'id' | 'times_logged' | 'last_logged' | 'created_at'>): void {
  const memory = getMemory();
  const existing = memory.learned_foods.find(
    f => f.name.toLowerCase() === food.name.toLowerCase()
  );

  if (existing) {
    Object.assign(existing, food, {
      times_logged: existing.times_logged + 1,
      last_logged: new Date().toISOString(),
      // Upgrade confidence if new source is better
      confidence: Math.max(existing.confidence, food.confidence),
      source: sourceRank(food.source) > sourceRank(existing.source) ? food.source : existing.source,
    });
  } else {
    memory.learned_foods.push({
      ...food,
      id: crypto.randomUUID(),
      times_logged: 1,
      last_logged: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }

  // Keep top 200 learned foods (by recency)
  if (memory.learned_foods.length > 200) {
    memory.learned_foods.sort((a, b) => b.last_logged.localeCompare(a.last_logged));
    memory.learned_foods = memory.learned_foods.slice(0, 200);
  }

  saveMemory(memory);
}

/**
 * Record that a food was logged (bump frequency counter).
 */
export function bumpFoodFrequency(foodName: string): void {
  const memory = getMemory();
  const existing = memory.learned_foods.find(
    f => f.name.toLowerCase() === foodName.toLowerCase() ||
         f.aliases.some(a => a.toLowerCase() === foodName.toLowerCase())
  );
  if (existing) {
    existing.times_logged += 1;
    existing.last_logged = new Date().toISOString();
    saveMemory(memory);
  }
}

/**
 * Get context string for the AI prompt — recent corrections + frequently eaten foods.
 */
export function getFoodMemoryContext(): string {
  const memory = getMemory();
  const parts: string[] = [];

  // Recent corrections (last 20)
  const recentCorrections = memory.corrections.slice(-20);
  if (recentCorrections.length > 0) {
    parts.push('CORRECTION HISTORY (learn from these — the user corrected AI estimates):');
    for (const c of recentCorrections) {
      const calDelta = c.corrected_calories - c.original_calories;
      const sign = calDelta >= 0 ? '+' : '';
      parts.push(`- "${c.original_name}": AI said ${c.original_calories}cal/${c.original_protein}p/${c.original_carbs}c/${c.original_fat}f → User corrected to ${c.corrected_calories}cal/${c.corrected_protein}p/${c.corrected_carbs}c/${c.corrected_fat}f (${sign}${calDelta}cal). Note: "${c.correction_note}"`);
    }
    parts.push('');
  }

  // Top frequently eaten foods (by frequency, top 30)
  const topFoods = [...memory.learned_foods]
    .sort((a, b) => b.times_logged - a.times_logged)
    .slice(0, 30);

  if (topFoods.length > 0) {
    parts.push("USER'S KNOWN FOODS (verified macros — use these when you recognize the food):");
    for (const f of topFoods) {
      const src = f.source === 'label' ? '📋 label' : f.source === 'usda' ? '🔬 USDA' : f.source === 'user_verified' ? '✓ verified' : '≈ estimate';
      parts.push(`- "${f.name}"${f.serving_size ? ` (${f.serving_size})` : ''}: ${f.calories}cal | ${f.protein}p ${f.carbs}c ${f.fat}f [${src}, logged ${f.times_logged}x]`);
    }
    parts.push('');
  }

  // Correction patterns — detect systematic biases
  if (recentCorrections.length >= 5) {
    const avgCalDelta = recentCorrections.reduce((sum, c) => sum + (c.corrected_calories - c.original_calories), 0) / recentCorrections.length;
    if (Math.abs(avgCalDelta) > 50) {
      const direction = avgCalDelta > 0 ? 'underestimates' : 'overestimates';
      parts.push(`PATTERN DETECTED: Your estimates tend to ${direction.toUpperCase()} by ~${Math.abs(Math.round(avgCalDelta))} calories on average. Adjust accordingly.`);
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Get the full memory object (for Supabase sync or debugging).
 */
export function getFullMemory(): FoodMemory {
  return getMemory();
}

// ── Internal helpers ──────────────────────────────────────

function sourceRank(source: LearnedFood['source']): number {
  switch (source) {
    case 'label': return 4;
    case 'usda': return 3;
    case 'user_verified': return 2;
    case 'ai_estimate': return 1;
    default: return 0;
  }
}

function autoLearnFromCorrections(
  memory: FoodMemory,
  foodName: string,
): void {
  // Count corrections for this food
  const corrections = memory.corrections.filter(
    c => (c.corrected_name || c.original_name).toLowerCase() === foodName.toLowerCase()
  );

  if (corrections.length >= 2) {
    // Average the last 3 corrections for this food
    const recent = corrections.slice(-3);
    const avgCal = Math.round(recent.reduce((s, c) => s + c.corrected_calories, 0) / recent.length);
    const avgPro = Math.round(recent.reduce((s, c) => s + c.corrected_protein, 0) / recent.length);
    const avgCarb = Math.round(recent.reduce((s, c) => s + c.corrected_carbs, 0) / recent.length);
    const avgFat = Math.round(recent.reduce((s, c) => s + c.corrected_fat, 0) / recent.length);

    const existing = memory.learned_foods.find(
      f => f.name.toLowerCase() === foodName.toLowerCase()
    );

    if (existing) {
      existing.calories = avgCal;
      existing.protein = avgPro;
      existing.carbs = avgCarb;
      existing.fat = avgFat;
      existing.source = 'user_verified';
      existing.confidence = 0.9;
    } else {
      memory.learned_foods.push({
        id: crypto.randomUUID(),
        name: foodName,
        aliases: [],
        calories: avgCal,
        protein: avgPro,
        carbs: avgCarb,
        fat: avgFat,
        source: 'user_verified',
        confidence: 0.85,
        times_logged: corrections.length,
        last_logged: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
  }
}

async function syncMemoryToSupabase(memory: FoodMemory): Promise<void> {
  if (!isSupabaseAvailable()) return;

  const deviceId = localStorage.getItem('macrosnap_device_id');
  if (!deviceId) return;

  // Get profile ID
  const { data: profile } = await supabase!
    .from('ja_profiles')
    .select('id')
    .eq('device_id', deviceId)
    .single();

  if (!profile?.id) return;

  await supabase!
    .from('ja_food_memory')
    .upsert({
      profile_id: profile.id,
      corrections: memory.corrections,
      learned_foods: memory.learned_foods,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });
}

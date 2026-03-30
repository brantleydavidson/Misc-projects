import type { UserProfile, ChatMessage } from '../types';

const API_BASE = '/.netlify/functions';

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface FoodData {
  food_name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: number;
  ai_analysis: string;
  needs_clarification?: boolean;
  items?: { name: string; calories: number; protein: number; carbs: number; fat: number }[];
}

export interface AnalyzeFoodResponse {
  message: string;
  food_data: FoodData | null;
}

// Legacy single-shot (still works)
export async function analyzeFood(imageBase64: string, mealType: string, notes?: string): Promise<AnalyzeFoodResponse> {
  return post<AnalyzeFoodResponse>('analyze-food', {
    image: imageBase64,
    meal_type: mealType,
    notes,
  });
}

// Conversational food analysis
export interface FoodMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string; // base64 for the first message
}

export async function analyzeFoodChat(
  messages: FoodMessage[],
  mealType: string,
  foodMemory?: string,
  nutritionData?: NutritionResult[]
): Promise<AnalyzeFoodResponse> {
  return post<AnalyzeFoodResponse>('analyze-food', {
    messages,
    meal_type: mealType,
    food_memory: foodMemory,
    nutrition_data: nutritionData,
  });
}

export interface ChatResponse {
  message: string;
}

export async function sendChat(
  messages: ChatMessage[],
  profile: UserProfile,
  context?: { garminData?: unknown; todaySummary?: unknown }
): Promise<ChatResponse> {
  return post<ChatResponse>('chat', { messages, profile, context });
}

// Nutrition research
export interface NutritionResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  serving_size: string;
  source: 'usda' | 'usda_branded' | 'ai_research';
  confidence: number;
  usda_fdc_id?: number;
  brand?: string;
}

export async function lookupNutrition(foods: string[]): Promise<{ results: NutritionResult[] }> {
  return post<{ results: NutritionResult[] }>('nutrition-lookup', { foods });
}

export interface MealPlanResponse {
  plan: unknown;
  summary: string;
}

export async function generateMealPlan(profile: UserProfile): Promise<MealPlanResponse> {
  return post<MealPlanResponse>('meal-plan', { profile });
}

export interface OnboardingResponse {
  message: string;
}

export async function sendOnboarding(
  messages: ChatMessage[],
  collectedData: Record<string, unknown>,
  turn: number
): Promise<OnboardingResponse> {
  return post<OnboardingResponse>('onboarding', { messages, collectedData, turn });
}

export async function getGarminAuthUrl(): Promise<{ url: string }> {
  return post<{ url: string }>('garmin-auth', { action: 'get_auth_url' });
}

export async function syncGarminData(accessToken: string): Promise<unknown> {
  return post('garmin-sync', { access_token: accessToken });
}

// ── Usage & Tier ────────────────────────────────────────────────────

export type UsageAction = 'food_snap' | 'coach_message' | 'meal_plan' | 'nutrition_lookup';
export type Tier = 'free' | 'pro' | 'unlimited';

export interface UsageCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  tier: Tier;
  limits_overview: Record<string, number>;
}

export async function checkUsage(action: UsageAction): Promise<UsageCheckResult> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<UsageCheckResult>('check-usage', { device_id: deviceId, action });
}

export interface DiscountResult {
  valid: boolean;
  discount_pct?: number;
  grants_tier?: Tier;
  duration_days?: number;
  message: string;
}

export async function validateDiscount(code: string): Promise<DiscountResult> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<DiscountResult>('validate-discount', { code, device_id: deviceId });
}

// ── Email ───────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  template: 'welcome' | 'weekly_report' | 'streak_milestone' | 'missed_checkin',
  data?: Record<string, string>
): Promise<{ sent: boolean }> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<{ sent: boolean }>('send-email', { to, template, data, device_id: deviceId });
}

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
  context?: { garminData?: unknown; todaySummary?: unknown; targetHistory?: unknown }
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

// ── Barcode Scanning ────────────────────────────────────────────────

export interface BarcodeResult {
  found: boolean;
  source?: string;
  product_name?: string;
  brand?: string;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium_mg: number;
    serving_size: string;
  };
  image_url?: string;
  message?: string;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeResult> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<BarcodeResult>('barcode-lookup', { barcode, device_id: deviceId });
}

// ── Body Progress ──────────────────────────────────────────────────

export interface BodyProgressResult {
  analysis: string;
  type: 'comparison' | 'baseline';
  current_date: string;
  previous_date: string | null;
}

export async function analyzeBodyProgress(params: {
  current_photo: string;
  previous_photo?: string;
  current_date: string;
  previous_date?: string;
  current_weight_kg?: number;
  previous_weight_kg?: number;
  profile_summary?: string;
}): Promise<BodyProgressResult> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<BodyProgressResult>('body-progress', { ...params, device_id: deviceId });
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

// ── Stripe Checkout ────────────────────────────────────────────────

export interface CheckoutResult {
  url: string;
  session_id: string;
}

export async function createCheckout(plan: 'pro' | 'unlimited', discountCode?: string): Promise<CheckoutResult> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<CheckoutResult>('create-checkout', { plan, device_id: deviceId, discount_code: discountCode });
}

// ── SMS ────────────────────────────────────────────────────────────

export type SmsTemplate = 'weigh_in_reminder' | 'missed_checkin' | 'streak_milestone' | 'custom';

export async function sendSms(
  to: string,
  template: SmsTemplate,
  data?: Record<string, string>
): Promise<{ sent: boolean }> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<{ sent: boolean }>('send-sms', { to, template, data, device_id: deviceId });
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

// ── Eat Out / Restaurant ───────────────────────────────────────────

export interface Restaurant {
  place_id: string;
  name: string;
  address: string;
  rating: number | null;
  price_level: number | null;
  open_now: boolean | null;
  types: string[];
  lat: number;
  lng: number;
}

export async function searchNearbyRestaurants(
  lat: number, lng: number, query?: string
): Promise<{ restaurants: Restaurant[] }> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<{ restaurants: Restaurant[] }>('nearby-restaurants', { lat, lng, query, deviceId });
}

export async function getMealAdvice(
  restaurant: Restaurant | { name: string },
  profile: UserProfile,
  todaySummary: unknown,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<ChatResponse>('meal-advisor', { restaurant, profile, todaySummary, messages, deviceId });
}

// ── Data-first onboarding ───────────────────────────────────────────

export async function initTerraWidget(redirectPath = '/?terra=connected', email?: string): Promise<{ url: string; session_id: string }> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<{ url: string; session_id: string }>('terra-init', { device_id: deviceId, redirect_path: redirectPath, email });
}

export interface HealthBaseline {
  summary: string;
  window_days: number;
  metrics: Record<string, number | null>;
  patterns: string[];
  estimated_tdee: number | null;
  data_quality: { days_with_sleep: number; days_with_workouts: number; days_with_hrv: number };
  open_questions: string[];
}

export async function buildHealthBaseline(): Promise<{ baseline: HealthBaseline; user_model: unknown; days_with_data: number }> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post('health-baseline', { device_id: deviceId });
}

export interface OnboardingAgentReply {
  message: string;
  done: boolean;
  user_model: unknown;
  finish_summary: string | null;
}

export async function onboardingAgent(
  conversation: { role: 'user' | 'assistant'; content: string }[],
): Promise<OnboardingAgentReply> {
  const deviceId = localStorage.getItem('macrosnap_device_id') || '';
  return post<OnboardingAgentReply>('onboarding-agent', { device_id: deviceId, conversation });
}

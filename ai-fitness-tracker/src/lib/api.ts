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

export interface AnalyzeFoodResponse {
  food_name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: number;
  ai_analysis: string;
  items?: { name: string; calories: number; protein: number; carbs: number; fat: number }[];
}

export async function analyzeFood(imageBase64: string, mealType: string, notes?: string): Promise<AnalyzeFoodResponse> {
  return post<AnalyzeFoodResponse>('analyze-food', {
    image: imageBase64,
    meal_type: mealType,
    notes,
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

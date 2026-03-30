import type { UserProfile, FoodEntry, GarminData, ChatMessage } from '../types';

const KEYS = {
  PROFILE: 'macrosnap_profile',
  DEVICE_ID: 'macrosnap_device_id',
  FOOD_LOG: 'macrosnap_food_log',
  WATER_LOG: 'macrosnap_water_log',
  GARMIN: 'macrosnap_garmin',
  CHAT: 'macrosnap_chat',
  MEAL_PLAN: 'macrosnap_meal_plan',
} as const;

function getDeviceId(): string {
  let id = localStorage.getItem(KEYS.DEVICE_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEYS.DEVICE_ID, id);
  }
  return id;
}

function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Profile
export function getProfile(): UserProfile {
  return getJSON<UserProfile>(KEYS.PROFILE, { device_id: getDeviceId() });
}

export function saveProfile(profile: Partial<UserProfile>): UserProfile {
  const current = getProfile();
  const updated = { ...current, ...profile, device_id: getDeviceId() };
  setJSON(KEYS.PROFILE, updated);
  return updated;
}

// Food entries (keyed by date)
function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function getFoodEntries(date?: string): FoodEntry[] {
  const log = getJSON<Record<string, FoodEntry[]>>(KEYS.FOOD_LOG, {});
  return log[date || todayKey()] || [];
}

export function addFoodEntry(entry: FoodEntry, date?: string): FoodEntry[] {
  const log = getJSON<Record<string, FoodEntry[]>>(KEYS.FOOD_LOG, {});
  const key = date || todayKey();
  if (!log[key]) log[key] = [];
  entry.id = crypto.randomUUID();
  entry.created_at = new Date().toISOString();
  log[key].push(entry);
  setJSON(KEYS.FOOD_LOG, log);
  return log[key];
}

export function removeFoodEntry(entryId: string, date?: string): FoodEntry[] {
  const log = getJSON<Record<string, FoodEntry[]>>(KEYS.FOOD_LOG, {});
  const key = date || todayKey();
  log[key] = (log[key] || []).filter(e => e.id !== entryId);
  setJSON(KEYS.FOOD_LOG, log);
  return log[key];
}

// Water tracking (ml per day)
export function getWaterIntake(date?: string): number {
  const log = getJSON<Record<string, number>>(KEYS.WATER_LOG, {});
  return log[date || todayKey()] || 0;
}

export function addWater(ml: number, date?: string): number {
  const log = getJSON<Record<string, number>>(KEYS.WATER_LOG, {});
  const key = date || todayKey();
  log[key] = (log[key] || 0) + ml;
  setJSON(KEYS.WATER_LOG, log);
  return log[key];
}

// Garmin data
export function getGarminData(): GarminData | null {
  return getJSON<GarminData | null>(KEYS.GARMIN, null);
}

export function saveGarminData(data: GarminData): void {
  setJSON(KEYS.GARMIN, { ...data, last_synced: new Date().toISOString() });
}

// Chat messages
export function getChatMessages(): ChatMessage[] {
  return getJSON<ChatMessage[]>(KEYS.CHAT, []);
}

export function addChatMessage(msg: ChatMessage): ChatMessage[] {
  const messages = getChatMessages();
  msg.id = crypto.randomUUID();
  msg.created_at = new Date().toISOString();
  messages.push(msg);
  setJSON(KEYS.CHAT, messages);
  return messages;
}

export function clearChat(): void {
  setJSON(KEYS.CHAT, []);
}

// Meal plan
export function getMealPlan(): unknown | null {
  return getJSON(KEYS.MEAL_PLAN, null);
}

export function saveMealPlan(plan: unknown): void {
  setJSON(KEYS.MEAL_PLAN, plan);
}

// Daily summary
export function getDailySummary(date?: string): {
  calories: number; protein: number; carbs: number; fat: number;
  entries: FoodEntry[]; water_ml: number;
} {
  const entries = getFoodEntries(date);
  const water_ml = getWaterIntake(date);
  return {
    calories: entries.reduce((s, e) => s + e.calories, 0),
    protein: entries.reduce((s, e) => s + e.protein, 0),
    carbs: entries.reduce((s, e) => s + e.carbs, 0),
    fat: entries.reduce((s, e) => s + e.fat, 0),
    entries,
    water_ml,
  };
}

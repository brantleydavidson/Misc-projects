import type { UserProfile, FoodEntry, GarminData, ChatMessage, ReminderSchedule, WorkoutEntry } from '../types';
import { DEFAULT_REMINDERS } from '../types';
import * as db from './db';

const KEYS = {
  PROFILE: 'macrosnap_profile',
  DEVICE_ID: 'macrosnap_device_id',
  FOOD_LOG: 'macrosnap_food_log',
  WATER_LOG: 'macrosnap_water_log',
  ACTIVITY_LOG: 'macrosnap_activity_log',  // date-keyed activity
  GARMIN: 'macrosnap_garmin',              // legacy compat
  CHAT: 'macrosnap_chat',
  MEAL_PLAN: 'macrosnap_meal_plan',
  REMINDERS: 'macrosnap_reminders',
  REMINDER_TIMERS: 'macrosnap_reminder_timers',
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

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Profile ────────────────────────────────────────────────────────
export function getProfile(): UserProfile {
  return getJSON<UserProfile>(KEYS.PROFILE, { device_id: getDeviceId() });
}

export function saveProfile(profile: Partial<UserProfile>): UserProfile {
  const current = getProfile();
  const updated = { ...current, ...profile, device_id: getDeviceId() };
  setJSON(KEYS.PROFILE, updated);
  // Background sync to Supabase
  db.upsertProfile(updated).catch(() => {});
  return updated;
}

// ── Food entries (date-keyed) ──────────────────────────────────────
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
  // Sync to Supabase
  db.syncFoodEntries(key, log[key]).catch(() => {});
  return log[key];
}

export function removeFoodEntry(entryId: string, date?: string): FoodEntry[] {
  const log = getJSON<Record<string, FoodEntry[]>>(KEYS.FOOD_LOG, {});
  const key = date || todayKey();
  log[key] = (log[key] || []).filter(e => e.id !== entryId);
  setJSON(KEYS.FOOD_LOG, log);
  return log[key];
}

// ── Water tracking (ml per day) ────────────────────────────────────
export function getWaterIntake(date?: string): number {
  const log = getJSON<Record<string, number>>(KEYS.WATER_LOG, {});
  return log[date || todayKey()] || 0;
}

export function addWater(ml: number, date?: string): number {
  const log = getJSON<Record<string, number>>(KEYS.WATER_LOG, {});
  const key = date || todayKey();
  log[key] = (log[key] || 0) + ml;
  setJSON(KEYS.WATER_LOG, log);
  // Sync to Supabase
  db.syncWater(key, log[key]).catch(() => {});
  return log[key];
}

// ── Activity / Garmin data (date-keyed) ────────────────────────────
export function getActivityData(date?: string): GarminData {
  const log = getJSON<Record<string, GarminData>>(KEYS.ACTIVITY_LOG, {});
  return log[date || todayKey()] || {};
}

export function saveActivityData(data: Partial<GarminData>, date?: string): GarminData {
  const log = getJSON<Record<string, GarminData>>(KEYS.ACTIVITY_LOG, {});
  const key = date || todayKey();
  const current = log[key] || {};
  const updated = { ...current, ...data, last_synced: new Date().toISOString() };
  log[key] = updated;
  setJSON(KEYS.ACTIVITY_LOG, log);
  setJSON(KEYS.GARMIN, updated);
  // Sync to Supabase
  db.syncActivityData(key, updated).catch(() => {});
  return updated;
}

export function addWorkout(workout: WorkoutEntry, date?: string): GarminData {
  const activity = getActivityData(date);
  const workouts = activity.workouts || [];
  workout.id = crypto.randomUUID();
  workout.created_at = new Date().toISOString();
  workouts.push(workout);
  // Auto-update calories_active with the workout
  const totalWorkoutCals = workouts.reduce((s, w) => s + (w.calories_burned || 0), 0);
  return saveActivityData({
    workouts,
    calories_active: totalWorkoutCals,
    calories_burned: totalWorkoutCals,
  }, date);
}

export function removeWorkout(workoutId: string, date?: string): GarminData {
  const activity = getActivityData(date);
  const workouts = (activity.workouts || []).filter(w => w.id !== workoutId);
  const totalWorkoutCals = workouts.reduce((s, w) => s + (w.calories_burned || 0), 0);
  return saveActivityData({
    workouts,
    calories_active: totalWorkoutCals,
    calories_burned: totalWorkoutCals,
  }, date);
}

export function markCheckIn(period: 'morning' | 'midday' | 'evening', date?: string): GarminData {
  const activity = getActivityData(date);
  const status = activity.check_ins_today || { morning: false, midday: false, evening: false };
  status[period] = true;
  return saveActivityData({ check_ins_today: status }, date);
}

export function getCheckInStatus(date?: string): { morning: boolean; midday: boolean; evening: boolean } {
  const activity = getActivityData(date);
  return activity.check_ins_today || { morning: false, midday: false, evening: false };
}

// Legacy compat
export function getGarminData(): GarminData | null {
  const today = getActivityData();
  if (Object.keys(today).length > 1) return today;
  return getJSON<GarminData | null>(KEYS.GARMIN, null);
}

export function saveGarminData(data: GarminData): void {
  saveActivityData(data);
}

// ── Reminders ──────────────────────────────────────────────────────
export function getReminders(): ReminderSchedule[] {
  const saved = getJSON<ReminderSchedule[] | null>(KEYS.REMINDERS, null);
  if (saved) return saved;
  setJSON(KEYS.REMINDERS, DEFAULT_REMINDERS);
  return DEFAULT_REMINDERS;
}

export function saveReminders(reminders: ReminderSchedule[]): void {
  setJSON(KEYS.REMINDERS, reminders);
}

export function updateReminder(id: string, updates: Partial<ReminderSchedule>): ReminderSchedule[] {
  const reminders = getReminders();
  const idx = reminders.findIndex(r => r.id === id);
  if (idx >= 0) {
    reminders[idx] = { ...reminders[idx], ...updates };
  }
  saveReminders(reminders);
  return reminders;
}

// ── Chat messages ──────────────────────────────────────────────────
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

// ── Meal plan ──────────────────────────────────────────────────────
export function getMealPlan(): unknown | null {
  return getJSON(KEYS.MEAL_PLAN, null);
}

export function saveMealPlan(plan: unknown): void {
  setJSON(KEYS.MEAL_PLAN, plan);
}

// ── Daily summary ──────────────────────────────────────────────────
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

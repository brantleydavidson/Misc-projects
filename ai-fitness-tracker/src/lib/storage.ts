import type { UserProfile, FoodEntry, GarminData, ChatMessage, ReminderSchedule, WorkoutEntry, BodyPhoto } from '../types';
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
  BODY_PHOTOS: 'macrosnap_body_photos',
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

// ── Historical data (for Trends page) ─────────────────────────────
export interface DaySnapshot {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
  steps?: number;
  calories_active?: number;
  sleep_hours?: number;
  heart_rate_resting?: number;
  body_battery_morning?: number;
  stress_level?: number;
  hrv_status?: number;
  weight_kg?: number;
  workouts: number;
}

/** Get historical snapshots for a date range (last N days). */
export function getHistoricalData(days: number = 14): DaySnapshot[] {
  const foodLog = getJSON<Record<string, FoodEntry[]>>(KEYS.FOOD_LOG, {});
  const waterLog = getJSON<Record<string, number>>(KEYS.WATER_LOG, {});
  const activityLog = getJSON<Record<string, GarminData>>(KEYS.ACTIVITY_LOG, {});

  const snapshots: DaySnapshot[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];

    const entries = foodLog[key] || [];
    const water = waterLog[key] || 0;
    const activity = activityLog[key] || {};

    snapshots.push({
      date: key,
      calories: entries.reduce((s, e) => s + e.calories, 0),
      protein: entries.reduce((s, e) => s + e.protein, 0),
      carbs: entries.reduce((s, e) => s + e.carbs, 0),
      fat: entries.reduce((s, e) => s + e.fat, 0),
      water_ml: water,
      steps: activity.steps,
      calories_active: activity.calories_active || activity.calories_burned,
      sleep_hours: activity.sleep_hours,
      heart_rate_resting: activity.heart_rate_resting,
      body_battery_morning: activity.body_battery_morning || activity.body_battery,
      stress_level: activity.stress_level,
      hrv_status: activity.hrv_status,
      weight_kg: activity.weight_kg,
      workouts: (activity.workouts || []).length,
    });
  }

  return snapshots;
}

/** Get all dates that have any data (for streak calculation etc.) */
export function getActiveDates(): string[] {
  const foodLog = getJSON<Record<string, FoodEntry[]>>(KEYS.FOOD_LOG, {});
  const activityLog = getJSON<Record<string, GarminData>>(KEYS.ACTIVITY_LOG, {});
  const dates = new Set([...Object.keys(foodLog), ...Object.keys(activityLog)]);
  return [...dates].sort();
}

// ── Body Progress Photos ─────────────────────────────────────────

export function getBodyPhotos(date?: string): BodyPhoto[] {
  const all = getJSON<Record<string, BodyPhoto[]>>(KEYS.BODY_PHOTOS, {});
  return all[date || todayKey()] || [];
}

export function getAllBodyPhotos(): Record<string, BodyPhoto[]> {
  return getJSON<Record<string, BodyPhoto[]>>(KEYS.BODY_PHOTOS, {});
}

export function addBodyPhoto(photo: Omit<BodyPhoto, 'id' | 'created_at'>): BodyPhoto {
  const all = getJSON<Record<string, BodyPhoto[]>>(KEYS.BODY_PHOTOS, {});
  const dateKey = photo.date || todayKey();
  if (!all[dateKey]) all[dateKey] = [];

  const entry: BodyPhoto = {
    ...photo,
    date: dateKey,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };

  // Replace existing photo of same angle for that day (only one per angle per day)
  all[dateKey] = all[dateKey].filter(p => p.angle !== photo.angle);
  all[dateKey].push(entry);
  setJSON(KEYS.BODY_PHOTOS, all);
  return entry;
}

export function removeBodyPhoto(id: string, date?: string): void {
  const all = getJSON<Record<string, BodyPhoto[]>>(KEYS.BODY_PHOTOS, {});
  const key = date || todayKey();
  if (all[key]) {
    all[key] = all[key].filter(p => p.id !== id);
    setJSON(KEYS.BODY_PHOTOS, all);
  }
}

export function getBodyPhotoDates(): string[] {
  const all = getJSON<Record<string, BodyPhoto[]>>(KEYS.BODY_PHOTOS, {});
  return Object.keys(all).filter(k => all[k].length > 0).sort();
}

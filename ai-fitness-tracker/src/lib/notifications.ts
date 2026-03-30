import type { ReminderSchedule } from '../types';
import { getReminders } from './storage';

// ── Service Worker Registration ────────────────────────────────────

let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    console.log('[App] Service Worker registered');
    return reg;
  } catch (err) {
    console.error('[App] Service Worker registration failed:', err);
    return null;
  }
}

// ── Permission ─────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ── Schedule via Service Worker (survives tab close) ───────────────

export function scheduleAllReminders() {
  const reminders = getReminders();

  // Try service worker first (survives tab close)
  if (swRegistration?.active) {
    swRegistration.active.postMessage({
      type: 'SCHEDULE_ALL_REMINDERS',
      reminders,
    });
    console.log('[App] Reminders scheduled via Service Worker');
    return;
  }

  // Fallback: direct notifications (only while tab is open)
  scheduleDirectReminders(reminders);
}

// ── Fallback: setTimeout-based (tab must be open) ──────────────────

let directTimers: ReturnType<typeof setTimeout>[] = [];

function scheduleDirectReminders(reminders: ReminderSchedule[]) {
  directTimers.forEach(t => clearTimeout(t));
  directTimers = [];

  const now = new Date();

  reminders.forEach(reminder => {
    if (!reminder.enabled) return;
    if (reminder.days.length > 0 && !reminder.days.includes(now.getDay())) return;

    const [hours, minutes] = reminder.time.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const delay = target.getTime() - now.getTime();

    const timer = setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification(reminder.title, {
          body: reminder.body,
          icon: '/favicon.svg',
          tag: reminder.id,
        });
      }
    }, delay);

    directTimers.push(timer);
  });

  console.log('[App] Reminders scheduled via setTimeout fallback');
}

export function clearAllReminders() {
  directTimers.forEach(t => clearTimeout(t));
  directTimers = [];
}

// ── Check-in helpers ───────────────────────────────────────────────

export function getCurrentCheckInPeriod(): 'morning' | 'midday' | 'evening' | null {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 23) return 'evening';
  return null;
}

export function getCheckInNudge(checkIns: { morning: boolean; midday: boolean; evening: boolean }): string | null {
  const period = getCurrentCheckInPeriod();
  if (!period) return null;

  if (period === 'morning' && !checkIns.morning) {
    return 'Log your morning stats — sleep, resting HR, body battery, weight';
  }
  if (period === 'midday' && !checkIns.midday) {
    return 'Midday check-in — update steps, workouts, and active minutes';
  }
  if (period === 'evening' && !checkIns.evening) {
    return 'Evening wrap-up — final steps, calories burned, stress level';
  }
  return null;
}

// ── Field definitions per check-in period ──────────────────────────

export const MORNING_FIELDS = [
  { key: 'sleep_hours', label: 'Sleep Hours', icon: 'moon', step: '0.1', placeholder: '7.5' },
  { key: 'sleep_score', label: 'Sleep Score', icon: 'star', placeholder: '82' },
  { key: 'sleep_deep_hours', label: 'Deep Sleep (hrs)', icon: 'moon', step: '0.1', placeholder: '1.5' },
  { key: 'sleep_rem_hours', label: 'REM Sleep (hrs)', icon: 'moon', step: '0.1', placeholder: '2.0' },
  { key: 'heart_rate_resting', label: 'Resting HR', icon: 'heart', placeholder: '58' },
  { key: 'hrv_status', label: 'HRV (ms)', icon: 'activity', placeholder: '45' },
  { key: 'body_battery_morning', label: 'Body Battery', icon: 'battery', placeholder: '75' },
  { key: 'spo2', label: 'SpO2 %', icon: 'wind', placeholder: '97' },
  { key: 'weight_kg', label: 'Weight (kg)', icon: 'scale', step: '0.1', placeholder: '82.5' },
  { key: 'body_fat_pct', label: 'Body Fat %', icon: 'percent', step: '0.1', placeholder: '18.5' },
] as const;

export const MIDDAY_FIELDS = [
  { key: 'steps', label: 'Steps So Far', icon: 'footprints', placeholder: '5000' },
  { key: 'active_minutes', label: 'Active Minutes', icon: 'timer', placeholder: '30' },
  { key: 'calories_active', label: 'Active Calories', icon: 'flame', placeholder: '250' },
  { key: 'heart_rate_avg', label: 'Avg HR Today', icon: 'heart', placeholder: '72' },
  { key: 'body_battery_current', label: 'Body Battery Now', icon: 'battery', placeholder: '50' },
  { key: 'stress_level', label: 'Stress Level', icon: 'brain', placeholder: '35' },
  { key: 'floors_climbed', label: 'Floors Climbed', icon: 'arrow-up', placeholder: '8' },
  { key: 'distance_km', label: 'Distance (km)', icon: 'map', step: '0.1', placeholder: '3.2' },
] as const;

export const EVENING_FIELDS = [
  { key: 'steps', label: 'Total Steps', icon: 'footprints', placeholder: '10000' },
  { key: 'calories_total', label: 'Total Calories Burned', icon: 'flame', placeholder: '2400' },
  { key: 'calories_active', label: 'Active Calories', icon: 'zap', placeholder: '500' },
  { key: 'active_minutes', label: 'Total Active Minutes', icon: 'timer', placeholder: '45' },
  { key: 'intensity_minutes_moderate', label: 'Moderate Intensity (min)', icon: 'activity', placeholder: '25' },
  { key: 'intensity_minutes_vigorous', label: 'Vigorous Intensity (min)', icon: 'flame', placeholder: '15' },
  { key: 'heart_rate_avg', label: 'Avg HR Today', icon: 'heart', placeholder: '68' },
  { key: 'heart_rate_max', label: 'Max HR Today', icon: 'heart', placeholder: '155' },
  { key: 'stress_level', label: 'Avg Stress Level', icon: 'brain', placeholder: '32' },
  { key: 'floors_climbed', label: 'Total Floors', icon: 'arrow-up', placeholder: '12' },
  { key: 'distance_km', label: 'Total Distance (km)', icon: 'map', step: '0.1', placeholder: '6.5' },
  { key: 'respiration_rate', label: 'Respiration Rate', icon: 'wind', placeholder: '16' },
] as const;

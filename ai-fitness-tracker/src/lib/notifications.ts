import type { ReminderSchedule } from '../types';
import { getReminders } from './storage';

let scheduledTimers: ReturnType<typeof setTimeout>[] = [];

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

function sendNotification(title: string, body: string, tag: string) {
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    tag,  // prevents duplicates
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    requireInteraction: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  // Auto-close after 10 seconds
  setTimeout(() => notification.close(), 10000);
}

function msUntilTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

function shouldFireToday(reminder: ReminderSchedule): boolean {
  if (!reminder.enabled) return false;
  if (reminder.days.length === 0) return true; // every day
  const today = new Date().getDay();
  return reminder.days.includes(today);
}

export function scheduleAllReminders() {
  // Clear existing timers
  clearAllReminders();

  const reminders = getReminders();

  reminders.forEach(reminder => {
    if (!shouldFireToday(reminder)) return;

    const ms = msUntilTime(reminder.time);

    const timer = setTimeout(() => {
      sendNotification(reminder.title, reminder.body, reminder.id);
      // Reschedule for tomorrow
      const nextTimer = setTimeout(() => {
        scheduleAllReminders(); // re-evaluate all
      }, 24 * 60 * 60 * 1000);
      scheduledTimers.push(nextTimer);
    }, ms);

    scheduledTimers.push(timer);
  });
}

export function clearAllReminders() {
  scheduledTimers.forEach(t => clearTimeout(t));
  scheduledTimers = [];
}

// Get which check-in is "due" right now based on time of day
export function getCurrentCheckInPeriod(): 'morning' | 'midday' | 'evening' | null {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 23) return 'evening';
  return null;
}

// Get a friendly nudge message based on what's missing
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

  // Show next upcoming
  if (period === 'morning' && checkIns.morning && !checkIns.midday) {
    return null; // Morning done, midday not yet
  }
  if (period === 'midday' && checkIns.midday && !checkIns.evening) {
    return null;
  }

  return null;
}

// Fields that belong to each check-in period
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

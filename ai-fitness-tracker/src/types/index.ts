export interface UserProfile {
  id?: string;
  device_id: string;
  // Section 1 - Stats
  age?: number;
  biological_sex?: 'male' | 'female';
  height_cm?: number;
  current_weight_kg?: number;
  goal_weight_kg?: number;
  goal_description?: string;
  weight_loss_pace?: 'steady' | 'moderate' | 'aggressive';
  body_fat_pct?: number;           // estimated body fat % (for Katch-McArdle BMR)
  // Section 2 - Lifestyle
  job_type?: string;
  exercise_frequency?: number;
  exercise_types?: string[];
  sleep_hours?: number;
  stress_level?: 'low' | 'moderate' | 'high';
  alcohol_per_week?: string;
  // Section 3 - Food Preferences
  favorite_meals?: string[];
  hated_foods?: string[];
  dietary_restrictions?: string[];
  cooking_style?: 'scratch' | 'quick' | 'meal_prep';
  food_adventurousness?: number;
  // Section 4 - Snack Habits
  current_snacks?: string[];
  snack_reason?: 'hunger' | 'boredom' | 'habit';
  snack_preference?: 'sweet' | 'savory' | 'both';
  late_night_snacking?: boolean;
  // Section 5 - Supplements & Peptides
  supplements?: string[];        // creatine, protein powder, multivitamin, etc.
  peptides?: string[];           // BPC-157, TB-500, GHK-Cu, etc.
  supplement_notes?: string;     // free text about stack, dosing, goals
  // Section 6 - Health & Wearable Data
  has_wearable?: boolean;
  wearable_type?: string;        // "garmin", "apple_watch", "whoop", etc.
  health_conditions?: string[];  // anything AI should know about
  injuries?: string[];           // current or recurring
  wildcard_notes?: string;       // anything else the user wants AI to know
  // Calculated
  bmr?: number;
  tdee?: number;
  calorie_target?: number;
  protein_target?: number;
  carb_target?: number;
  fat_target?: number;
  water_target_liters?: number;
  onboarding_complete?: boolean;
  // User preferences / settings
  unit_weight?: 'lbs' | 'kg';          // display weight in lbs or kg (default: lbs for US)
  unit_height?: 'in' | 'cm';           // display height in inches or cm (default: in for US)
  unit_distance?: 'mi' | 'km';         // display distance in miles or km (default: mi for US)
  unit_water?: 'oz' | 'ml';            // display water in oz or ml (default: oz for US)
  unit_temperature?: 'F' | 'C';        // display temp in F or C (default: F for US)
  date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  time_format?: '12h' | '24h';
  meal_window_start?: string;           // e.g. "08:00" — for intermittent fasting / meal timing
  meal_window_end?: string;             // e.g. "20:00"
  weekly_weigh_in_day?: number;         // 0=Sun..6=Sat (default: 1=Mon)
  display_theme?: 'dark' | 'light';    // future: light mode (default: dark)
  // Notification preferences
  notifications_enabled?: boolean;
  notify_morning?: string;   // "07:00"
  notify_midday?: string;    // "13:00"
  notify_evening?: string;   // "21:00"
  notify_weigh_in?: string;  // "07:00"
  display_name?: string;
  email?: string;
  phone?: string;
  sms_opted_in?: boolean;
  created_at?: string;
}

export interface TargetChangeEntry {
  timestamp: string;
  source: 'coach' | 'manual' | 'onboarding';
  changes: Partial<Pick<UserProfile, 'calorie_target' | 'protein_target' | 'carb_target' | 'fat_target' | 'water_target_liters'>>;
  previous: Partial<Pick<UserProfile, 'calorie_target' | 'protein_target' | 'carb_target' | 'fat_target' | 'water_target_liters'>>;
}

export interface CoachMemory {
  id: string;
  profile_id: string;
  category: 'preference' | 'injury' | 'goal' | 'life_context' | 'pattern' | 'dislike' | 'note';
  content: string;
  source: 'extracted' | 'onboarding' | 'manual';
  confidence: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FoodEntry {
  id?: string;
  profile_id?: string;
  image_url?: string;
  image_base64?: string;
  food_name: string;
  description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ai_analysis?: string;
  confidence?: number;
  created_at?: string;
}

// ── Garmin / Activity Data ─────────────────────────────────────────
// Mirrors Garmin Connect fields. Populated manually or via API sync.
export interface GarminData {
  // Movement
  steps?: number;
  distance_km?: number;
  floors_climbed?: number;
  active_minutes?: number;
  intensity_minutes_moderate?: number;
  intensity_minutes_vigorous?: number;

  // Energy
  calories_total?: number;       // total daily calories (BMR + active)
  calories_active?: number;      // just the active burn
  calories_burned?: number;      // legacy alias for active

  // Heart
  heart_rate_resting?: number;
  heart_rate_avg?: number;
  heart_rate_max?: number;
  hrv_status?: number;           // HRV (ms) if available

  // Sleep (log in the morning)
  sleep_hours?: number;
  sleep_score?: number;          // Garmin 0-100
  sleep_deep_hours?: number;
  sleep_light_hours?: number;
  sleep_rem_hours?: number;
  sleep_awake_minutes?: number;

  // Body / Recovery
  body_battery_morning?: number; // body battery at wake
  body_battery_current?: number; // body battery now
  body_battery?: number;         // legacy
  stress_level?: number;         // avg 0-100
  spo2?: number;                 // blood oxygen %
  respiration_rate?: number;     // breaths per min

  // Body Comp (weekly check-in)
  weight_kg?: number;
  body_fat_pct?: number;

  // Workout (most recent or today's)
  workouts?: WorkoutEntry[];

  // Body progress photos
  body_photos?: BodyPhoto[];

  // Meta
  last_synced?: string;
  check_ins_today?: CheckInStatus;
}

export interface BodyPhoto {
  id: string;
  angle: 'front' | 'side' | 'back';
  image_base64: string;
  date: string;        // YYYY-MM-DD
  weight_kg?: number;
  notes?: string;
  created_at: string;
}

export interface WorkoutEntry {
  id?: string;
  type: string;          // "strength", "run", "cycling", "HIIT", "swim", "walk", "yoga", etc.
  name?: string;         // "Upper Body Push", "Zone 2 Run"
  duration_minutes: number;
  calories_burned?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  distance_km?: number;
  notes?: string;
  created_at?: string;
}

export interface CheckInStatus {
  morning: boolean;
  midday: boolean;
  evening: boolean;
}

// ── Notification / Reminder types ──────────────────────────────────
export interface ReminderSchedule {
  id: string;
  type: 'morning_checkin' | 'log_lunch' | 'midday_checkin' | 'log_dinner' | 'evening_checkin' | 'weigh_in';
  time: string;        // "HH:MM" 24h format
  enabled: boolean;
  title: string;
  body: string;
  days: number[];      // 0=Sun, 1=Mon...6=Sat. Empty = every day
}

export const DEFAULT_REMINDERS: ReminderSchedule[] = [
  {
    id: 'morning_checkin',
    type: 'morning_checkin',
    time: '07:00',
    enabled: true,
    title: 'Good morning! Log your stats',
    body: 'Sleep, resting HR, body battery, weight — quick 30-sec check-in from your Garmin.',
    days: [],
  },
  {
    id: 'log_lunch',
    type: 'log_lunch',
    time: '12:30',
    enabled: true,
    title: 'Snap your lunch',
    body: 'Take a quick photo to log your macros. You\'re doing great today.',
    days: [],
  },
  {
    id: 'midday_checkin',
    type: 'midday_checkin',
    time: '14:00',
    enabled: true,
    title: 'Midday check-in',
    body: 'Update your steps, active minutes, and any workouts from today.',
    days: [],
  },
  {
    id: 'log_dinner',
    type: 'log_dinner',
    time: '19:00',
    enabled: true,
    title: 'Snap your dinner',
    body: 'Almost done for the day. Log dinner to see where your macros land.',
    days: [],
  },
  {
    id: 'evening_checkin',
    type: 'evening_checkin',
    time: '21:00',
    enabled: true,
    title: 'Evening wrap-up',
    body: 'Final steps, calories burned, stress level — let\'s close out the day.',
    days: [],
  },
  {
    id: 'weigh_in',
    type: 'weigh_in',
    time: '07:15',
    enabled: true,
    title: 'Weekly weigh-in',
    body: 'Step on the scale before eating. Track the trend, not the day.',
    days: [1], // Monday only
  },
];

// ── Habits ────────────────────────────────────────────────────────
export interface Habit {
  id: string;
  name: string;
  icon: string;           // emoji or lucide icon name
  color: string;          // tailwind color class like 'green' | 'blue' | 'red' etc.
  category: 'nutrition' | 'fitness' | 'recovery' | 'mindset' | 'custom';
  created_at: string;
  archived?: boolean;
}

export interface HabitLog {
  [date: string]: string[];  // date (YYYY-MM-DD) -> array of completed habit IDs
}

export const PRESET_HABITS: Omit<Habit, 'id' | 'created_at'>[] = [
  { name: 'No alcohol', icon: '🚫🍺', color: 'red', category: 'nutrition', archived: false },
  { name: 'No eating after 8pm', icon: '🌙', color: 'indigo', category: 'nutrition', archived: false },
  { name: 'Took creatine', icon: '💊', color: 'blue', category: 'nutrition', archived: false },
  { name: 'Hit protein goal', icon: '🥩', color: 'green', category: 'nutrition', archived: false },
  { name: '10k steps', icon: '👟', color: 'green', category: 'fitness', archived: false },
  { name: 'Worked out', icon: '🏋️', color: 'pink', category: 'fitness', archived: false },
  { name: 'Stretched / mobility', icon: '🧘', color: 'teal', category: 'recovery', archived: false },
  { name: '7+ hours sleep', icon: '😴', color: 'indigo', category: 'recovery', archived: false },
  { name: 'Cold shower / plunge', icon: '🧊', color: 'blue', category: 'recovery', archived: false },
  { name: 'Meditated', icon: '🧠', color: 'purple', category: 'mindset', archived: false },
  { name: 'Journaled', icon: '📝', color: 'yellow', category: 'mindset', archived: false },
  { name: 'Read 20+ min', icon: '📖', color: 'amber', category: 'mindset', archived: false },
];

// ── Other existing types ───────────────────────────────────────────
export interface DailyLog {
  date: string;
  food_entries: FoodEntry[];
  water_ml: number;
  garmin_data?: GarminData;
  notes?: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  created_at?: string;
}

export interface MealPlan {
  id?: string;
  profile_id?: string;
  days: MealPlanDay[];
  created_at?: string;
}

export interface MealPlanDay {
  day: string;
  theme: string;
  meals: {
    type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
    name: string;
    description: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    batch_cook?: boolean;
    secret_healthy?: boolean;
  }[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

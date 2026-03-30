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
  // Calculated
  bmr?: number;
  tdee?: number;
  calorie_target?: number;
  protein_target?: number;
  carb_target?: number;
  fat_target?: number;
  water_target_liters?: number;
  onboarding_complete?: boolean;
  created_at?: string;
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

export interface GarminData {
  steps?: number;
  calories_burned?: number;
  active_minutes?: number;
  heart_rate_avg?: number;
  heart_rate_resting?: number;
  sleep_hours?: number;
  sleep_score?: number;
  stress_level?: number;
  body_battery?: number;
  floors_climbed?: number;
  distance_km?: number;
  last_synced?: string;
}

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

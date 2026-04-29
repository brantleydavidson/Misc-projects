export interface HealthSnapshot {
  date: string;
  steps?: number;
  calories_active?: number;
  heart_rate_resting?: number;
  heart_rate_avg?: number;
  sleep_hours?: number;
  sleep_score?: number;
  sleep_stages?: { light: number; deep: number; rem: number; awake: number };
  stress_level?: number;
  body_battery?: number;
  hrv?: number;
  weight_kg?: number;
  body_fat_pct?: number;
  last_sync?: string;
}

export interface HealthConnection {
  connected: boolean;
  provider?: string;
  backfill_status?: {
    overall: string;
    types: Record<string, { status: string; attempts: number }>;
  };
  last_sync?: string;
}

export interface HealthTimeseries {
  type: string;
  data: Array<{ timestamp: string; value: number }>;
}

export interface ActivitySummary {
  date: string;
  steps: number;
  calories_active: number;
  calories_total: number;
  distance_meters: number;
  active_minutes: number;
  floors_climbed: number;
  heart_rate_resting: number;
  heart_rate_avg: number;
  heart_rate_max: number;
}

export interface SleepSummary {
  date: string;
  duration_hours: number;
  score: number;
  stages: { light: number; deep: number; rem: number; awake: number };
  start_time: string;
  end_time: string;
}

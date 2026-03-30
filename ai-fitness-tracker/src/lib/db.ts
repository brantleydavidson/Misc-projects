import { supabase, isSupabaseAvailable } from './supabase';
import type { UserProfile, FoodEntry, GarminData, ChatMessage } from '../types';

// Device ID for anonymous auth
function getDeviceId(): string {
  let id = localStorage.getItem('macrosnap_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('macrosnap_device_id', id);
  }
  return id;
}

// ── Profile ────────────────────────────────────────────────────────

export async function upsertProfile(profile: Partial<UserProfile>): Promise<UserProfile | null> {
  if (!isSupabaseAvailable()) return null;
  const deviceId = getDeviceId();

  const { data, error } = await supabase!
    .from('ja_profiles')
    .upsert({ ...profile, device_id: deviceId }, { onConflict: 'device_id' })
    .select()
    .single();

  if (error) { console.error('Profile upsert error:', error); return null; }
  return data;
}

export async function fetchProfile(): Promise<UserProfile | null> {
  if (!isSupabaseAvailable()) return null;
  const deviceId = getDeviceId();

  const { data, error } = await supabase!
    .from('ja_profiles')
    .select('*')
    .eq('device_id', deviceId)
    .single();

  if (error) return null;
  return data;
}

// ── Food Entries ───────────────────────────────────────────────────

export async function syncFoodEntries(date: string, entries: FoodEntry[]): Promise<void> {
  if (!isSupabaseAvailable()) return;
  const profile = await fetchProfile();
  if (!profile?.id) return;

  // Delete existing entries for this date and re-insert
  await supabase!
    .from('ja_food_entries')
    .delete()
    .eq('profile_id', profile.id)
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59`);

  if (entries.length === 0) return;

  const rows = entries.map(e => ({
    profile_id: profile.id,
    food_name: e.food_name,
    description: e.description,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    fiber: e.fiber,
    meal_type: e.meal_type,
    ai_analysis: e.ai_analysis,
    confidence: e.confidence,
    created_at: e.created_at,
  }));

  const { error } = await supabase!.from('ja_food_entries').insert(rows);
  if (error) console.error('Food sync error:', error);
}

export async function fetchFoodEntries(date: string): Promise<FoodEntry[]> {
  if (!isSupabaseAvailable()) return [];
  const profile = await fetchProfile();
  if (!profile?.id) return [];

  const { data, error } = await supabase!
    .from('ja_food_entries')
    .select('*')
    .eq('profile_id', profile.id)
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59`)
    .order('created_at');

  if (error) return [];
  return data || [];
}

// ── Activity Data ──────────────────────────────────────────────────

export async function syncActivityData(date: string, data: GarminData): Promise<void> {
  if (!isSupabaseAvailable()) return;
  const profile = await fetchProfile();
  if (!profile?.id) return;

  const { error } = await supabase!
    .from('ja_activity_logs')
    .upsert({
      profile_id: profile.id,
      log_date: date,
      activity_data: data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,log_date' });

  if (error) console.error('Activity sync error:', error);
}

export async function fetchActivityData(date: string): Promise<GarminData | null> {
  if (!isSupabaseAvailable()) return null;
  const profile = await fetchProfile();
  if (!profile?.id) return null;

  const { data, error } = await supabase!
    .from('ja_activity_logs')
    .select('activity_data')
    .eq('profile_id', profile.id)
    .eq('log_date', date)
    .single();

  if (error) return null;
  return data?.activity_data || null;
}

// ── Water ──────────────────────────────────────────────────────────

export async function syncWater(date: string, ml: number): Promise<void> {
  if (!isSupabaseAvailable()) return;
  const profile = await fetchProfile();
  if (!profile?.id) return;

  const { error } = await supabase!
    .from('ja_water_logs')
    .upsert({
      profile_id: profile.id,
      log_date: date,
      water_ml: ml,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,log_date' });

  if (error) console.error('Water sync error:', error);
}

// ── Chat Messages ──────────────────────────────────────────────────

export async function syncChatMessages(messages: ChatMessage[]): Promise<void> {
  if (!isSupabaseAvailable()) return;
  const profile = await fetchProfile();
  if (!profile?.id) return;

  // Only sync new messages (ones without a synced flag)
  const newMessages = messages.filter(m => !m.id?.startsWith('sb_'));
  if (newMessages.length === 0) return;

  const rows = newMessages.map(m => ({
    profile_id: profile.id,
    role: m.role,
    content: m.content,
    image_url: m.image_url,
    created_at: m.created_at,
  }));

  const { error } = await supabase!.from('ja_chat_messages').insert(rows);
  if (error) console.error('Chat sync error:', error);
}

// ── Background Sync ────────────────────────────────────────────────
// Call this periodically or on key actions to push local data to Supabase

export async function performFullSync(): Promise<{ synced: boolean; error?: string }> {
  if (!isSupabaseAvailable()) return { synced: false, error: 'Supabase not configured' };

  try {
    // Sync profile
    const localProfile = JSON.parse(localStorage.getItem('macrosnap_profile') || '{}');
    if (localProfile.device_id) {
      await upsertProfile(localProfile);
    }

    // Sync today's food
    const today = new Date().toISOString().split('T')[0];
    const foodLog = JSON.parse(localStorage.getItem('macrosnap_food_log') || '{}');
    if (foodLog[today]) {
      await syncFoodEntries(today, foodLog[today]);
    }

    // Sync today's activity
    const activityLog = JSON.parse(localStorage.getItem('macrosnap_activity_log') || '{}');
    if (activityLog[today]) {
      await syncActivityData(today, activityLog[today]);
    }

    // Sync water
    const waterLog = JSON.parse(localStorage.getItem('macrosnap_water_log') || '{}');
    if (waterLog[today] != null) {
      await syncWater(today, waterLog[today]);
    }

    return { synced: true };
  } catch (err: any) {
    return { synced: false, error: err.message };
  }
}

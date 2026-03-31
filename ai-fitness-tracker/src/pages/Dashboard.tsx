import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Camera, Droplets, Flame, Footprints, Heart, Moon, Zap,
  Sun, Sunset, ChevronRight, ChevronLeft, Bell, BellOff, Dumbbell, Activity,
  Battery, Brain, Check, User, TrendingDown, TrendingUp, UtensilsCrossed,
} from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import { MacroBar } from '../components/MacroBar';
import type { UserProfile, BodyPhoto } from '../types';
import { getDailySummary, getActivityData, addWater, getWaterIntake, getCheckInStatus, getBodyPhotoDates, getAllBodyPhotos, getHabits, toggleHabit, isHabitComplete, getHabitStreak, getDailyHabitSummary } from '../lib/storage';
import { displayWater, displayWaterTarget, waterIncrements, displayWeight, displayWeightValue, weightUnit } from '../lib/units';
import {
  getCurrentCheckInPeriod, getCheckInNudge,
  requestNotificationPermission, getNotificationPermission, scheduleAllReminders,
} from '../lib/notifications';

interface DashboardProps {
  profile: UserProfile;
}

function dateToKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isToday(d: Date): boolean {
  return dateToKey(d) === dateToKey(new Date());
}

function formatDateHeader(d: Date, isCurrentDay: boolean): string {
  if (isCurrentDay) return 'Today';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateToKey(d) === dateToKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function Dashboard({ profile }: DashboardProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(() =>
    initDate ? new Date(initDate + 'T12:00:00') : new Date()
  );
  const currentDay = isToday(selectedDate);
  const dateKey = dateToKey(selectedDate);

  const refreshData = useCallback(() => ({
    summary: getDailySummary(dateKey),
    activity: getActivityData(dateKey),
    water: getWaterIntake(dateKey),
    checkIns: getCheckInStatus(dateKey),
  }), [dateKey]);

  const [data, setData] = useState(refreshData);
  const [notifPerm, setNotifPerm] = useState(getNotificationPermission());

  useEffect(() => {
    setData(refreshData());
    if (!currentDay) return;
    const interval = setInterval(() => setData(refreshData()), 3000);
    return () => clearInterval(interval);
  }, [refreshData, currentDay]);

  const { summary, activity, water, checkIns } = data;

  // Start notification scheduling
  useEffect(() => {
    if (notifPerm === 'granted') {
      scheduleAllReminders();
    }
  }, [notifPerm]);

  async function enableNotifications() {
    const granted = await requestNotificationPermission();
    setNotifPerm(granted ? 'granted' : 'denied');
    if (granted) scheduleAllReminders();
  }

  const targets = {
    calories: profile.calorie_target || 2000,
    protein: profile.protein_target || 150,
    carbs: profile.carb_target || 200,
    fat: profile.fat_target || 65,
    water: (profile.water_target_liters || 3) * 1000,
  };

  const caloriesLeft = Math.max(targets.calories - summary.calories, 0);
  const hour = new Date().getHours();
  const dayNumber = profile.created_at
    ? Math.max(1, Math.ceil((Date.now() - new Date(profile.created_at).getTime()) / 86400000))
    : 1;
  const greeting = currentDay
    ? (profile.display_name
        ? `${profile.display_name}. DAY ${dayNumber}. LET'S MOVE.`
        : (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'))
    : formatDateHeader(selectedDate, false);
  const currentPeriod = getCurrentCheckInPeriod();
  const nudge = currentDay ? getCheckInNudge(checkIns) : null;

  function goBack() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
    setSearchParams({ date: dateToKey(d) });
  }
  function goForward() {
    if (currentDay) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
    if (isToday(d)) setSearchParams({});
    else setSearchParams({ date: dateToKey(d) });
  }

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-lg font-bold text-white font-display uppercase">{greeting}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <button onClick={goBack} className="text-slate-400 hover:text-neon-teal transition p-0.5">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => { setSelectedDate(new Date()); setSearchParams({}); }} className="text-xs text-slate-400 hover:text-white transition min-w-[100px] text-center">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </button>
            <button onClick={goForward} disabled={currentDay}
              className={`p-0.5 transition ${currentDay ? 'text-slate-600 cursor-default' : 'text-slate-400 hover:text-neon-teal'}`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
            <button onClick={enableNotifications}
              className="w-9 h-9 rounded-full glass flex items-center justify-center"
              title="Enable reminders"
            >
              <BellOff size={16} className="text-slate-500" />
            </button>
          )}
          {notifPerm === 'granted' && (
            <div className="w-9 h-9 rounded-full glass flex items-center justify-center" title="Reminders active">
              <Bell size={16} className="text-green-400" />
            </div>
          )}
          <button onClick={() => navigate('/snap')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center shadow-lg"
          >
            <Camera size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* Past day banner */}
      {!currentDay && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-neon-teal/5 border border-neon-teal/20">
          <span className="text-xs text-neon-teal">Viewing {formatDateHeader(selectedDate, false)} — you can still add entries</span>
          <button onClick={() => { setSelectedDate(new Date()); setSearchParams({}); }} className="text-[10px] text-neon-teal font-semibold px-2 py-1 rounded-lg bg-neon-teal/10">
            Back to Today
          </button>
        </div>
      )}

      {/* Check-in nudge */}
      {nudge && (
        <button onClick={() => navigate('/checkin')}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:border-amber-500/40 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            {currentPeriod === 'morning' ? <Sun size={18} className="text-amber-400" /> :
             currentPeriod === 'midday' ? <Sunset size={18} className="text-neon-teal" /> :
             <Moon size={18} className="text-indigo-400" />}
          </div>
          <div className="flex-1 text-left">
            <div className="text-xs font-semibold text-white">Time to check in</div>
            <div className="text-[10px] text-slate-400">{nudge}</div>
          </div>
          <ChevronRight size={16} className="text-slate-500" />
        </button>
      )}

      {/* Check-in status pills */}
      <div className="flex gap-2">
        {(['morning', 'midday', 'evening'] as const).map(p => {
          const done = checkIns[p];
          const icons = { morning: <Sun size={12} />, midday: <Sunset size={12} />, evening: <Moon size={12} /> };
          return (
            <button key={p} onClick={() => navigate('/checkin')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs capitalize transition hud-corners ${
                done
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : p === currentPeriod
                    ? 'bg-neon-teal/10 text-neon-teal border border-neon-teal/30 animate-pulse'
                    : 'glass text-slate-500 border border-white/5'
              }`}
            >
              {done ? <Check size={12} /> : icons[p]} {p}
            </button>
          );
        })}
      </div>

      {/* Calorie Ring */}
      <div className="glass rounded-2xl p-5 cursor-pointer" onClick={() => navigate(currentDay ? '/snap' : `/snap?date=${dateKey}`)}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <ProgressRing value={summary.calories} max={targets.calories} size={140} strokeWidth={10} color="#00E5CC">
              <div className="text-center">
                <div className="text-2xl font-bold text-white font-data">{caloriesLeft}</div>
                <div className="text-[10px] text-slate-400">cal left</div>
              </div>
            </ProgressRing>
          </div>
          <div className="flex-1 space-y-2 ml-4">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-orange-400" />
              <span className="text-xs text-slate-300"><span className="font-data">{Math.round(summary.calories)}</span> eaten</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-yellow-400" />
              <span className="text-xs text-slate-300"><span className="font-data">{activity.calories_active || activity.calories_burned || '—'}</span> burned</span>
            </div>
            {activity.calories_total != null && (
              <div className="flex items-center gap-2">
                <Flame size={14} className="text-red-400" />
                <span className="text-xs text-slate-300"><span className="font-data">{activity.calories_total}</span> total TDEE</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-semibold">Target: <span className="font-data">{targets.calories}</span> cal</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); navigate(`/log${currentDay ? '' : `?date=${dateKey}`}`); }}
              className="text-xs text-neon-teal hover:underline transition text-left"
            >
              {summary.entries.length} meals logged →
            </button>
          </div>
        </div>
      </div>

      {/* Macro Bars */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Macros</h2>
        <div className="flex gap-4">
          <MacroBar label="Protein" value={summary.protein} target={targets.protein} color="#00E5CC" />
          <MacroBar label="Carbs" value={summary.carbs} target={targets.carbs} color="#FF2D78" />
          <MacroBar label="Fat" value={summary.fat} target={targets.fat} color="#FF2D78" />
        </div>
      </div>

      {/* Meals Logged */}
      {summary.entries.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-white">Today's Meals</h2>
            <button onClick={() => navigate(`/log${currentDay ? '' : `?date=${dateKey}`}`)}
              className="text-[10px] text-neon-teal flex items-center gap-1"
            >
              Edit <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-1.5">
            {summary.entries.slice(0, 5).map((entry: any) => (
              <button key={entry.id} onClick={() => navigate(`/log${currentDay ? '' : `?date=${dateKey}`}`)}
                className="w-full flex items-center gap-2 py-1.5 border-t border-white/5 text-left hover:bg-white/5 rounded-lg transition px-1"
              >
                <span className="text-[10px] w-14 text-slate-500 capitalize">{entry.meal_type}</span>
                <span className="text-xs text-white flex-1 truncate">{entry.food_name}</span>
                <span className="text-[10px] text-slate-400 font-data">{entry.calories} cal</span>
              </button>
            ))}
            {summary.entries.length > 5 && (
              <div className="text-[10px] text-slate-500 text-center pt-1">
                +{summary.entries.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Water Tracker */}
      <div className="glass rounded-2xl p-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Droplets size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Hydration</h2>
          </div>
          <span className="text-xs text-slate-400 font-data">{displayWater(water, profile)} / {displayWaterTarget(targets.water / 1000, profile)}</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-neon-teal transition-all duration-500"
            style={{ width: `${Math.min((water / targets.water) * 100, 100)}%` }} />
        </div>
        <div className="flex gap-2">
          {waterIncrements(profile).map(({ ml, label }) => (
            <button key={ml} onClick={() => { addWater(ml, dateKey); setData(refreshData()); }}
              className="flex-1 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20 hover:bg-blue-500/20 transition"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Stats */}
      <div className="glass rounded-2xl p-4 cursor-pointer" onClick={() => navigate(currentDay ? '/checkin' : `/checkin?date=${dateKey}`)}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-white">Activity</h2>
          <button onClick={(e) => { e.stopPropagation(); navigate(currentDay ? '/checkin' : `/checkin?date=${dateKey}`); }} className="text-[10px] text-neon-teal flex items-center gap-1">
            Update <ChevronRight size={12} />
          </button>
        </div>

        {/* Primary stats row */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <StatCard icon={<Footprints size={14} />} label="Steps" value={activity.steps?.toLocaleString() || '—'} color="text-green-400" />
          <StatCard icon={<Flame size={14} />} label="Active Cal" value={activity.calories_active || activity.calories_burned ? `${activity.calories_active || activity.calories_burned}` : '—'} color="text-orange-400" />
          <StatCard icon={<Heart size={14} />} label="Rest HR" value={activity.heart_rate_resting ? `${activity.heart_rate_resting}` : '—'} color="text-red-400" />
          <StatCard icon={<Moon size={14} />} label="Sleep" value={activity.sleep_hours ? `${activity.sleep_hours}h` : '—'} color="text-indigo-400" />
        </div>

        {/* Secondary stats (only show if data exists) */}
        {(activity.body_battery_morning != null || activity.body_battery_current != null ||
          activity.stress_level != null || activity.hrv_status != null ||
          activity.active_minutes != null || activity.sleep_score != null) && (
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-white/5">
            {activity.body_battery_morning != null && (
              <StatCard icon={<Battery size={14} />} label="Battery" value={`${activity.body_battery_morning}`} color="text-green-400" />
            )}
            {activity.body_battery_current != null && (
              <StatCard icon={<Battery size={14} />} label="Batt Now" value={`${activity.body_battery_current}`} color="text-yellow-400" />
            )}
            {activity.stress_level != null && (
              <StatCard icon={<Brain size={14} />} label="Stress" value={`${activity.stress_level}`} color="text-neon-pink" />
            )}
            {activity.hrv_status != null && (
              <StatCard icon={<Activity size={14} />} label="HRV" value={`${activity.hrv_status}ms`} color="text-neon-teal" />
            )}
            {activity.active_minutes != null && (
              <StatCard icon={<Zap size={14} />} label="Active" value={`${activity.active_minutes}m`} color="text-yellow-400" />
            )}
            {activity.sleep_score != null && (
              <StatCard icon={<Moon size={14} />} label="Sleep %" value={`${activity.sleep_score}`} color="text-indigo-400" />
            )}
            {activity.spo2 != null && (
              <StatCard icon={<Droplets size={14} />} label="SpO2" value={`${activity.spo2}%`} color="text-blue-400" />
            )}
            {activity.weight_kg != null && (
              <StatCard icon={<Activity size={14} />} label="Weight" value={displayWeight(activity.weight_kg, profile)} color="text-white" />
            )}
          </div>
        )}

        {/* Workouts */}
        {(activity.workouts || []).length > 0 && (
          <div className="pt-3 mt-3 border-t border-white/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Dumbbell size={12} className="text-neon-pink" />
              <span className="text-xs font-semibold text-slate-300">Workouts</span>
            </div>
            {activity.workouts!.map(w => (
              <div key={w.id} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-300">{w.name || w.type}</span>
                <span className="text-[10px] text-slate-500">
                  {w.duration_minutes}min{w.calories_burned ? ` · ${w.calories_burned}cal` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!activity.steps && !activity.sleep_hours && !activity.heart_rate_resting && (
          <button onClick={() => navigate(currentDay ? '/checkin' : `/checkin?date=${dateKey}`)}
            className="w-full py-3 mt-1 rounded-xl border border-dashed border-white/20 text-slate-500 text-xs hover:border-neon-teal/40 hover:text-neon-teal transition"
          >
            {currentDay ? "Tap to log today's Garmin data" : `Tap to log data for ${formatDateHeader(selectedDate, false)}`}
          </button>
        )}
      </div>

      {/* Progress Insights */}
      <ProgressInsights navigate={navigate} profile={profile} />

      {/* Habit Tracker Widget */}
      <HabitWidget navigate={navigate} dateKey={dateKey} />

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate(currentDay ? '/snap' : `/snap?date=${dateKey}`)}
          className="py-3 rounded-xl bg-gradient-to-r from-neon-teal/20 to-neon-pink/20 border border-neon-teal/30 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Camera size={16} /> {currentDay ? 'Snap Food' : 'Add Food'}
        </button>
        <button onClick={() => navigate('/eat-out')}
          className="py-3 rounded-xl bg-gradient-to-r from-orange-500/20 to-neon-pink/20 border border-orange-500/30 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <UtensilsCrossed size={16} /> Eat Out
        </button>
        <button onClick={() => navigate('/chat')}
          className="py-3 rounded-xl bg-gradient-to-r from-neon-pink/20 to-neon-pink/20 border border-neon-pink/30 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Zap size={16} /> Ask Coach
        </button>
        <button onClick={() => navigate('/trends')}
          className="py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium flex items-center justify-center gap-2"
        >
          <TrendingUp size={16} /> Trends
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <div className="text-sm font-bold text-white font-data">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function ProgressInsights({ navigate, profile }: { navigate: (path: string) => void; profile: UserProfile }) {
  const photoDates = getBodyPhotoDates();
  const allPhotos = getAllBodyPhotos();

  // Get weight history from activity logs for trend
  const weightHistory: { date: string; kg: number }[] = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const activity = getActivityData(key);
    if (activity.weight_kg) {
      weightHistory.push({ date: key, kg: activity.weight_kg });
    }
  }

  const hasPhotos = photoDates.length > 0;
  const hasWeightData = weightHistory.length >= 2;
  const latestWeight = weightHistory[weightHistory.length - 1];
  const firstWeight = weightHistory[0];
  const weightChange = hasWeightData
    ? displayWeightValue(latestWeight.kg, profile) - displayWeightValue(firstWeight.kg, profile)
    : 0;

  // Get most recent and earliest photos for comparison
  const latestPhotoDate = photoDates[photoDates.length - 1];
  const earliestPhotoDate = photoDates.length > 1 ? photoDates[0] : null;
  const latestPhotos = latestPhotoDate ? allPhotos[latestPhotoDate] : [];
  const earliestPhotos = earliestPhotoDate ? allPhotos[earliestPhotoDate] : [];

  if (!hasPhotos && !hasWeightData) {
    // Empty state — prompt to take first photo
    return (
      <button onClick={() => navigate('/snap')}
        className="w-full glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition"
      >
        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <User size={20} className="text-purple-400" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold text-white">Track Your Progress</div>
          <div className="text-[10px] text-slate-400">Take your first progress photos for AI body composition analysis</div>
        </div>
        <ChevronRight size={16} className="text-slate-500" />
      </button>
    );
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <User size={16} className="text-purple-400" />
          Progress
        </h2>
        <button onClick={() => navigate('/snap')}
          className="text-[10px] text-purple-400 flex items-center gap-1"
        >
          New Photos <ChevronRight size={12} />
        </button>
      </div>

      {/* Weight trend */}
      {hasWeightData && (
        <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-white/5">
          {weightChange <= 0 ? (
            <TrendingDown size={18} className="text-green-400" />
          ) : (
            <TrendingUp size={18} className="text-orange-400" />
          )}
          <div className="flex-1">
            <div className="text-xs text-white font-data">
              {displayWeight(latestWeight.kg, profile)}
              <span className={`ml-2 text-[10px] ${weightChange <= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {weightUnit(profile)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              {weightHistory.length} weigh-ins over {Math.round((new Date(latestWeight.date).getTime() - new Date(firstWeight.date).getTime()) / 86400000)} days
            </div>
          </div>
        </div>
      )}

      {/* Photo comparison */}
      {hasPhotos && (
        <div className="flex gap-2">
          {earliestPhotos.length > 0 && (
            <div className="flex-1">
              <div className="text-[9px] text-slate-500 mb-1 text-center">
                {new Date(earliestPhotoDate! + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="rounded-xl overflow-hidden aspect-[3/4] bg-white/5">
                <img
                  src={`data:image/jpeg;base64,${(earliestPhotos.find((p: BodyPhoto) => p.angle === 'front') || earliestPhotos[0]).image_base64}`}
                  alt="Before"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
          <div className={earliestPhotos.length > 0 ? 'flex-1' : 'w-full'}>
            <div className="text-[9px] text-slate-500 mb-1 text-center">
              {earliestPhotos.length > 0 ? 'Latest' : new Date(latestPhotoDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <div className={`rounded-xl overflow-hidden bg-white/5 ${earliestPhotos.length > 0 ? 'aspect-[3/4]' : 'aspect-[4/3]'}`}>
              <img
                src={`data:image/jpeg;base64,${(latestPhotos.find((p: BodyPhoto) => p.angle === 'front') || latestPhotos[0]).image_base64}`}
                alt="Current"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      )}

      {hasPhotos && photoDates.length > 1 && (
        <div className="text-[10px] text-slate-500 text-center">
          {photoDates.length} photo sessions tracked
        </div>
      )}
    </div>
  );
}

function HabitWidget({ navigate, dateKey }: { navigate: (path: string) => void; dateKey: string }) {
  const habits = getHabits().filter(h => !h.archived);
  const [_, forceUpdate] = useState(0);

  if (habits.length === 0) {
    return (
      <button onClick={() => navigate('/habits')}
        className="w-full glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition"
      >
        <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
          <Flame size={20} className="text-orange-400" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold text-white">Build Daily Habits</div>
          <div className="text-[10px] text-slate-400">Track streaks, consistency, and build routines</div>
        </div>
        <ChevronRight size={16} className="text-slate-500" />
      </button>
    );
  }

  const summary = getDailyHabitSummary(dateKey);
  const pct = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

  function handleToggle(habitId: string) {
    toggleHabit(habitId, dateKey);
    forceUpdate(n => n + 1);
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Flame size={16} className="text-orange-400" />
          Habits
        </h2>
        <button onClick={() => navigate('/habits')}
          className="text-[10px] text-orange-400 flex items-center gap-1"
        >
          {summary.completed}/{summary.total} · {pct}% <ChevronRight size={12} />
        </button>
      </div>

      <div className="space-y-1.5">
        {habits.slice(0, 6).map(habit => {
          const done = isHabitComplete(habit.id, dateKey);
          const streak = getHabitStreak(habit.id);
          return (
            <button key={habit.id} onClick={() => handleToggle(habit.id)}
              className={`w-full flex items-center gap-2.5 py-2 px-2 rounded-xl transition ${
                done ? 'bg-green-500/5' : 'hover:bg-white/5'
              }`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition text-xs ${
                done ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-500'
              }`}>
                {done ? <Check size={14} /> : <span className="text-[10px]">{habit.icon}</span>}
              </div>
              <span className={`text-xs flex-1 text-left ${done ? 'text-green-400 line-through' : 'text-white'}`}>
                {habit.name}
              </span>
              {streak > 0 && (
                <span className="text-[9px] text-orange-400 flex items-center gap-0.5">
                  <Flame size={8} />{streak}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {habits.length > 6 && (
        <button onClick={() => navigate('/habits')}
          className="w-full text-[10px] text-slate-500 text-center pt-1"
        >
          +{habits.length - 6} more habits →
        </button>
      )}
    </div>
  );
}

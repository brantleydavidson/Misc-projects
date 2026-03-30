import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Droplets, Flame, Footprints, Heart, Moon, Zap,
  Sun, Sunset, ChevronRight, Bell, BellOff, Dumbbell, Activity,
  Battery, Brain, Check,
} from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import { MacroBar } from '../components/MacroBar';
import type { UserProfile, GarminData } from '../types';
import { getDailySummary, getActivityData, addWater, getWaterIntake, getCheckInStatus } from '../lib/storage';
import {
  getCurrentCheckInPeriod, getCheckInNudge,
  requestNotificationPermission, getNotificationPermission, scheduleAllReminders,
} from '../lib/notifications';

interface DashboardProps {
  profile: UserProfile;
}

export function Dashboard({ profile }: DashboardProps) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(getDailySummary());
  const [activity, setActivity] = useState<GarminData>(getActivityData());
  const [water, setWater] = useState(getWaterIntake());
  const [checkIns, setCheckIns] = useState(getCheckInStatus());
  const [notifPerm, setNotifPerm] = useState(getNotificationPermission());

  useEffect(() => {
    const interval = setInterval(() => {
      setSummary(getDailySummary());
      setWater(getWaterIntake());
      setActivity(getActivityData());
      setCheckIns(getCheckInStatus());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const currentPeriod = getCurrentCheckInPeriod();
  const nudge = getCheckInNudge(checkIns);
  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-lg font-bold text-white">{greeting}</h1>
          <p className="text-xs text-slate-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
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
            className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-lg"
          >
            <Camera size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* Check-in nudge */}
      {nudge && (
        <button onClick={() => navigate('/checkin')}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:border-amber-500/40 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            {currentPeriod === 'morning' ? <Sun size={18} className="text-amber-400" /> :
             currentPeriod === 'midday' ? <Sunset size={18} className="text-cyan-400" /> :
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
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs capitalize transition ${
                done
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : p === currentPeriod
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse'
                    : 'glass text-slate-500 border border-white/5'
              }`}
            >
              {done ? <Check size={12} /> : icons[p]} {p}
            </button>
          );
        })}
      </div>

      {/* Calorie Ring */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <ProgressRing value={summary.calories} max={targets.calories} size={140} strokeWidth={10} color="#22d3ee">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{caloriesLeft}</div>
                <div className="text-[10px] text-slate-400">cal left</div>
              </div>
            </ProgressRing>
          </div>
          <div className="flex-1 space-y-2 ml-4">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-orange-400" />
              <span className="text-xs text-slate-300">{Math.round(summary.calories)} eaten</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-yellow-400" />
              <span className="text-xs text-slate-300">{activity.calories_active || activity.calories_burned || '—'} burned</span>
            </div>
            {activity.calories_total != null && (
              <div className="flex items-center gap-2">
                <Flame size={14} className="text-red-400" />
                <span className="text-xs text-slate-300">{activity.calories_total} total TDEE</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-semibold">Target: {targets.calories} cal</span>
            </div>
            <div className="text-xs text-slate-500">
              {summary.entries.length} meals logged
            </div>
          </div>
        </div>
      </div>

      {/* Macro Bars */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Macros</h2>
        <div className="flex gap-4">
          <MacroBar label="Protein" value={summary.protein} target={targets.protein} color="#22d3ee" />
          <MacroBar label="Carbs" value={summary.carbs} target={targets.carbs} color="#a855f7" />
          <MacroBar label="Fat" value={summary.fat} target={targets.fat} color="#f472b6" />
        </div>
      </div>

      {/* Water Tracker */}
      <div className="glass rounded-2xl p-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Droplets size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Hydration</h2>
          </div>
          <span className="text-xs text-slate-400">{(water / 1000).toFixed(1)}L / {(targets.water / 1000).toFixed(1)}L</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-500"
            style={{ width: `${Math.min((water / targets.water) * 100, 100)}%` }} />
        </div>
        <div className="flex gap-2">
          {[250, 500, 750].map(ml => (
            <button key={ml} onClick={() => { addWater(ml); setWater(getWaterIntake()); }}
              className="flex-1 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20 hover:bg-blue-500/20 transition"
            >
              +{ml}ml
            </button>
          ))}
        </div>
      </div>

      {/* Activity Stats */}
      <div className="glass rounded-2xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-white">Activity</h2>
          <button onClick={() => navigate('/checkin')} className="text-[10px] text-cyan-400 flex items-center gap-1">
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
              <StatCard icon={<Brain size={14} />} label="Stress" value={`${activity.stress_level}`} color="text-purple-400" />
            )}
            {activity.hrv_status != null && (
              <StatCard icon={<Activity size={14} />} label="HRV" value={`${activity.hrv_status}ms`} color="text-cyan-400" />
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
              <StatCard icon={<Activity size={14} />} label="Weight" value={`${activity.weight_kg}kg`} color="text-white" />
            )}
          </div>
        )}

        {/* Workouts */}
        {(activity.workouts || []).length > 0 && (
          <div className="pt-3 mt-3 border-t border-white/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Dumbbell size={12} className="text-purple-400" />
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
          <button onClick={() => navigate('/checkin')}
            className="w-full py-3 mt-1 rounded-xl border border-dashed border-white/20 text-slate-500 text-xs hover:border-cyan-500/40 hover:text-cyan-400 transition"
          >
            Tap to log today's Garmin data
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button onClick={() => navigate('/snap')}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Camera size={16} /> Snap Food
        </button>
        <button onClick={() => navigate('/chat')}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Zap size={16} /> Ask Coach
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

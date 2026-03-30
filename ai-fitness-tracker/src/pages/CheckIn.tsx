import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Moon, Sunset, Check, Plus, X, Trash2,
  Footprints, Heart, Flame, Zap, Activity, Scale,
  Timer, ArrowUp, Wind, Brain, Star, Battery, Map, Dumbbell,
} from 'lucide-react';
import type { GarminData, WorkoutEntry } from '../types';
import {
  getActivityData, saveActivityData, markCheckIn, getCheckInStatus,
  addWorkout, removeWorkout,
} from '../lib/storage';
import {
  getCurrentCheckInPeriod,
  MORNING_FIELDS, MIDDAY_FIELDS, EVENING_FIELDS,
} from '../lib/notifications';

const ICON_MAP: Record<string, React.ReactNode> = {
  moon: <Moon size={14} className="text-indigo-400" />,
  star: <Star size={14} className="text-yellow-400" />,
  heart: <Heart size={14} className="text-red-400" />,
  activity: <Activity size={14} className="text-neon-teal" />,
  battery: <Battery size={14} className="text-green-400" />,
  wind: <Wind size={14} className="text-blue-400" />,
  scale: <Scale size={14} className="text-neon-pink" />,
  percent: <Activity size={14} className="text-neon-pink" />,
  footprints: <Footprints size={14} className="text-green-400" />,
  timer: <Timer size={14} className="text-yellow-400" />,
  flame: <Flame size={14} className="text-orange-400" />,
  zap: <Zap size={14} className="text-yellow-400" />,
  brain: <Brain size={14} className="text-neon-pink" />,
  'arrow-up': <ArrowUp size={14} className="text-neon-teal" />,
  map: <Map size={14} className="text-green-400" />,
};

type Period = 'morning' | 'midday' | 'evening';

const PERIOD_CONFIG: Record<Period, {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  gradient: string;
  fields: readonly { key: string; label: string; icon: string; step?: string; placeholder: string }[];
}> = {
  morning: {
    icon: <Sun size={20} className="text-amber-400" />,
    title: 'Morning Check-in',
    subtitle: 'Sleep, recovery, and body stats from your Garmin',
    color: 'amber',
    gradient: 'from-amber-500/20 to-orange-500/20',
    fields: MORNING_FIELDS,
  },
  midday: {
    icon: <Sunset size={20} className="text-neon-teal" />,
    title: 'Midday Check-in',
    subtitle: 'Activity progress and any workouts so far',
    color: 'cyan',
    gradient: 'from-neon-teal/20 to-blue-500/20',
    fields: MIDDAY_FIELDS,
  },
  evening: {
    icon: <Moon size={20} className="text-indigo-400" />,
    title: 'Evening Wrap-up',
    subtitle: 'Final totals for the day',
    color: 'indigo',
    gradient: 'from-indigo-500/20 to-neon-pink/20',
    fields: EVENING_FIELDS,
  },
};

const WORKOUT_TYPES = [
  'Strength', 'Run', 'Walk', 'Cycling', 'HIIT', 'Swimming',
  'Yoga', 'Elliptical', 'Rowing', 'Stairclimber', 'Sports', 'Other',
];

export function CheckIn() {
  const navigate = useNavigate();
  const currentPeriod = getCurrentCheckInPeriod();
  const [activePeriod, setActivePeriod] = useState<Period>(currentPeriod || 'morning');
  const [activityData, setActivityData] = useState<GarminData>(getActivityData());
  const [checkIns, setCheckIns] = useState(getCheckInStatus());
  const [formData, setFormData] = useState<Record<string, number | undefined>>({});
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [workout, setWorkout] = useState<Partial<WorkoutEntry>>({ type: 'Strength', duration_minutes: 45 });
  const [saved, setSaved] = useState(false);

  // Load existing data into form
  useEffect(() => {
    const data = getActivityData();
    setActivityData(data);
    const initial: Record<string, number | undefined> = {};
    const config = PERIOD_CONFIG[activePeriod];
    config.fields.forEach(f => {
      const val = (data as any)[f.key];
      if (val != null) initial[f.key] = val;
    });
    setFormData(initial);
    setSaved(false);
  }, [activePeriod]);

  function handleSave() {
    const updates: Partial<GarminData> = {};
    Object.entries(formData).forEach(([key, val]) => {
      if (val != null) (updates as any)[key] = val;
    });
    const updated = saveActivityData(updates);
    markCheckIn(activePeriod);
    setActivityData(updated);
    setCheckIns(getCheckInStatus());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleAddWorkout() {
    if (!workout.type || !workout.duration_minutes) return;
    const entry: WorkoutEntry = {
      type: workout.type!,
      name: workout.name,
      duration_minutes: workout.duration_minutes!,
      calories_burned: workout.calories_burned,
      avg_heart_rate: workout.avg_heart_rate,
      max_heart_rate: workout.max_heart_rate,
      distance_km: workout.distance_km,
      notes: workout.notes,
    };
    const updated = addWorkout(entry);
    setActivityData(updated);
    setWorkout({ type: 'Strength', duration_minutes: 45 });
    setShowWorkoutForm(false);
  }

  function handleRemoveWorkout(id: string) {
    const updated = removeWorkout(id);
    setActivityData(updated);
  }

  const periods: Period[] = ['morning', 'midday', 'evening'];
  const config = PERIOD_CONFIG[activePeriod];

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Activity Check-in</h1>
        <button onClick={() => navigate('/')} className="text-slate-400 text-sm">Done</button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {periods.map(p => {
          const pc = PERIOD_CONFIG[p];
          const done = checkIns[p];
          const isCurrent = p === currentPeriod;
          const isActive = p === activePeriod;
          return (
            <button key={p} onClick={() => setActivePeriod(p)}
              className={`flex-1 py-3 rounded-xl border text-center transition relative ${
                isActive
                  ? `bg-gradient-to-b ${pc.gradient} border-white/20 text-white`
                  : 'glass border-white/5 text-slate-400'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                {pc.icon}
                <span className="text-xs capitalize">{p}</span>
              </div>
              {done && (
                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                  <Check size={10} className="text-white" />
                </div>
              )}
              {isCurrent && !done && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-neon-teal animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div className={`rounded-2xl p-4 bg-gradient-to-r ${config.gradient} border border-white/10`}>
        <div className="flex items-center gap-3">
          {config.icon}
          <div>
            <h2 className="text-sm font-semibold text-white">{config.title}</h2>
            <p className="text-xs text-slate-400">{config.subtitle}</p>
          </div>
        </div>
        {checkIns[activePeriod] && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
            <Check size={12} /> Logged today — update anytime
          </div>
        )}
      </div>

      {/* Data fields */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {config.fields.map(field => (
            <div key={field.key}>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 mb-1">
                {ICON_MAP[field.icon] || <Activity size={14} />} {field.label}
              </label>
              <input
                type="number"
                step={field.step}
                value={formData[field.key] ?? ''}
                onChange={e => setFormData(d => ({
                  ...d,
                  [field.key]: e.target.value ? Number(e.target.value) : undefined,
                }))}
                placeholder={field.placeholder}
                className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-teal focus:outline-none"
              />
            </div>
          ))}
        </div>

        <button onClick={handleSave}
          className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition ${
            saved
              ? 'bg-green-600'
              : 'bg-gradient-to-r from-neon-teal to-neon-pink'
          }`}
        >
          {saved ? '✓ Saved!' : checkIns[activePeriod] ? 'Update Check-in' : 'Save Check-in'}
        </button>
      </div>

      {/* Workouts section (midday + evening) */}
      {(activePeriod === 'midday' || activePeriod === 'evening') && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Dumbbell size={16} className="text-neon-pink" /> Workouts
            </h3>
            <button onClick={() => setShowWorkoutForm(!showWorkoutForm)}
              className="text-xs text-neon-teal flex items-center gap-1"
            >
              {showWorkoutForm ? <X size={14} /> : <Plus size={14} />}
              {showWorkoutForm ? 'Cancel' : 'Add Workout'}
            </button>
          </div>

          {/* Existing workouts */}
          {(activityData.workouts || []).map(w => (
            <div key={w.id} className="flex items-center justify-between py-2 border-t border-white/5">
              <div>
                <div className="text-sm text-white">{w.name || w.type}</div>
                <div className="text-[10px] text-slate-500">
                  {w.duration_minutes}min
                  {w.calories_burned ? ` · ${w.calories_burned} cal` : ''}
                  {w.avg_heart_rate ? ` · ${w.avg_heart_rate} bpm` : ''}
                </div>
              </div>
              <button onClick={() => handleRemoveWorkout(w.id!)} className="text-slate-600 hover:text-red-400 p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {(activityData.workouts || []).length === 0 && !showWorkoutForm && (
            <p className="text-xs text-slate-500 py-1">No workouts logged today</p>
          )}

          {/* Add workout form */}
          {showWorkoutForm && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div>
                <label className="text-[10px] font-medium text-slate-400 mb-1 block">Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {WORKOUT_TYPES.map(t => (
                    <button key={t} onClick={() => setWorkout(w => ({ ...w, type: t }))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs transition ${
                        workout.type === t
                          ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/50'
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Name (optional)</label>
                  <input value={workout.name || ''} onChange={e => setWorkout(w => ({ ...w, name: e.target.value }))}
                    placeholder="e.g. Upper Body Push"
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-pink focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Duration (min)</label>
                  <input type="number" value={workout.duration_minutes || ''} onChange={e => setWorkout(w => ({ ...w, duration_minutes: Number(e.target.value) }))}
                    placeholder="45"
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-pink focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Calories Burned</label>
                  <input type="number" value={workout.calories_burned || ''} onChange={e => setWorkout(w => ({ ...w, calories_burned: Number(e.target.value) }))}
                    placeholder="300"
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-pink focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 mb-1 block">Avg HR</label>
                  <input type="number" value={workout.avg_heart_rate || ''} onChange={e => setWorkout(w => ({ ...w, avg_heart_rate: Number(e.target.value) }))}
                    placeholder="140"
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-pink focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-400 mb-1 block">Notes (optional)</label>
                <input value={workout.notes || ''} onChange={e => setWorkout(w => ({ ...w, notes: e.target.value }))}
                  placeholder="e.g. Felt strong today, PR on bench"
                  className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-pink focus:outline-none" />
              </div>
              <button onClick={handleAddWorkout}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-neon-pink to-neon-pink text-white text-sm font-semibold"
              >
                Log Workout
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

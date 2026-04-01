import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sun, Moon, Sunset, Check, Plus, X, Trash2,
  Footprints, Heart, Flame, Zap, Activity, Scale,
  Timer, ArrowUp, Wind, Brain, Star, Battery, Map, Dumbbell,
  Camera, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { GarminData, WorkoutEntry, BodyPhoto, UserProfile } from '../types';
import {
  getActivityData, saveActivityData, markCheckIn, getCheckInStatus,
  addWorkout, removeWorkout, getBodyPhotos, addBodyPhoto, getBodyPhotoDates, getAllBodyPhotos,
  clearActivityData, moveActivityFields,
} from '../lib/storage';
import { analyzeBodyProgress } from '../lib/api';
import {
  getCurrentCheckInPeriod,
  MORNING_FIELDS, MIDDAY_FIELDS, EVENING_FIELDS,
} from '../lib/notifications';
import {
  lbsToKg, displayWeightValue, weightUnit,
  kmToMi, miToKm,
} from '../lib/units';

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

interface CheckInProps {
  profile: UserProfile;
}

function dateToKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isToday(d: Date): boolean {
  return dateToKey(d) === dateToKey(new Date());
}

export function CheckIn({ profile }: CheckInProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(() =>
    initDate ? new Date(initDate + 'T12:00:00') : new Date()
  );
  const currentDay = isToday(selectedDate);
  const dateParam = currentDay ? undefined : dateToKey(selectedDate);
  const currentPeriod = getCurrentCheckInPeriod();
  const [activePeriod, setActivePeriod] = useState<Period>(currentPeriod || 'morning');
  const [activityData, setActivityData] = useState<GarminData>(getActivityData(dateParam));
  const [checkIns, setCheckIns] = useState(getCheckInStatus(dateParam));
  const [formData, setFormData] = useState<Record<string, number | undefined>>({});
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [workout, setWorkout] = useState<Partial<WorkoutEntry>>({ type: 'Strength', duration_minutes: 45 });
  const [saved, setSaved] = useState(false);

  // Body progress photo state
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [bodyPhotos, setBodyPhotos] = useState<BodyPhoto[]>(getBodyPhotos(dateParam));
  const [photoAngle, setPhotoAngle] = useState<'front' | 'side' | 'back'>('front');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // Load existing data into form
  useEffect(() => {
    const data = getActivityData(dateParam);
    setActivityData(data);
    const initial: Record<string, number | undefined> = {};
    const config = PERIOD_CONFIG[activePeriod];
    config.fields.forEach(f => {
      const val = (data as any)[f.key];
      if (val != null) {
        if (f.key === 'weight_kg') {
          initial[f.key] = displayWeightValue(val, profile);
        } else if (f.key === 'distance_km' && profile.unit_distance === 'mi') {
          initial[f.key] = kmToMi(val);
        } else {
          initial[f.key] = val;
        }
      }
    });
    setFormData(initial);
    setSaved(false);
  }, [activePeriod, dateParam]);

  function handleSave() {
    const updates: Partial<GarminData> = {};
    Object.entries(formData).forEach(([key, val]) => {
      if (val == null) return;
      if (key === 'weight_kg' && profile.unit_weight === 'lbs') {
        (updates as any)[key] = lbsToKg(val);
      } else if (key === 'distance_km' && profile.unit_distance === 'mi') {
        (updates as any)[key] = miToKm(val);
      } else {
        (updates as any)[key] = val;
      }
    });
    const updated = saveActivityData(updates, dateParam);
    markCheckIn(activePeriod, dateParam);
    setActivityData(updated);
    setCheckIns(getCheckInStatus(dateParam));
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
    const updated = addWorkout(entry, dateParam);
    setActivityData(updated);
    setWorkout({ type: 'Strength', duration_minutes: 45 });
    setShowWorkoutForm(false);
  }

  function handleRemoveWorkout(id: string) {
    const updated = removeWorkout(id, dateParam);
    setActivityData(updated);
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      addBodyPhoto({
        angle: photoAngle,
        image_base64: base64,
        date: dateParam || new Date().toISOString().split('T')[0],
        weight_kg: activityData.weight_kg,
      });
      setBodyPhotos(getBodyPhotos(dateParam));
      // Auto-advance angle
      if (photoAngle === 'front') setPhotoAngle('side');
      else if (photoAngle === 'side') setPhotoAngle('back');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleAnalyzeProgress() {
    if (bodyPhotos.length === 0) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      // Find the most recent previous set of photos
      const allDates = getBodyPhotoDates();
      const currentDateKey = dateParam || new Date().toISOString().split('T')[0];
      const previousDates = allDates.filter(d => d < currentDateKey);
      const previousDate = previousDates[previousDates.length - 1];
      const allPhotos = getAllBodyPhotos();
      const previousPhotos = previousDate ? allPhotos[previousDate] : [];

      const currentFront = bodyPhotos.find(p => p.angle === 'front');
      const previousFront = previousPhotos?.find((p: BodyPhoto) => p.angle === 'front');

      const result = await analyzeBodyProgress({
        current_photo: currentFront?.image_base64 || bodyPhotos[0].image_base64,
        previous_photo: previousFront?.image_base64,
        current_date: currentDateKey,
        previous_date: previousDate,
        current_weight_kg: activityData.weight_kg,
        previous_weight_kg: previousFront?.weight_kg,
      });
      setAiAnalysis(result.analysis);
    } catch (err: any) {
      setAiAnalysis(`Couldn't analyze: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  const periods: Period[] = ['morning', 'midday', 'evening'];
  const config = PERIOD_CONFIG[activePeriod];
  const hasAnyData = Object.values(formData).some(v => v != null);

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white font-display uppercase">Activity Check-in</h1>
          <div className="flex items-center gap-1 mt-0.5">
            <button onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSelectedDate(d);
              setSearchParams({ date: dateToKey(d) });
            }} className="text-slate-400 hover:text-neon-teal transition p-2 -ml-2">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => { setSelectedDate(new Date()); setSearchParams({}); }}
              className="text-xs text-slate-400 hover:text-white transition min-w-[100px] text-center py-1"
            >
              {currentDay ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </button>
            <button onClick={() => {
              if (currentDay) return;
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSelectedDate(d);
              if (isToday(d)) setSearchParams({});
              else setSearchParams({ date: dateToKey(d) });
            }} disabled={currentDay}
              className={`p-2 transition ${currentDay ? 'text-slate-600 cursor-default' : 'text-slate-400 hover:text-neon-teal'}`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
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
            <h2 className="text-sm font-semibold text-white font-ui uppercase tracking-wider">{config.title}</h2>
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
          {config.fields.map(field => {
            // Override label and placeholder for unit-sensitive fields
            let label = field.label;
            let placeholder = field.placeholder;
            if (field.key === 'weight_kg') {
              const unit = weightUnit(profile);
              label = `Weight (${unit})`;
              placeholder = unit === 'lbs' ? '180' : '82.5';
            } else if (field.key === 'distance_km') {
              if (profile.unit_distance === 'mi') {
                label = label.replace('(km)', '(mi)').replace('km', 'mi');
                placeholder = activePeriod === 'midday' ? '2.0' : '4.0';
              }
            }
            return (
              <div key={field.key}>
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 mb-1">
                  {ICON_MAP[field.icon] || <Activity size={14} />} {label}
                </label>
                <input
                  type="number"
                  step={field.step}
                  value={formData[field.key] ?? ''}
                  onChange={e => setFormData(d => ({
                    ...d,
                    [field.key]: e.target.value ? Number(e.target.value) : undefined,
                  }))}
                  placeholder={placeholder}
                  className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm text-white font-data placeholder-slate-600 border border-white/10 focus:border-neon-teal focus:outline-none"
                />
              </div>
            );
          })}
        </div>

        <button onClick={handleSave}
          className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition ${
            saved
              ? 'bg-green-600'
              : 'btn-neon glow-teal'
          }`}
        >
          {saved ? '✓ Saved!' : checkIns[activePeriod] ? 'Update Check-in' : 'Save Check-in'}
        </button>

        {/* Clear / Move data */}
        {hasAnyData && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => {
              const fieldKeys = config.fields.map(f => f.key);
              // Clear this period's fields for this date
              const log = getActivityData(dateParam);
              const cleaned: Partial<GarminData> = { ...log };
              fieldKeys.forEach(k => delete (cleaned as any)[k]);
              // Save cleaned version (overwrite by clearing the activity log for this date then re-saving)
              clearActivityData(dateParam);
              if (Object.keys(cleaned).length > 1) saveActivityData(cleaned, dateParam);
              setActivityData(getActivityData(dateParam));
              setFormData({});
              setSaved(false);
            }}
              className="flex-1 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition"
            >
              <Trash2 size={12} className="inline mr-1" /> Clear {activePeriod} data
            </button>
            <button onClick={() => {
              const fieldKeys = config.fields.map(f => f.key);
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              const yesterdayKey = dateToKey(d);
              const fromKey = dateParam || dateToKey(new Date());
              moveActivityFields(fromKey, yesterdayKey, fieldKeys);
              setActivityData(getActivityData(dateParam));
              setFormData({});
              setSaved(false);
            }}
              className="flex-1 py-2 rounded-lg border border-neon-teal/30 text-neon-teal text-xs hover:bg-neon-teal/10 transition"
            >
              Move to prev day
            </button>
          </div>
        )}
      </div>

      {/* Body Progress Photos (morning check-in) */}
      {activePeriod === 'morning' && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white font-ui uppercase tracking-wider flex items-center gap-2">
              <Camera size={16} className="text-neon-pink" />
              Progress Photos
            </h3>
            <span className="text-[10px] text-slate-500">Optional</span>
          </div>

          {/* Angle selector */}
          <div className="flex gap-2">
            {(['front', 'side', 'back'] as const).map(angle => {
              const hasPhoto = bodyPhotos.some(p => p.angle === angle);
              return (
                <button key={angle} onClick={() => setPhotoAngle(angle)}
                  className={`flex-1 py-2 rounded-lg text-xs capitalize transition ${
                    photoAngle === angle
                      ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/40'
                      : hasPhoto
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-white/5 text-slate-400 border border-white/10'
                  }`}
                >
                  {hasPhoto && <Check size={10} className="inline mr-1" />}
                  {angle}
                </button>
              );
            })}
          </div>

          {/* Photo thumbnails */}
          {bodyPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {bodyPhotos.map(photo => (
                <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-[3/4] bg-white/5">
                  <img
                    src={`data:image/jpeg;base64,${photo.image_base64}`}
                    alt={photo.angle}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 px-2 py-1">
                    <span className="text-[10px] text-white capitalize">{photo.angle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Capture button */}
          <button onClick={() => photoInputRef.current?.click()}
            className="w-full py-3 rounded-xl border border-dashed border-neon-pink/30 bg-neon-pink/5 text-neon-pink text-sm font-medium flex items-center justify-center gap-2 hover:bg-neon-pink/10 transition"
          >
            <Camera size={16} />
            {bodyPhotos.some(p => p.angle === photoAngle)
              ? `Retake ${photoAngle} photo`
              : `Take ${photoAngle} photo`}
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" capture="user" onChange={handlePhotoUpload} className="hidden" />

          {/* AI Analysis button */}
          {bodyPhotos.length > 0 && (
            <button onClick={handleAnalyzeProgress} disabled={analyzing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-neon-pink/20 to-neon-teal/20 border border-neon-pink/20 text-white text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
            >
              {analyzing ? (
                <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
              ) : (
                <><Zap size={14} /> AI Progress Analysis</>
              )}
            </button>
          )}

          {/* AI Analysis result */}
          {aiAnalysis && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] text-neon-teal font-semibold uppercase tracking-wider mb-2">APEX Analysis</div>
              <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
            </div>
          )}

          <p className="text-[10px] text-slate-500 text-center">
            Take consistent photos (same lighting, pose, time of day) for the best comparison over time.
          </p>
        </div>
      )}

      {/* Workouts section (midday + evening) */}
      {(activePeriod === 'midday' || activePeriod === 'evening') && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white font-ui uppercase tracking-wider flex items-center gap-2">
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

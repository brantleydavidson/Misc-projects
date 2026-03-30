import { useState } from 'react';
import { Dumbbell, Watch, Apple, ChevronRight, RotateCcw, Loader2, Footprints, Flame, Heart, Moon, Zap, Activity, X } from 'lucide-react';
import type { UserProfile, GarminData } from '../types';
import { calculateMacros, calculateWaterTarget, calculateTDEE, calculateBMR, getActivityMultiplier } from '../lib/calculations';
import { getGarminData, saveGarminData } from '../lib/storage';

interface ProfileProps {
  profile: UserProfile;
  onUpdate: (data: Partial<UserProfile>) => void;
  onResetOnboarding: () => void;
}

export function Profile({ profile, onUpdate, onResetOnboarding }: ProfileProps) {
  const macros = calculateMacros(profile);
  const tdee = calculateTDEE(profile);
  const bmr = calculateBMR(profile);
  const { label: activityLabel } = getActivityMultiplier(profile);
  const water = calculateWaterTarget(profile);

  const [garminData, setGarminData] = useState<GarminData | null>(getGarminData());
  const [garminConnecting, setGarminConnecting] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualData, setManualData] = useState<Partial<GarminData>>({
    steps: garminData?.steps || undefined,
    calories_burned: garminData?.calories_burned || undefined,
    heart_rate_avg: garminData?.heart_rate_avg || undefined,
    heart_rate_resting: garminData?.heart_rate_resting || undefined,
    sleep_hours: garminData?.sleep_hours || undefined,
    body_battery: garminData?.body_battery || undefined,
    stress_level: garminData?.stress_level || undefined,
    active_minutes: garminData?.active_minutes || undefined,
    floors_climbed: garminData?.floors_climbed || undefined,
    distance_km: garminData?.distance_km || undefined,
  });

  async function connectGarmin() {
    setGarminConnecting(true);
    setGarminError(null);
    try {
      const res = await fetch('/.netlify/functions/garmin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_request_token' }),
      });
      const data = await res.json();

      if (data.setup_required) {
        setGarminError('Garmin API keys not yet configured. Add GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET to your Netlify env vars.');
        return;
      }

      if (data.auth_url) {
        // Store the request token for the callback
        localStorage.setItem('garmin_oauth_token', data.oauth_token);
        window.open(data.auth_url, '_blank');
      } else {
        setGarminError(data.error || 'Failed to start Garmin connection');
      }
    } catch (err: any) {
      setGarminError(err.message || 'Connection failed');
    } finally {
      setGarminConnecting(false);
    }
  }

  function disconnectGarmin() {
    localStorage.removeItem('garmin_access_token');
    localStorage.removeItem('garmin_access_token_secret');
    saveGarminData({} as GarminData);
    setGarminData(null);
    onUpdate({});
  }

  function saveManualData() {
    const data: GarminData = {
      ...manualData,
      last_synced: new Date().toISOString(),
    };
    saveGarminData(data);
    setGarminData(data);
    setShowManualEntry(false);
  }

  const isGarminConnected = !!localStorage.getItem('garmin_access_token');

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="text-center py-4">
        <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
          <Dumbbell size={36} className="text-white" />
        </div>
        <h1 className="text-xl font-bold gradient-text">JackedAI</h1>
        <p className="text-sm text-slate-400">Your AI fitness coach</p>
      </div>

      {/* Stats Overview */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Your Stats</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatItem label="Age" value={`${profile.age || '—'}`} />
          <StatItem label="Height" value={profile.height_cm ? `${profile.height_cm}cm` : '—'} />
          <StatItem label="Current" value={profile.current_weight_kg ? `${profile.current_weight_kg}kg` : '—'} />
          <StatItem label="Goal" value={profile.goal_weight_kg ? `${profile.goal_weight_kg}kg` : '—'} />
        </div>
      </div>

      {/* Targets */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Daily Targets</h2>
        <div className="space-y-2 text-sm">
          <Row label="BMR" value={`${Math.round(bmr)} cal`} />
          <Row label="Activity" value={activityLabel} />
          <Row label="TDEE" value={`${tdee} cal`} />
          <Row label="Calorie Target" value={`${macros.calories} cal`} highlight />
          <div className="border-t border-white/10 pt-2 mt-2 grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-cyan-400">{macros.protein}g</div>
              <div className="text-[10px] text-slate-400">Protein</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-400">{macros.carbs}g</div>
              <div className="text-[10px] text-slate-400">Carbs</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-pink-400">{macros.fat}g</div>
              <div className="text-[10px] text-slate-400">Fat</div>
            </div>
          </div>
          <Row label="Water" value={`${water}L / day`} />
        </div>
      </div>

      {/* Health Data Connections */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Health Data</h2>

        {garminError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {garminError}
          </div>
        )}

        {/* Garmin Connect */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Watch size={18} className="text-blue-400" />
            <span className="text-sm text-slate-300">Garmin Connect</span>
          </div>
          {isGarminConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Connected</span>
              <button onClick={disconnectGarmin} className="text-xs text-red-400 hover:text-red-300">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectGarmin} disabled={garminConnecting}
              className="text-xs px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition disabled:opacity-50 flex items-center gap-1"
            >
              {garminConnecting ? <Loader2 size={12} className="animate-spin" /> : null}
              Connect
            </button>
          )}
        </div>

        {/* Apple Health */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Apple size={18} className="text-red-400" />
            <span className="text-sm text-slate-300">Apple Health</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-slate-500/20 text-slate-400">
            Requires native app
          </span>
        </div>

        {/* Manual entry toggle */}
        <div className="border-t border-white/10 pt-3">
          <button onClick={() => setShowManualEntry(!showManualEntry)}
            className="w-full flex items-center justify-between text-sm text-slate-300 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Activity size={16} className="text-green-400" />
              Enter Activity Manually
            </span>
            <ChevronRight size={16} className={`text-slate-500 transition ${showManualEntry ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Manual Activity Entry */}
      {showManualEntry && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-white">Today's Activity Data</h2>
            <button onClick={() => setShowManualEntry(false)} className="text-slate-500"><X size={16} /></button>
          </div>
          <p className="text-xs text-slate-400">Enter data from your Garmin/watch to feed the AI coach</p>

          <div className="grid grid-cols-2 gap-3">
            <ManualInput icon={<Footprints size={14} className="text-green-400" />} label="Steps"
              value={manualData.steps} onChange={v => setManualData(d => ({ ...d, steps: v }))} />
            <ManualInput icon={<Flame size={14} className="text-orange-400" />} label="Calories Burned"
              value={manualData.calories_burned} onChange={v => setManualData(d => ({ ...d, calories_burned: v }))} />
            <ManualInput icon={<Heart size={14} className="text-red-400" />} label="Avg Heart Rate"
              value={manualData.heart_rate_avg} onChange={v => setManualData(d => ({ ...d, heart_rate_avg: v }))} />
            <ManualInput icon={<Heart size={14} className="text-pink-400" />} label="Resting HR"
              value={manualData.heart_rate_resting} onChange={v => setManualData(d => ({ ...d, heart_rate_resting: v }))} />
            <ManualInput icon={<Moon size={14} className="text-indigo-400" />} label="Sleep Hours"
              value={manualData.sleep_hours} onChange={v => setManualData(d => ({ ...d, sleep_hours: v }))} step="0.1" />
            <ManualInput icon={<Zap size={14} className="text-yellow-400" />} label="Active Minutes"
              value={manualData.active_minutes} onChange={v => setManualData(d => ({ ...d, active_minutes: v }))} />
            <ManualInput icon={<Activity size={14} className="text-cyan-400" />} label="Body Battery"
              value={manualData.body_battery} onChange={v => setManualData(d => ({ ...d, body_battery: v }))} />
            <ManualInput icon={<Activity size={14} className="text-purple-400" />} label="Stress Level"
              value={manualData.stress_level} onChange={v => setManualData(d => ({ ...d, stress_level: v }))} />
          </div>

          <button onClick={saveManualData}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-cyan-500 text-white text-sm font-semibold"
          >
            Save Activity Data
          </button>

          {garminData?.last_synced && (
            <p className="text-[10px] text-slate-500 text-center">
              Last updated: {new Date(garminData.last_synced).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Current Garmin Data Display */}
      {garminData && (garminData.steps || garminData.calories_burned || garminData.sleep_hours) && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Current Activity Data</h2>
          <div className="grid grid-cols-3 gap-3">
            {garminData.steps != null && <MiniStat icon="👟" label="Steps" value={garminData.steps.toLocaleString()} />}
            {garminData.calories_burned != null && <MiniStat icon="🔥" label="Burned" value={`${garminData.calories_burned}`} />}
            {garminData.active_minutes != null && <MiniStat icon="⚡" label="Active" value={`${garminData.active_minutes}m`} />}
            {garminData.heart_rate_avg != null && <MiniStat icon="❤️" label="Avg HR" value={`${garminData.heart_rate_avg}`} />}
            {garminData.heart_rate_resting != null && <MiniStat icon="💗" label="Rest HR" value={`${garminData.heart_rate_resting}`} />}
            {garminData.sleep_hours != null && <MiniStat icon="😴" label="Sleep" value={`${garminData.sleep_hours}h`} />}
            {garminData.body_battery != null && <MiniStat icon="🔋" label="Battery" value={`${garminData.body_battery}`} />}
            {garminData.stress_level != null && <MiniStat icon="😤" label="Stress" value={`${garminData.stress_level}`} />}
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            This data feeds into your AI coach for personalized advice
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button onClick={onResetOnboarding}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass text-slate-300 hover:text-white transition"
        >
          <span className="flex items-center gap-2 text-sm">
            <RotateCcw size={16} /> Redo Setup
          </span>
          <ChevronRight size={16} className="text-slate-500" />
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/5 text-center">
      <div className="text-white font-bold">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={highlight ? 'text-white font-bold text-sm' : 'text-slate-200 text-sm'}>{value}</span>
    </div>
  );
}

function ManualInput({ icon, label, value, onChange, step }: {
  icon: React.ReactNode; label: string; value: number | undefined;
  onChange: (v: number | undefined) => void; step?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 mb-1">
        {icon} {label}
      </label>
      <input
        type="number"
        step={step}
        value={value || ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
        placeholder="—"
        className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-cyan-400 focus:outline-none"
      />
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded-xl bg-white/5">
      <div className="text-sm">{icon}</div>
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

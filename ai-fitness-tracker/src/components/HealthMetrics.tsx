import { useNavigate } from 'react-router-dom';
import {
  Battery, Heart, Brain, Moon, Activity, Zap, Watch,
} from 'lucide-react';
import type { HealthSnapshot } from '../types/health';

interface HealthMetricsProps {
  snapshot: HealthSnapshot | null;
  loading: boolean;
}

export function HealthMetrics({ snapshot, loading }: HealthMetricsProps) {
  const navigate = useNavigate();

  // No data / not connected
  if (!loading && !snapshot) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-neon-teal" />
          <h2 className="text-sm font-semibold text-white font-ui uppercase tracking-wider">Biometrics</h2>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-4 py-4 hover:bg-white/5 rounded-xl transition"
        >
          <div className="w-12 h-12 rounded-xl bg-neon-teal/10 flex items-center justify-center flex-shrink-0">
            <Watch size={22} className="text-neon-teal" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold text-white">Connect your Garmin</div>
            <div className="text-[10px] text-slate-400">See biometrics, sleep, stress, and recovery data here</div>
          </div>
        </button>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-neon-teal" />
          <h2 className="text-sm font-semibold text-white font-ui uppercase tracking-wider">Biometrics</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-3 animate-pulse">
              <div className="w-5 h-5 bg-white/10 rounded mx-auto mb-2" />
              <div className="w-8 h-4 bg-white/10 rounded mx-auto mb-1" />
              <div className="w-10 h-2 bg-white/5 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Compute recovery score from available data
  const recoveryScore = computeRecovery(snapshot!);
  const sleepQuality = getSleepQuality(snapshot?.sleep_score);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-neon-teal" />
        <h2 className="text-sm font-semibold text-white font-ui uppercase tracking-wider">Biometrics</h2>
        {snapshot?.last_sync && (
          <span className="ml-auto text-[9px] text-slate-500">
            {formatSyncTime(snapshot.last_sync)}
          </span>
        )}
      </div>

      {/* Row 1: Body Battery, Stress, HRV, Resting HR */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        {/* Body Battery */}
        <MetricTile
          icon={<Battery size={14} />}
          iconColor={getBatteryColor(snapshot?.body_battery)}
          value={snapshot?.body_battery != null ? `${snapshot.body_battery}` : '--'}
          label="Battery"
        >
          {snapshot?.body_battery != null && (
            <BatteryRing value={snapshot.body_battery} />
          )}
        </MetricTile>

        {/* Stress */}
        <MetricTile
          icon={<Brain size={14} />}
          iconColor={getStressColor(snapshot?.stress_level)}
          value={snapshot?.stress_level != null ? `${snapshot.stress_level}` : '--'}
          label="Stress"
        />

        {/* HRV */}
        <MetricTile
          icon={<Activity size={14} />}
          iconColor="text-neon-teal"
          value={snapshot?.hrv != null ? `${snapshot.hrv}` : '--'}
          label="HRV"
          unit="ms"
        />

        {/* Resting HR */}
        <MetricTile
          icon={<Heart size={14} />}
          iconColor="text-red-400"
          value={snapshot?.heart_rate_resting != null ? `${snapshot.heart_rate_resting}` : '--'}
          label="Rest HR"
          unit="bpm"
        />
      </div>

      {/* Row 2: Sleep Score, Sleep Duration, Recovery */}
      <div className="grid grid-cols-3 gap-2">
        {/* Sleep Score */}
        <MetricTile
          icon={<Moon size={14} />}
          iconColor="text-indigo-400"
          value={snapshot?.sleep_score != null ? `${snapshot.sleep_score}` : '--'}
          label="Sleep"
        >
          {sleepQuality && (
            <div className={`text-[9px] mt-0.5 ${sleepQuality.color}`}>
              {sleepQuality.label}
            </div>
          )}
        </MetricTile>

        {/* Sleep Duration + Stages */}
        <div className="glass rounded-xl p-3 text-center">
          <div className="flex justify-center mb-1.5 text-indigo-400">
            <Moon size={14} />
          </div>
          <div className="text-sm font-bold text-white font-data">
            {snapshot?.sleep_hours != null ? `${snapshot.sleep_hours.toFixed(1)}` : '--'}
          </div>
          <div className="text-[10px] text-chrome/40 font-ui uppercase">Hours</div>
          {snapshot?.sleep_stages && (
            <SleepStagesBar stages={snapshot.sleep_stages} totalHours={snapshot.sleep_hours || 0} />
          )}
        </div>

        {/* Recovery */}
        <MetricTile
          icon={<Zap size={14} />}
          iconColor={getRecoveryColor(recoveryScore)}
          value={recoveryScore != null ? `${recoveryScore}` : '--'}
          label="Recovery"
        >
          {recoveryScore != null && (
            <div className={`text-[9px] mt-0.5 ${getRecoveryColor(recoveryScore)}`}>
              {getRecoveryLabel(recoveryScore)}
            </div>
          )}
        </MetricTile>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

interface MetricTileProps {
  icon: React.ReactNode;
  iconColor: string;
  value: string;
  label: string;
  unit?: string;
  children?: React.ReactNode;
}

function MetricTile({ icon, iconColor, value, label, unit, children }: MetricTileProps) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <div className={`flex justify-center mb-1.5 ${iconColor}`}>{icon}</div>
      <div className="text-sm font-bold text-white font-data">
        {value}
        {unit && value !== '--' && <span className="text-[9px] text-slate-500 ml-0.5">{unit}</span>}
      </div>
      <div className="text-[10px] text-chrome/40 font-ui uppercase">{label}</div>
      {children}
    </div>
  );
}

function BatteryRing({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color = value >= 70 ? '#22c55e' : value >= 40 ? '#eab308' : '#ef4444';

  return (
    <div className="flex justify-center mt-1">
      <svg width={30} height={30} className="-rotate-90">
        <circle cx={15} cy={15} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
        <circle
          cx={15} cy={15} r={radius} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
    </div>
  );
}

function SleepStagesBar({ stages, totalHours }: { stages: { light: number; deep: number; rem: number; awake: number }; totalHours: number }) {
  if (totalHours <= 0) return null;
  const total = stages.light + stages.deep + stages.rem + stages.awake;
  if (total <= 0) return null;

  const pcts = {
    light: (stages.light / total) * 100,
    deep: (stages.deep / total) * 100,
    rem: (stages.rem / total) * 100,
    awake: (stages.awake / total) * 100,
  };

  return (
    <div className="mt-1.5">
      <div className="h-1.5 rounded-full overflow-hidden flex">
        <div className="bg-slate-500" style={{ width: `${pcts.light}%` }} title={`Light: ${stages.light.toFixed(1)}h`} />
        <div className="bg-indigo-500" style={{ width: `${pcts.deep}%` }} title={`Deep: ${stages.deep.toFixed(1)}h`} />
        <div className="bg-purple-500" style={{ width: `${pcts.rem}%` }} title={`REM: ${stages.rem.toFixed(1)}h`} />
        <div className="bg-red-500" style={{ width: `${pcts.awake}%` }} title={`Awake: ${stages.awake.toFixed(1)}h`} />
      </div>
      <div className="flex justify-between mt-1 text-[8px] text-slate-500">
        <span>L</span>
        <span>D</span>
        <span>R</span>
        <span>A</span>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function getBatteryColor(value?: number): string {
  if (value == null) return 'text-slate-400';
  if (value >= 70) return 'text-green-400';
  if (value >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function getStressColor(value?: number): string {
  if (value == null) return 'text-slate-400';
  if (value < 30) return 'text-green-400';
  if (value <= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function getSleepQuality(score?: number): { label: string; color: string } | null {
  if (score == null) return null;
  if (score >= 80) return { label: 'Excellent', color: 'text-green-400' };
  if (score >= 60) return { label: 'Good', color: 'text-neon-teal' };
  if (score >= 40) return { label: 'Fair', color: 'text-yellow-400' };
  return { label: 'Poor', color: 'text-red-400' };
}

function computeRecovery(snapshot: HealthSnapshot): number | null {
  const hasData = snapshot.body_battery != null || snapshot.hrv != null || snapshot.sleep_score != null;
  if (!hasData) return null;

  // Weighted average: body battery (40%), HRV normalized (30%), sleep score (30%)
  let score = 0;
  let weight = 0;

  if (snapshot.body_battery != null) {
    score += snapshot.body_battery * 0.4;
    weight += 0.4;
  }
  if (snapshot.hrv != null) {
    // Normalize HRV: assume 20ms = 0%, 100ms+ = 100%
    const hrvNorm = Math.min(Math.max((snapshot.hrv - 20) / 80, 0), 1) * 100;
    score += hrvNorm * 0.3;
    weight += 0.3;
  }
  if (snapshot.sleep_score != null) {
    score += snapshot.sleep_score * 0.3;
    weight += 0.3;
  }

  return weight > 0 ? Math.round(score / weight) : null;
}

function getRecoveryColor(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 70) return 'text-green-400';
  if (score >= 45) return 'text-yellow-400';
  return 'text-red-400';
}

function getRecoveryLabel(score: number): string {
  if (score >= 70) return 'Ready';
  if (score >= 45) return 'Moderate';
  return 'Low';
}

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Synced just now';
  if (diffMin < 60) return `Synced ${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Synced ${diffHr}h ago`;

  return `Synced ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

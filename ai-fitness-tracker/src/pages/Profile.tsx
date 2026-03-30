import { Dumbbell, Watch, Apple, ChevronRight, RotateCcw } from 'lucide-react';
import type { UserProfile } from '../types';
import { calculateMacros, calculateWaterTarget, calculateTDEE, calculateBMR, getActivityMultiplier } from '../lib/calculations';

interface ProfileProps {
  profile: UserProfile;
  onUpdate: (data: Partial<UserProfile>) => void;
  onResetOnboarding: () => void;
}

export function Profile({ profile, onResetOnboarding }: ProfileProps) {
  const macros = calculateMacros(profile);
  const tdee = calculateTDEE(profile);
  const bmr = calculateBMR(profile);
  const { label: activityLabel } = getActivityMultiplier(profile);
  const water = calculateWaterTarget(profile);

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
        <ConnectionItem icon={<Watch size={18} className="text-blue-400" />} name="Garmin Connect" status="coming_soon" />
        <ConnectionItem icon={<Apple size={18} className="text-red-400" />} name="Apple Health" status="coming_soon" />
      </div>

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

function ConnectionItem({ icon, name, status }: { icon: React.ReactNode; name: string; status: 'connected' | 'coming_soon' }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm text-slate-300">{name}</span>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full ${
        status === 'connected'
          ? 'bg-green-500/20 text-green-400'
          : 'bg-slate-500/20 text-slate-400'
      }`}>
        {status === 'connected' ? 'Connected' : 'Coming Soon'}
      </span>
    </div>
  );
}

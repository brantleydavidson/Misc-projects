import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Droplets, Flame, Footprints, Heart, Moon, Zap } from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import { MacroBar } from '../components/MacroBar';
import type { UserProfile, GarminData } from '../types';
import { getDailySummary, getGarminData, addWater, getWaterIntake } from '../lib/storage';

interface DashboardProps {
  profile: UserProfile;
}

export function Dashboard({ profile }: DashboardProps) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(getDailySummary());
  const [garmin] = useState<GarminData | null>(getGarminData());
  const [water, setWater] = useState(getWaterIntake());

  useEffect(() => {
    const interval = setInterval(() => {
      setSummary(getDailySummary());
      setWater(getWaterIntake());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const targets = {
    calories: profile.calorie_target || 2000,
    protein: profile.protein_target || 150,
    carbs: profile.carb_target || 200,
    fat: profile.fat_target || 65,
    water: (profile.water_target_liters || 3) * 1000,
  };

  const caloriesLeft = Math.max(targets.calories - summary.calories, 0);
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-lg font-bold text-white">{greeting} 💪</h1>
          <p className="text-xs text-slate-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={() => navigate('/snap')}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-lg"
        >
          <Camera size={18} className="text-white" />
        </button>
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
              <span className="text-xs text-slate-300">{garmin?.calories_burned || '—'} burned</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-semibold">Target: {targets.calories} cal</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {summary.entries.length} meals logged today
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

      {/* Garmin Stats */}
      <div className="glass rounded-2xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-white">Activity</h2>
          {garmin?.last_synced ? (
            <span className="text-[10px] text-green-400">Garmin synced</span>
          ) : (
            <button onClick={() => navigate('/profile')} className="text-[10px] text-cyan-400">Connect Garmin</button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon={<Footprints size={14} />} label="Steps" value={garmin?.steps?.toLocaleString() || '—'} color="text-green-400" />
          <StatCard icon={<Flame size={14} />} label="Burned" value={garmin?.calories_burned ? `${garmin.calories_burned}` : '—'} color="text-orange-400" />
          <StatCard icon={<Heart size={14} />} label="HR" value={garmin?.heart_rate_avg ? `${garmin.heart_rate_avg}` : '—'} color="text-red-400" />
          <StatCard icon={<Moon size={14} />} label="Sleep" value={garmin?.sleep_hours ? `${garmin.sleep_hours}h` : '—'} color="text-indigo-400" />
        </div>
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

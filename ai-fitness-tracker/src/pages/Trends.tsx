import { useState, useMemo } from 'react';
import {
  TrendingUp, Flame, Droplets, Footprints, Heart, Moon, Zap,
  Activity, Brain, Battery, Scale, Dumbbell,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { getHistoricalData, type DaySnapshot } from '../lib/storage';
import { displayWeight } from '../lib/units';

interface TrendsProps {
  profile: UserProfile;
}

type TimeRange = 7 | 14 | 30;
type Tab = 'nutrition' | 'body' | 'activity';

export function Trends({ profile }: TrendsProps) {
  const [range, setRange] = useState<TimeRange>(14);
  const [tab, setTab] = useState<Tab>('nutrition');

  const data = useMemo(() => getHistoricalData(range), [range]);
  const targets = {
    calories: profile.calorie_target || 2000,
    protein: profile.protein_target || 150,
    carbs: profile.carb_target || 200,
    fat: profile.fat_target || 65,
    water: (profile.water_target_liters || 3) * 1000,
  };

  // Stats calculations
  const daysWithFood = data.filter(d => d.calories > 0);
  const avgCalories = daysWithFood.length > 0
    ? Math.round(daysWithFood.reduce((s, d) => s + d.calories, 0) / daysWithFood.length)
    : 0;
  const avgProtein = daysWithFood.length > 0
    ? Math.round(daysWithFood.reduce((s, d) => s + d.protein, 0) / daysWithFood.length)
    : 0;

  const daysWithSteps = data.filter(d => d.steps && d.steps > 0);
  const avgSteps = daysWithSteps.length > 0
    ? Math.round(daysWithSteps.reduce((s, d) => s + (d.steps || 0), 0) / daysWithSteps.length)
    : 0;

  const daysWithSleep = data.filter(d => d.sleep_hours && d.sleep_hours > 0);
  const avgSleep = daysWithSleep.length > 0
    ? Math.round(daysWithSleep.reduce((s, d) => s + (d.sleep_hours || 0), 0) / daysWithSleep.length * 10) / 10
    : 0;

  const totalWorkouts = data.reduce((s, d) => s + d.workouts, 0);
  const streak = calculateStreak(data);

  // Weight trend
  const weightEntries = data.filter(d => d.weight_kg != null && d.weight_kg > 0);
  const latestWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight_kg! : null;
  const earliestWeight = weightEntries.length > 1 ? weightEntries[0].weight_kg! : null;
  const weightDelta = latestWeight && earliestWeight ? latestWeight - earliestWeight : null;

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-white font-display flex items-center gap-2">
            <TrendingUp size={20} className="text-neon-teal" />
            Trends
          </h1>
          <p className="text-xs text-slate-400">Track your progress over time</p>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {([7, 14, 30] as TimeRange[]).map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition ${
              range === r
                ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/30'
                : 'glass text-slate-400 border border-white/5'
            }`}
          >
            {r}D
          </button>
        ))}
      </div>

      {/* Summary cards row */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard icon={<Flame size={14} />} label="Avg Cal" value={avgCalories > 0 ? `${avgCalories}` : '—'} color="text-orange-400" />
        <SummaryCard icon={<Zap size={14} />} label="Avg Protein" value={avgProtein > 0 ? `${avgProtein}g` : '—'} color="text-neon-teal" />
        <SummaryCard icon={<Dumbbell size={14} />} label="Workouts" value={`${totalWorkouts}`} color="text-neon-pink" />
        <SummaryCard icon={<Activity size={14} />} label="Streak" value={streak > 0 ? `${streak}d` : '—'} color="text-yellow-400" />
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 p-1 glass rounded-xl">
        {(['nutrition', 'body', 'activity'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition ${
              tab === t ? 'bg-neon-teal/20 text-neon-teal' : 'text-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'nutrition' && (
        <div className="space-y-4">
          {/* Calorie chart */}
          <ChartCard title="Calories" icon={<Flame size={14} className="text-orange-400" />}>
            <BarChart
              data={data.map(d => d.calories)}
              labels={data.map(d => formatDayLabel(d.date))}
              target={targets.calories}
              color="#FF8C00"
              maxVal={Math.max(targets.calories * 1.3, ...data.map(d => d.calories))}
            />
          </ChartCard>

          {/* Protein chart */}
          <ChartCard title="Protein" icon={<Zap size={14} className="text-neon-teal" />}>
            <BarChart
              data={data.map(d => d.protein)}
              labels={data.map(d => formatDayLabel(d.date))}
              target={targets.protein}
              color="#00E5CC"
              maxVal={Math.max(targets.protein * 1.3, ...data.map(d => d.protein))}
            />
          </ChartCard>

          {/* Macro split (carbs + fat) */}
          <div className="grid grid-cols-2 gap-3">
            <ChartCard title="Carbs" icon={<Activity size={14} className="text-neon-pink" />} compact>
              <MiniBarChart data={data.map(d => d.carbs)} target={targets.carbs} color="#FF2D78" />
            </ChartCard>
            <ChartCard title="Fat" icon={<Activity size={14} className="text-yellow-400" />} compact>
              <MiniBarChart data={data.map(d => d.fat)} target={targets.fat} color="#FFB800" />
            </ChartCard>
          </div>

          {/* Water chart */}
          <ChartCard title="Hydration" icon={<Droplets size={14} className="text-blue-400" />}>
            <BarChart
              data={data.map(d => d.water_ml)}
              labels={data.map(d => formatDayLabel(d.date))}
              target={targets.water}
              color="#60A5FA"
              maxVal={Math.max(targets.water * 1.3, ...data.map(d => d.water_ml))}
              formatVal={v => v >= 1000 ? `${(v / 1000).toFixed(1)}L` : `${v}ml`}
            />
          </ChartCard>
        </div>
      )}

      {tab === 'body' && (
        <div className="space-y-4">
          {/* Weight trend */}
          <ChartCard title="Weight" icon={<Scale size={14} className="text-white" />}
            subtitle={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${displayWeight(Math.abs(weightDelta), profile)} ${weightDelta <= 0 ? 'lost' : 'gained'}` : undefined}
            subtitleColor={weightDelta != null ? (weightDelta <= 0 ? 'text-green-400' : 'text-red-400') : undefined}
          >
            {weightEntries.length > 1 ? (
              <LineChart
                data={weightEntries.map(d => d.weight_kg!)}
                labels={weightEntries.map(d => formatDayLabel(d.date))}
                color="#00E5CC"
                formatVal={v => `${profile.unit_weight === 'kg' ? v.toFixed(1) : (v * 2.205).toFixed(1)}`}
              />
            ) : (
              <EmptyState text="Log weight in morning check-ins to see trends" />
            )}
          </ChartCard>

          {/* Resting HR */}
          <ChartCard title="Resting Heart Rate" icon={<Heart size={14} className="text-red-400" />}>
            {data.some(d => d.heart_rate_resting) ? (
              <LineChart
                data={data.filter(d => d.heart_rate_resting).map(d => d.heart_rate_resting!)}
                labels={data.filter(d => d.heart_rate_resting).map(d => formatDayLabel(d.date))}
                color="#EF4444"
                formatVal={v => `${v} bpm`}
              />
            ) : (
              <EmptyState text="Log resting HR to see trends" />
            )}
          </ChartCard>

          {/* HRV */}
          <ChartCard title="Heart Rate Variability" icon={<Activity size={14} className="text-neon-teal" />}>
            {data.some(d => d.hrv_status) ? (
              <LineChart
                data={data.filter(d => d.hrv_status).map(d => d.hrv_status!)}
                labels={data.filter(d => d.hrv_status).map(d => formatDayLabel(d.date))}
                color="#00E5CC"
                formatVal={v => `${v} ms`}
              />
            ) : (
              <EmptyState text="Log HRV data to see trends" />
            )}
          </ChartCard>

          {/* Body Battery */}
          <ChartCard title="Body Battery" icon={<Battery size={14} className="text-green-400" />}>
            {data.some(d => d.body_battery_morning) ? (
              <BarChart
                data={data.map(d => d.body_battery_morning || 0)}
                labels={data.map(d => formatDayLabel(d.date))}
                color="#22C55E"
                maxVal={100}
              />
            ) : (
              <EmptyState text="Log body battery to see trends" />
            )}
          </ChartCard>
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-4">
          {/* Steps */}
          <ChartCard title="Steps" icon={<Footprints size={14} className="text-green-400" />}
            subtitle={avgSteps > 0 ? `Avg: ${avgSteps.toLocaleString()}` : undefined}
          >
            {data.some(d => d.steps) ? (
              <BarChart
                data={data.map(d => d.steps || 0)}
                labels={data.map(d => formatDayLabel(d.date))}
                color="#22C55E"
                maxVal={Math.max(15000, ...data.map(d => d.steps || 0))}
                formatVal={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
              />
            ) : (
              <EmptyState text="Log steps to see trends" />
            )}
          </ChartCard>

          {/* Active calories */}
          <ChartCard title="Active Calories" icon={<Flame size={14} className="text-orange-400" />}>
            {data.some(d => d.calories_active) ? (
              <BarChart
                data={data.map(d => d.calories_active || 0)}
                labels={data.map(d => formatDayLabel(d.date))}
                color="#FB923C"
                maxVal={Math.max(800, ...data.map(d => d.calories_active || 0))}
              />
            ) : (
              <EmptyState text="Log active calories to see trends" />
            )}
          </ChartCard>

          {/* Sleep */}
          <ChartCard title="Sleep" icon={<Moon size={14} className="text-indigo-400" />}
            subtitle={avgSleep > 0 ? `Avg: ${avgSleep}h` : undefined}
          >
            {data.some(d => d.sleep_hours) ? (
              <BarChart
                data={data.map(d => d.sleep_hours || 0)}
                labels={data.map(d => formatDayLabel(d.date))}
                color="#818CF8"
                maxVal={10}
                target={8}
                formatVal={v => `${v}h`}
              />
            ) : (
              <EmptyState text="Log sleep to see trends" />
            )}
          </ChartCard>

          {/* Stress */}
          <ChartCard title="Stress Level" icon={<Brain size={14} className="text-neon-pink" />}>
            {data.some(d => d.stress_level) ? (
              <BarChart
                data={data.map(d => d.stress_level || 0)}
                labels={data.map(d => formatDayLabel(d.date))}
                color="#FF2D78"
                maxVal={100}
              />
            ) : (
              <EmptyState text="Log stress data to see trends" />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}

// ── Chart components (pure CSS, no library) ──────────────────────────

function BarChart({ data, labels, target, color, maxVal, formatVal }: {
  data: number[];
  labels: string[];
  target?: number;
  color: string;
  maxVal?: number;
  formatVal?: (v: number) => string;
}) {
  const max = maxVal || Math.max(...data, target || 0) * 1.1 || 100;
  const fmt = formatVal || ((v: number) => `${Math.round(v)}`);

  return (
    <div className="relative">
      {/* Target line */}
      {target != null && target > 0 && (
        <div className="absolute left-0 right-0 border-t border-dashed border-white/20 z-10"
          style={{ bottom: `${(target / max) * 100}%` }}
        >
          <span className="absolute -top-3 right-0 text-[9px] text-slate-500">{fmt(target)}</span>
        </div>
      )}

      <div className="flex items-end gap-[2px] h-28">
        {data.map((v, i) => {
          const height = v > 0 ? Math.max(2, (v / max) * 100) : 0;
          const overTarget = target ? v >= target : false;

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              {/* Tooltip */}
              <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition pointer-events-none
                bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-20">
                {fmt(v)}
              </div>
              <div
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: `${height}%`,
                  backgroundColor: overTarget ? color : `${color}99`,
                  minHeight: v > 0 ? '2px' : '0px',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels (show every Nth) */}
      <div className="flex gap-[2px] mt-1">
        {labels.map((label, i) => {
          const showLabel = data.length <= 7 || i % Math.ceil(data.length / 7) === 0 || i === data.length - 1;
          return (
            <div key={i} className="flex-1 text-center">
              <span className={`text-[8px] text-slate-600 ${showLabel ? '' : 'invisible'}`}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniBarChart({ data, target, color }: { data: number[]; target: number; color: string }) {
  const max = Math.max(target * 1.3, ...data) || 100;
  const avg = data.filter(v => v > 0).length > 0
    ? Math.round(data.filter(v => v > 0).reduce((s, v) => s + v, 0) / data.filter(v => v > 0).length)
    : 0;

  return (
    <div>
      <div className="flex items-end gap-[1px] h-16 mb-1">
        {data.map((v, i) => (
          <div key={i} className="flex-1 rounded-t transition-all"
            style={{
              height: `${v > 0 ? Math.max(2, (v / max) * 100) : 0}%`,
              backgroundColor: `${color}${v >= target ? 'FF' : '88'}`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px]">
        <span className="text-slate-500">target: {target}g</span>
        <span className="text-slate-400">avg: {avg}g</span>
      </div>
    </div>
  );
}

function LineChart({ data, labels, color, formatVal }: {
  data: number[];
  labels: string[];
  color: string;
  formatVal?: (v: number) => string;
}) {
  if (data.length < 2) return <EmptyState text="Need at least 2 data points" />;

  const min = Math.min(...data) * 0.95;
  const max = Math.max(...data) * 1.05;
  const range = max - min || 1;
  const fmt = formatVal || ((v: number) => `${Math.round(v)}`);

  // SVG line chart
  const width = 300;
  const height = 100;
  const padding = 4;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * plotW,
    y: padding + plotH - ((v - min) / range) * plotH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[9px] text-slate-500">
        <span>{fmt(max)}</span>
        <span>{fmt(min)}</span>
      </div>

      <div className="ml-10">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" preserveAspectRatio="none">
          {/* Gradient fill */}
          <defs>
            <linearGradient id={`grad-${color}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#grad-${color})`} />
          <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Dots */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} className="opacity-80" />
          ))}
        </svg>

        {/* X labels */}
        <div className="flex justify-between mt-1">
          {labels.length <= 10 ? labels.map((l, i) => (
            <span key={i} className="text-[8px] text-slate-600">{l}</span>
          )) : (
            <>
              <span className="text-[8px] text-slate-600">{labels[0]}</span>
              <span className="text-[8px] text-slate-600">{labels[Math.floor(labels.length / 2)]}</span>
              <span className="text-[8px] text-slate-600">{labels[labels.length - 1]}</span>
            </>
          )}
        </div>
      </div>

      {/* Latest value callout */}
      <div className="absolute top-0 right-0 text-right">
        <div className="text-sm font-bold font-data" style={{ color }}>{fmt(data[data.length - 1])}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, subtitle, subtitleColor, compact, children }: {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  subtitleColor?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`glass rounded-2xl ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {subtitle && (
          <span className={`text-xs ${subtitleColor || 'text-slate-400'}`}>{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <div className="text-sm font-bold text-white font-data">{value}</div>
      <div className="text-[9px] text-slate-400">{label}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-24 flex items-center justify-center">
      <p className="text-xs text-slate-500 text-center">{text}</p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calculateStreak(data: DaySnapshot[]): number {
  let streak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].calories > 0 || data[i].steps || data[i].workouts > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

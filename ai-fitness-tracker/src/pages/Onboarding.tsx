import { useState } from 'react';
import { ChevronRight, ChevronLeft, Dumbbell } from 'lucide-react';
import type { UserProfile } from '../types';
import { calculateMacros, calculateWaterTarget, calculateBMR, calculateTDEE, getActivityMultiplier } from '../lib/calculations';

interface OnboardingProps {
  profile: UserProfile;
  onUpdate: (data: Partial<UserProfile>) => void;
  onComplete: () => void;
}

const SECTIONS = ['stats', 'lifestyle', 'food', 'snacks', 'review'] as const;

export function Onboarding({ profile, onUpdate, onComplete }: OnboardingProps) {
  const [section, setSection] = useState(0);
  const [localData, setLocalData] = useState<Partial<UserProfile>>(profile);

  function update(data: Partial<UserProfile>) {
    setLocalData(prev => ({ ...prev, ...data }));
  }

  function next() {
    onUpdate(localData);
    if (section < SECTIONS.length - 1) {
      setSection(s => s + 1);
    } else {
      // Calculate targets and finish
      const macros = calculateMacros(localData as UserProfile);
      const water = calculateWaterTarget(localData as UserProfile);
      const bmr = calculateBMR(localData as UserProfile);
      const tdee = calculateTDEE(localData as UserProfile);
      onUpdate({
        ...localData,
        bmr, tdee,
        calorie_target: macros.calories,
        protein_target: macros.protein,
        carb_target: macros.carbs,
        fat_target: macros.fat,
        water_target_liters: water,
        onboarding_complete: true,
      });
      onComplete();
    }
  }

  function back() {
    if (section > 0) setSection(s => s - 1);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-8 pb-4 text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
          <Dumbbell size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold gradient-text">JackedAI</h1>
        <p className="text-slate-400 text-sm mt-1">Let's build your plan</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 px-6 mb-6">
        {SECTIONS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i <= section ? 'bg-gradient-to-r from-cyan-400 to-purple-500' : 'bg-white/10'
          }`} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-8 overflow-y-auto no-scrollbar">
        {section === 0 && <StatsSection data={localData} onChange={update} />}
        {section === 1 && <LifestyleSection data={localData} onChange={update} />}
        {section === 2 && <FoodSection data={localData} onChange={update} />}
        {section === 3 && <SnackSection data={localData} onChange={update} />}
        {section === 4 && <ReviewSection data={localData} />}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 px-6 pb-8">
        {section > 0 && (
          <button onClick={back} className="px-6 py-3 rounded-xl glass text-slate-300 flex items-center gap-1">
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <button onClick={next}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold flex items-center justify-center gap-1"
        >
          {section === SECTIONS.length - 1 ? "Let's Get Jacked" : 'Next'} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string | number | undefined; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1.5">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 rounded-xl px-4 py-3 text-white placeholder-slate-500 border border-white/10 focus:border-cyan-400 focus:outline-none text-sm" />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string | undefined; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-xl text-sm transition ${value === opt.value
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
              : 'bg-white/5 text-slate-400 border border-white/10'}`}
          >{opt.label}</button>
        ))}
      </div>
    </div>
  );
}

function StatsSection({ data, onChange }: { data: Partial<UserProfile>; onChange: (d: Partial<UserProfile>) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle title="Your Stats" subtitle="The basics — so we can dial in your macros perfectly." />
      <Input label="Age" value={data.age} onChange={v => onChange({ age: Number(v) })} type="number" placeholder="30" />
      <Select label="Biological Sex" value={data.biological_sex} onChange={v => onChange({ biological_sex: v as any })}
        options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
      <Input label="Height (cm)" value={data.height_cm} onChange={v => onChange({ height_cm: Number(v) })} type="number" placeholder="180" />
      <Input label="Current Weight (kg)" value={data.current_weight_kg} onChange={v => onChange({ current_weight_kg: Number(v) })} type="number" placeholder="85" />
      <Input label="Goal Weight (kg)" value={data.goal_weight_kg} onChange={v => onChange({ goal_weight_kg: Number(v) })} type="number" placeholder="78" />
      <Select label="How fast?" value={data.weight_loss_pace} onChange={v => onChange({ weight_loss_pace: v as any })}
        options={[
          { value: 'steady', label: 'Steady (~1 lb/wk)' },
          { value: 'moderate', label: 'Moderate (~1.2 lb/wk)' },
          { value: 'aggressive', label: 'Aggressive (~1.5 lb/wk)' },
        ]} />
    </div>
  );
}

function LifestyleSection({ data, onChange }: { data: Partial<UserProfile>; onChange: (d: Partial<UserProfile>) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle title="Your Lifestyle" subtitle="How you move and live — this shapes your calorie needs." />
      <Select label="Job Type" value={data.job_type} onChange={v => onChange({ job_type: v })}
        options={[
          { value: 'desk', label: 'Desk job' },
          { value: 'on_feet', label: 'On my feet' },
          { value: 'physical', label: 'Physical / manual' },
          { value: 'mixed', label: 'Mix of both' },
        ]} />
      <Input label="Workouts per week" value={data.exercise_frequency} onChange={v => onChange({ exercise_frequency: Number(v) })} type="number" placeholder="4" />
      <Input label="Sleep hours (typical)" value={data.sleep_hours} onChange={v => onChange({ sleep_hours: Number(v) })} type="number" placeholder="7" />
      <Select label="Stress Level" value={data.stress_level} onChange={v => onChange({ stress_level: v as any })}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'high', label: 'High' },
        ]} />
      <Input label="Alcohol per week (drinks)" value={data.alcohol_per_week} onChange={v => onChange({ alcohol_per_week: v })} placeholder="e.g. 3-4 beers" />
    </div>
  );
}

function FoodSection({ data, onChange }: { data: Partial<UserProfile>; onChange: (d: Partial<UserProfile>) => void }) {
  const [mealInput, setMealInput] = useState('');
  const [hateInput, setHateInput] = useState('');

  function addMeal() {
    if (!mealInput.trim()) return;
    onChange({ favorite_meals: [...(data.favorite_meals || []), mealInput.trim()] });
    setMealInput('');
  }

  function addHate() {
    if (!hateInput.trim()) return;
    onChange({ hated_foods: [...(data.hated_foods || []), hateInput.trim()] });
    setHateInput('');
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="Food Preferences" subtitle="What do you love to eat? We'll build your plan around it." />
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">Favorite meals / dishes</label>
        <div className="flex gap-2">
          <input value={mealInput} onChange={e => setMealInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMeal()}
            placeholder="e.g. Tacos, Stir fry..." className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-white placeholder-slate-500 border border-white/10 focus:border-cyan-400 focus:outline-none text-sm" />
          <button onClick={addMeal} className="px-4 py-3 rounded-xl bg-cyan-500/20 text-cyan-400 text-sm">Add</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {(data.favorite_meals || []).map((m, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs border border-cyan-500/20">
              {m} <button onClick={() => onChange({ favorite_meals: data.favorite_meals?.filter((_, j) => j !== i) })} className="ml-1">×</button>
            </span>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">Foods you hate</label>
        <div className="flex gap-2">
          <input value={hateInput} onChange={e => setHateInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHate()}
            placeholder="e.g. Mushrooms..." className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-white placeholder-slate-500 border border-white/10 focus:border-cyan-400 focus:outline-none text-sm" />
          <button onClick={addHate} className="px-4 py-3 rounded-xl bg-red-500/20 text-red-400 text-sm">Add</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {(data.hated_foods || []).map((m, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs border border-red-500/20">
              {m} <button onClick={() => onChange({ hated_foods: data.hated_foods?.filter((_, j) => j !== i) })} className="ml-1">×</button>
            </span>
          ))}
        </div>
      </div>
      <Select label="Cooking Style" value={data.cooking_style} onChange={v => onChange({ cooking_style: v as any })}
        options={[
          { value: 'scratch', label: 'From scratch' },
          { value: 'quick', label: 'Quick meals' },
          { value: 'meal_prep', label: 'Batch / meal prep' },
        ]} />
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">Food adventurousness (1-10)</label>
        <input type="range" min="1" max="10" value={data.food_adventurousness || 5} onChange={e => onChange({ food_adventurousness: Number(e.target.value) })}
          className="w-full accent-cyan-400" />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Stick to what I know</span>
          <span className="text-cyan-400 font-bold">{data.food_adventurousness || 5}</span>
          <span>I'll try anything</span>
        </div>
      </div>
    </div>
  );
}

function SnackSection({ data, onChange }: { data: Partial<UserProfile>; onChange: (d: Partial<UserProfile>) => void }) {
  const [snackInput, setSnackInput] = useState('');

  function addSnack() {
    if (!snackInput.trim()) return;
    onChange({ current_snacks: [...(data.current_snacks || []), snackInput.trim()] });
    setSnackInput('');
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="Snack Habits" subtitle="No judgment — I just need to know what we're working with." />
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">Current go-to snacks</label>
        <div className="flex gap-2">
          <input value={snackInput} onChange={e => setSnackInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSnack()}
            placeholder="e.g. Chips, granola bar..." className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-white placeholder-slate-500 border border-white/10 focus:border-cyan-400 focus:outline-none text-sm" />
          <button onClick={addSnack} className="px-4 py-3 rounded-xl bg-cyan-500/20 text-cyan-400 text-sm">Add</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {(data.current_snacks || []).map((s, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs border border-purple-500/20">
              {s} <button onClick={() => onChange({ current_snacks: data.current_snacks?.filter((_, j) => j !== i) })} className="ml-1">×</button>
            </span>
          ))}
        </div>
      </div>
      <Select label="Why do you snack?" value={data.snack_reason} onChange={v => onChange({ snack_reason: v as any })}
        options={[
          { value: 'hunger', label: 'Genuine hunger' },
          { value: 'boredom', label: 'Boredom' },
          { value: 'habit', label: 'Force of habit' },
        ]} />
      <Select label="Sweet or savory?" value={data.snack_preference} onChange={v => onChange({ snack_preference: v as any })}
        options={[
          { value: 'sweet', label: 'Sweet' },
          { value: 'savory', label: 'Savory' },
          { value: 'both', label: 'Both' },
        ]} />
      <Select label="Late night snacking?" value={data.late_night_snacking === undefined ? undefined : data.late_night_snacking ? 'yes' : 'no'}
        onChange={v => onChange({ late_night_snacking: v === 'yes' })}
        options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
    </div>
  );
}

function ReviewSection({ data }: { data: Partial<UserProfile> }) {
  const macros = calculateMacros(data as UserProfile);
  const bmr = calculateBMR(data as UserProfile);
  const tdee = calculateTDEE(data as UserProfile);
  const { label } = getActivityMultiplier(data as UserProfile);
  const water = calculateWaterTarget(data as UserProfile);

  return (
    <div className="space-y-4">
      <SectionTitle title="Your Plan" subtitle="Here's what JackedAI calculated based on your info." />

      <div className="glass rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-cyan-400">Calorie Calculation</h3>
        <div className="space-y-1 text-sm">
          <Row label="BMR (Mifflin-St Jeor)" value={`${Math.round(bmr)} cal`} />
          <Row label="Activity Level" value={label} />
          <Row label="TDEE (maintenance)" value={`${tdee} cal`} />
          <Row label="Deficit" value="-500 cal" />
          <div className="border-t border-white/10 pt-2 mt-2">
            <Row label="Daily Target" value={`${macros.calories} cal`} highlight />
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-purple-400">Daily Macros</h3>
        <div className="grid grid-cols-3 gap-3">
          <MacroCard label="Protein" value={`${macros.protein}g`} color="text-cyan-400" />
          <MacroCard label="Carbs" value={`${macros.carbs}g`} color="text-purple-400" />
          <MacroCard label="Fat" value={`${macros.fat}g`} color="text-pink-400" />
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <Row label="Water Target" value={`${water}L / day`} />
      </div>

      <p className="text-xs text-slate-500 text-center px-4">
        These are your starting targets. JackedAI will adjust as you track and your Garmin/Apple Health data comes in.
      </p>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={highlight ? 'text-white font-bold' : 'text-slate-200'}>{value}</span>
    </div>
  );
}

function MacroCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center p-3 rounded-xl bg-white/5">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

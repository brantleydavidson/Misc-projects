import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { UserProfile, FoodEntry } from '../types';
import { getFoodEntries, removeFoodEntry, getDailySummary } from '../lib/storage';
import { MacroBar } from '../components/MacroBar';
import { QuickAdd } from '../components/QuickAdd';

interface FoodLogProps {
  profile: UserProfile;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function FoodLog({ profile }: FoodLogProps) {
  const [date, setDate] = useState(new Date());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [summary, setSummary] = useState(getDailySummary());

  const dateStr = formatDate(date);
  const isToday = dateStr === formatDate(new Date());

  useEffect(() => {
    const ents = getFoodEntries(dateStr);
    setEntries(ents);
    setSummary(getDailySummary(dateStr));
  }, [dateStr]);

  function refresh() {
    setEntries(getFoodEntries(dateStr));
    setSummary(getDailySummary(dateStr));
  }

  function handleRemove(id: string) {
    removeFoodEntry(id, dateStr);
    refresh();
  }

  const targets = {
    calories: profile.calorie_target || 2000,
    protein: profile.protein_target || 150,
    carbs: profile.carb_target || 200,
    fat: profile.fat_target || 65,
  };

  const mealGroups = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
  const mealIcons: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿' };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Date nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })} className="p-2 text-slate-400">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold text-white">
            {isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </h1>
          <p className="text-xs text-slate-400">{summary.calories} / {targets.calories} cal</p>
        </div>
        <button onClick={() => setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
          disabled={isToday} className="p-2 text-slate-400 disabled:opacity-20">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Macro summary */}
      <div className="glass rounded-2xl p-4">
        <div className="flex gap-4">
          <MacroBar label="Protein" value={summary.protein} target={targets.protein} color="#00E5CC" />
          <MacroBar label="Carbs" value={summary.carbs} target={targets.carbs} color="#FF2D78" />
          <MacroBar label="Fat" value={summary.fat} target={targets.fat} color="#FF2D78" />
        </div>
      </div>

      {/* Quick Add */}
      <QuickAdd onAdded={refresh} />

      {/* Meal groups */}
      {mealGroups.map(meal => {
        const mealEntries = entries.filter(e => e.meal_type === meal);
        if (mealEntries.length === 0 && !isToday) return null;
        const mealCals = mealEntries.reduce((s, e) => s + e.calories, 0);

        return (
          <div key={meal} className="glass rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-white capitalize flex items-center gap-2">
                {mealIcons[meal]} {meal}
              </h2>
              <span className="text-xs text-slate-400">{mealCals} cal</span>
            </div>
            {mealEntries.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No entries yet</p>
            ) : (
              <div className="space-y-2">
                {mealEntries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 py-2 border-t border-white/5">
                    {entry.image_base64 && (
                      <img src={entry.image_base64} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{entry.food_name}</div>
                      <div className="text-[10px] text-slate-500">
                        {entry.calories}cal | {entry.protein}p {entry.carbs}c {entry.fat}f
                      </div>
                    </div>
                    <button onClick={() => handleRemove(entry.id!)} className="text-slate-600 hover:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {entries.length === 0 && (
        <div className="text-center py-8">
          <p className="text-slate-500 text-sm">No food logged {isToday ? 'today' : 'on this day'}</p>
        </div>
      )}
    </div>
  );
}

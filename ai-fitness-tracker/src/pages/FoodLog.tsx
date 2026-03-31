import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Pencil, Check, X, CalendarDays } from 'lucide-react';
import type { UserProfile, FoodEntry } from '../types';
import { getFoodEntries, removeFoodEntry, updateFoodEntry, moveFoodEntry, getDailySummary } from '../lib/storage';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FoodEntry>>({});
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState('');

  const dateStr = formatDate(date);
  const isToday = dateStr === formatDate(new Date());

  useEffect(() => {
    refresh();
  }, [dateStr]);

  function refresh() {
    setEntries(getFoodEntries(dateStr));
    setSummary(getDailySummary(dateStr));
  }

  function handleRemove(id: string) {
    removeFoodEntry(id, dateStr);
    setEditingId(null);
    refresh();
  }

  function startEdit(entry: FoodEntry) {
    setEditingId(entry.id!);
    setEditForm({
      food_name: entry.food_name,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      fiber: entry.fiber,
      meal_type: entry.meal_type,
    });
    setMovingId(null);
  }

  function saveEdit(id: string) {
    updateFoodEntry(id, editForm, dateStr);
    setEditingId(null);
    refresh();
  }

  function startMove(id: string) {
    setMovingId(id);
    // Default to yesterday
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    setMoveDate(formatDate(yesterday));
  }

  function confirmMove(id: string) {
    if (!moveDate || moveDate === dateStr) return;
    moveFoodEntry(id, dateStr, moveDate);
    setMovingId(null);
    setEditingId(null);
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
              <div className="space-y-1">
                {mealEntries.map(entry => {
                  const isEditing = editingId === entry.id;
                  const isMoving = movingId === entry.id;

                  return (
                    <div key={entry.id} className={`rounded-xl transition ${isEditing ? 'bg-white/5 p-3' : ''}`}>
                      {/* Normal row */}
                      <div className="flex items-center gap-3 py-2 border-t border-white/5">
                        {entry.image_base64 && (
                          <img src={entry.image_base64} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{entry.food_name}</div>
                          <div className="text-[10px] text-slate-500">
                            {entry.calories}cal | {entry.protein}p {entry.carbs}c {entry.fat}f
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => isEditing ? setEditingId(null) : startEdit(entry)}
                            className={`p-1.5 rounded-lg transition ${isEditing ? 'text-neon-teal bg-neon-teal/10' : 'text-slate-600 hover:text-neon-teal'}`}
                          >
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleRemove(entry.id!)}
                            className="text-slate-600 hover:text-red-400 p-1.5 rounded-lg transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Edit panel */}
                      {isEditing && (
                        <div className="mt-2 space-y-3">
                          {/* Food name */}
                          <input
                            value={editForm.food_name || ''}
                            onChange={e => setEditForm(f => ({ ...f, food_name: e.target.value }))}
                            className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-neon-teal focus:outline-none"
                          />

                          {/* Macros grid */}
                          <div className="grid grid-cols-4 gap-2">
                            <EditField label="Calories" value={editForm.calories} color="text-orange-400"
                              onChange={v => setEditForm(f => ({ ...f, calories: Number(v) || 0 }))} />
                            <EditField label="Protein" value={editForm.protein} color="text-neon-teal"
                              onChange={v => setEditForm(f => ({ ...f, protein: Number(v) || 0 }))} />
                            <EditField label="Carbs" value={editForm.carbs} color="text-neon-pink"
                              onChange={v => setEditForm(f => ({ ...f, carbs: Number(v) || 0 }))} />
                            <EditField label="Fat" value={editForm.fat} color="text-yellow-400"
                              onChange={v => setEditForm(f => ({ ...f, fat: Number(v) || 0 }))} />
                          </div>

                          {/* Meal type */}
                          <div className="flex gap-1.5">
                            {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(t => (
                              <button key={t} onClick={() => setEditForm(f => ({ ...f, meal_type: t }))}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] capitalize transition ${
                                  editForm.meal_type === t
                                    ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/30'
                                    : 'bg-white/5 text-slate-500 border border-white/5'
                                }`}
                              >{t}</button>
                            ))}
                          </div>

                          {/* Move to different date */}
                          {isMoving ? (
                            <div className="flex gap-2 items-center">
                              <CalendarDays size={14} className="text-neon-pink flex-shrink-0" />
                              <input
                                type="date"
                                value={moveDate}
                                max={formatDate(new Date())}
                                onChange={e => setMoveDate(e.target.value)}
                                className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-neon-pink focus:outline-none"
                              />
                              <button onClick={() => confirmMove(entry.id!)}
                                disabled={!moveDate || moveDate === dateStr}
                                className="px-3 py-2 rounded-lg bg-neon-pink/20 text-neon-pink text-xs font-medium border border-neon-pink/30 disabled:opacity-30"
                              >
                                Move
                              </button>
                              <button onClick={() => setMovingId(null)} className="text-slate-500 p-1">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => startMove(entry.id!)}
                              className="text-[10px] text-neon-pink flex items-center gap-1 hover:underline"
                            >
                              <CalendarDays size={11} /> Move to different day
                            </button>
                          )}

                          {/* Save / Cancel */}
                          <div className="flex gap-2">
                            <button onClick={() => setEditingId(null)}
                              className="flex-1 py-2 rounded-lg glass text-slate-400 text-xs flex items-center justify-center gap-1"
                            >
                              <X size={12} /> Cancel
                            </button>
                            <button onClick={() => saveEdit(entry.id!)}
                              className="flex-1 py-2 rounded-lg bg-neon-teal/20 text-neon-teal text-xs font-medium border border-neon-teal/30 flex items-center justify-center gap-1"
                            >
                              <Check size={12} /> Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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

function EditField({ label, value, color, onChange }: {
  label: string; value: number | undefined; color: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={`text-[9px] font-medium mb-0.5 block ${color}`}>{label}</label>
      <input
        type="number"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 rounded-lg px-2 py-1.5 text-xs text-white border border-white/10 focus:border-neon-teal focus:outline-none text-center"
      />
    </div>
  );
}

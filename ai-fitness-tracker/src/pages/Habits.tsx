import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Plus, Trash2, Flame, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Habit } from '../types';
import { PRESET_HABITS } from '../types';
import {
  getHabits, addHabit, removeHabit, toggleHabit, isHabitComplete,
  getHabitStreak, getHabitCompletionRate,
} from '../lib/storage';

function dateToKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isToday(d: Date): boolean {
  return dateToKey(d) === dateToKey(new Date());
}

function formatDateHeader(d: Date): string {
  if (isToday(d)) return 'Today';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateToKey(d) === dateToKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function Habits() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(() =>
    initDate ? new Date(initDate + 'T12:00:00') : new Date()
  );
  const currentDay = isToday(selectedDate);
  const dateKey = dateToKey(selectedDate);

  const [habits, setHabits] = useState<Habit[]>(getHabits());
  const [showAdd, setShowAdd] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState('✨');
  const [customCategory, setCustomCategory] = useState<Habit['category']>('custom');
  const [_, forceUpdate] = useState(0);

  function handleToggle(habitId: string) {
    toggleHabit(habitId, dateKey);
    forceUpdate(n => n + 1);
  }

  function handleAddPreset(preset: typeof PRESET_HABITS[number]) {
    // Don't add if already exists with same name
    if (habits.some(h => h.name === preset.name)) return;
    const h = addHabit(preset);
    setHabits([...habits, h]);
  }

  function handleAddCustom() {
    if (!customName.trim()) return;
    const h = addHabit({
      name: customName.trim(),
      icon: customIcon,
      color: 'teal',
      category: customCategory,
    });
    setHabits([...habits, h]);
    setCustomName('');
    setCustomIcon('✨');
    setShowAdd(false);
  }

  function handleRemove(id: string) {
    removeHabit(id);
    setHabits(habits.filter(h => h.id !== id));
  }

  function goBack() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
    setSearchParams({ date: dateToKey(d) });
  }
  function goForward() {
    if (currentDay) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
    if (isToday(d)) setSearchParams({});
    else setSearchParams({ date: dateToKey(d) });
  }

  const activeHabits = habits.filter(h => !h.archived);
  const completedCount = activeHabits.filter(h => isHabitComplete(h.id, dateKey)).length;
  const totalCount = activeHabits.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group by category
  const grouped = activeHabits.reduce((acc, h) => {
    if (!acc[h.category]) acc[h.category] = [];
    acc[h.category].push(h);
    return acc;
  }, {} as Record<string, Habit[]>);

  const categoryOrder = ['nutrition', 'fitness', 'recovery', 'mindset', 'custom'];
  const categoryLabels: Record<string, string> = {
    nutrition: 'Nutrition',
    fitness: 'Fitness',
    recovery: 'Recovery',
    mindset: 'Mindset',
    custom: 'Custom',
  };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-lg font-bold text-white font-display flex items-center gap-2">
            <Flame size={20} className="text-orange-400" />
            Habits
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <button onClick={goBack} className="text-slate-400 hover:text-neon-teal transition p-0.5">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => { setSelectedDate(new Date()); setSearchParams({}); }}
              className="text-xs text-slate-400 hover:text-white transition min-w-[100px] text-center"
            >
              {formatDateHeader(selectedDate)}
            </button>
            <button onClick={goForward} disabled={currentDay}
              className={`p-0.5 transition ${currentDay ? 'text-slate-600 cursor-default' : 'text-slate-400 hover:text-neon-teal'}`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <button onClick={() => navigate('/')} className="text-slate-400 text-sm">Done</button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-white">{completedCount}/{totalCount} complete</span>
            <span className="text-xs text-slate-400">{completionPct}%</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon-teal to-neon-pink transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Habit list by category */}
      {categoryOrder.map(cat => {
        const items = grouped[cat];
        if (!items?.length) return null;
        return (
          <div key={cat}>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
              {categoryLabels[cat]}
            </div>
            <div className="space-y-2">
              {items.map(habit => {
                const done = isHabitComplete(habit.id, dateKey);
                const streak = getHabitStreak(habit.id);
                const rate = getHabitCompletionRate(habit.id, 30);
                return (
                  <div key={habit.id}
                    className={`glass rounded-xl p-3 flex items-center gap-3 transition ${
                      done ? 'bg-green-500/5 border border-green-500/20' : 'border border-white/5'
                    }`}
                  >
                    <button onClick={() => handleToggle(habit.id)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition ${
                        done
                          ? 'bg-green-500 text-white'
                          : 'bg-white/10 text-slate-500 hover:bg-white/20'
                      }`}
                    >
                      {done ? <Check size={16} /> : <span className="text-sm">{habit.icon}</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${done ? 'text-green-400 line-through' : 'text-white'}`}>
                        {habit.name}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        {streak > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Flame size={10} className="text-orange-400" />
                            {streak} day streak
                          </span>
                        )}
                        <span>{Math.round(rate * 100)}% / 30d</span>
                      </div>
                    </div>
                    <button onClick={() => handleRemove(habit.id)}
                      className="text-slate-600 hover:text-red-400 transition p-1 flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {totalCount === 0 && !showAdd && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-orange-500/20 to-neon-pink/20 flex items-center justify-center">
            <Flame size={28} className="text-orange-400" />
          </div>
          <h2 className="text-white font-semibold mb-1">No habits yet</h2>
          <p className="text-sm text-slate-400 max-w-xs mx-auto mb-4">
            Add habits to track daily. Build streaks and see your consistency grow.
          </p>
        </div>
      )}

      {/* Add habits section */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Plus size={16} className="text-neon-teal" />
            Add Habits
          </h3>
          <button onClick={() => setShowAdd(!showAdd)}
            className="text-xs text-neon-teal"
          >
            {showAdd ? 'Cancel' : 'Custom'}
          </button>
        </div>

        {/* Custom habit form */}
        {showAdd && (
          <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Habit name..."
              className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-teal focus:outline-none"
            />
            <div className="flex gap-2">
              <input
                value={customIcon}
                onChange={e => setCustomIcon(e.target.value)}
                placeholder="Icon"
                className="w-16 bg-white/5 rounded-lg px-3 py-2 text-sm text-white text-center border border-white/10 focus:border-neon-teal focus:outline-none"
              />
              <select
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value as Habit['category'])}
                className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-neon-teal focus:outline-none"
              >
                {categoryOrder.map(c => (
                  <option key={c} value={c} className="bg-gray-900">{categoryLabels[c]}</option>
                ))}
              </select>
            </div>
            <button onClick={handleAddCustom}
              className="w-full py-2 rounded-lg bg-neon-teal/20 text-neon-teal text-sm font-semibold border border-neon-teal/30"
            >
              Add Custom Habit
            </button>
          </div>
        )}

        {/* Preset habits */}
        <div className="flex flex-wrap gap-2">
          {PRESET_HABITS.filter(p => !habits.some(h => h.name === p.name)).map(preset => (
            <button key={preset.name} onClick={() => handleAddPreset(preset)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition flex items-center gap-1.5"
            >
              <span>{preset.icon}</span>
              {preset.name}
            </button>
          ))}
          {PRESET_HABITS.filter(p => !habits.some(h => h.name === p.name)).length === 0 && (
            <p className="text-xs text-slate-500">All presets added! Use custom to create more.</p>
          )}
        </div>
      </div>

      {/* 7-day overview */}
      {totalCount > 0 && (
        <div className="glass rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Last 7 Days</h3>
          <div className="flex gap-1.5 justify-between">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const key = dateToKey(d);
              const dayCompleted = activeHabits.filter(h => isHabitComplete(h.id, key)).length;
              const pct = totalCount > 0 ? dayCompleted / totalCount : 0;
              const dayLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' });
              const isSelected = key === dateKey;
              return (
                <button key={key} onClick={() => {
                  setSelectedDate(d);
                  if (isToday(d)) setSearchParams({});
                  else setSearchParams({ date: key });
                }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition ${
                    isSelected ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="text-[9px] text-slate-500">{dayLabel}</span>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    pct >= 1 ? 'bg-green-500 text-white' :
                    pct >= 0.5 ? 'bg-yellow-500/30 text-yellow-400' :
                    pct > 0 ? 'bg-white/10 text-slate-400' :
                    'bg-white/5 text-slate-600'
                  }`}>
                    {dayCompleted}
                  </div>
                  <span className="text-[8px] text-slate-600">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

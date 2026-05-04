import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { FoodEntry } from '../types';
import { addFoodEntry } from '../lib/storage';

interface QuickAddProps {
  onAdded: () => void;
  date?: string;
}

export function QuickAdd({ onAdded, date }: QuickAddProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [mealType, setMealType] = useState<FoodEntry['meal_type']>('snack');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !calories) return;
    addFoodEntry({
      food_name: name,
      calories: Number(calories),
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      meal_type: mealType,
    }, date);
    setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-full glass text-sm text-slate-300 hover:text-white transition"
      >
        <Plus size={16} /> Quick Add
      </button>
    );
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-white">Quick Add Food</h3>
        <button onClick={() => setOpen(false)} className="text-slate-400"><X size={18} /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Food name" className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none" />
        <div className="flex gap-2">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(t => (
            <button key={t} type="button" onClick={() => setMealType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs capitalize ${mealType === t ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/50' : 'bg-white/5 text-slate-400 border border-white/10'}`}
            >{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <input value={calories} onChange={e => setCalories(e.target.value)} type="number" placeholder="Cal" className="bg-white/5 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-orange-400 focus:outline-none" />
          <input value={protein} onChange={e => setProtein(e.target.value)} type="number" placeholder="Pro" className="bg-white/5 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none" />
          <input value={carbs} onChange={e => setCarbs(e.target.value)} type="number" placeholder="Carb" className="bg-white/5 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-pink focus:outline-none" />
          <input value={fat} onChange={e => setFat(e.target.value)} type="number" placeholder="Fat" className="bg-white/5 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-pink-400 focus:outline-none" />
        </div>
        <button type="submit" className="w-full py-2 rounded-lg bg-gradient-to-r from-neon-teal to-neon-pink text-white text-sm font-semibold">
          Add Entry
        </button>
      </form>
    </div>
  );
}

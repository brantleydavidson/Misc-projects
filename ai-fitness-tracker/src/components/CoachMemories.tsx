import { useState, useEffect } from 'react';
import { Brain, Trash2, Plus, Loader2, X } from 'lucide-react';
import type { CoachMemory } from '../types';
import { getCoachMemories, deleteCoachMemory, addCoachMemory } from '../lib/db';

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  preference: { label: 'Preference', color: 'text-neon-teal' },
  injury: { label: 'Injury', color: 'text-red-400' },
  goal: { label: 'Goal', color: 'text-neon-orange' },
  life_context: { label: 'Life', color: 'text-blue-400' },
  pattern: { label: 'Pattern', color: 'text-yellow-400' },
  dislike: { label: 'Dislike', color: 'text-neon-pink' },
  note: { label: 'Note', color: 'text-slate-300' },
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

export function CoachMemories() {
  const [memories, setMemories] = useState<CoachMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('note');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadMemories();
  }, []);

  async function loadMemories() {
    setLoading(true);
    const data = await getCoachMemories();
    setMemories(data);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    setMemories(prev => prev.filter(m => m.id !== id));
    await deleteCoachMemory(id);
  }

  async function handleAdd() {
    if (!newContent.trim() || adding) return;
    setAdding(true);
    await addCoachMemory(newContent.trim(), newCategory);
    setNewContent('');
    setNewCategory('note');
    setShowAdd(false);
    setAdding(false);
    await loadMemories();
  }

  // Group by category
  const grouped: Record<string, CoachMemory[]> = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-electric-purple" />
          <span className="text-xs text-slate-400 font-body">
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
          </span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs text-neon-teal hover:text-neon-teal/80 transition"
        >
          {showAdd ? <X size={12} /> : <Plus size={12} />}
          {showAdd ? 'Cancel' : 'Add note'}
        </button>
      </div>

      {/* Add manual memory */}
      {showAdd && (
        <div className="bg-white/5 rounded-xl p-3 space-y-2 border border-white/10">
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Tell your coach something to remember..."
            rows={2}
            className="w-full bg-white/5 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none resize-none font-body"
          />
          <div className="flex items-center gap-2">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="bg-white/5 rounded-lg px-2 py-1.5 text-xs text-white border border-white/10 focus:border-neon-teal focus:outline-none"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c].label}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!newContent.trim() || adding}
              className="ml-auto px-3 py-1.5 rounded-lg bg-neon-teal/10 border border-neon-teal/30 text-neon-teal text-xs font-semibold hover:bg-neon-teal/20 transition disabled:opacity-30 flex items-center gap-1"
            >
              {adding ? <Loader2 size={10} className="animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-6">
          <Loader2 size={16} className="animate-spin text-neon-teal mx-auto" />
        </div>
      )}

      {/* Empty state */}
      {!loading && memories.length === 0 && (
        <div className="text-center py-6">
          <Brain size={24} className="text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-body">
            APEX will learn about you from conversations.
          </p>
          <p className="text-[10px] text-slate-600 font-body mt-1">
            Preferences, injuries, goals, and patterns are remembered automatically.
          </p>
        </div>
      )}

      {/* Grouped memories */}
      {!loading && Object.entries(grouped).map(([category, mems]) => {
        const cat = CATEGORY_LABELS[category] || { label: category, color: 'text-slate-400' };
        return (
          <div key={category}>
            <h4 className={`text-[10px] font-ui uppercase tracking-wider mb-1.5 ${cat.color}`}>
              {cat.label}
            </h4>
            <div className="space-y-1">
              {mems.map(m => (
                <div key={m.id} className="flex items-start gap-2 group bg-white/5 rounded-lg px-2.5 py-2">
                  <p className="flex-1 text-xs text-slate-300 font-body leading-relaxed">{m.content}</p>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition flex-shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

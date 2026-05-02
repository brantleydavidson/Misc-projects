import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { fetchRecentObservations, markObservationActedOn, type AiObservation } from '../lib/db';

const KIND_COLOR: Record<string, string> = {
  pattern: 'text-neon-teal border-neon-teal/30 bg-neon-teal/5',
  anomaly: 'text-neon-pink border-neon-pink/30 bg-neon-pink/5',
  suggestion: 'text-chrome border-white/10 bg-white/5',
  milestone: 'text-yellow-300 border-yellow-300/30 bg-yellow-300/5',
};

export function Observations() {
  const [items, setItems] = useState<AiObservation[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchRecentObservations(3).then(setItems).catch(() => setItems([]));
  }, []);

  const visible = items.filter(o => !hidden.has(o.id) && !o.acted_on);
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setHidden(prev => new Set(prev).add(id));
    markObservationActedOn(id).catch(() => {});
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-chrome/40 font-ui text-[10px] uppercase tracking-widest">
        <Sparkles size={12} />
        What I'm noticing
      </div>
      {visible.map(o => (
        <div
          key={o.id}
          className={`relative rounded-xl border p-3 pr-10 font-ui text-sm leading-relaxed ${KIND_COLOR[o.kind] || KIND_COLOR.suggestion}`}
        >
          {o.content}
          <button
            onClick={() => dismiss(o.id)}
            className="absolute top-2 right-2 p-1 text-chrome/40 hover:text-chrome/80 transition"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

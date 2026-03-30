import { Crown, X } from 'lucide-react';
import type { UsageCheckResult } from '../lib/api';

interface UsageBannerProps {
  check: UsageCheckResult | null;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function UsageBanner({ check, onUpgrade, onDismiss }: UsageBannerProps) {
  if (!check) return null;

  const actionLabels: Record<string, string> = {
    food_snap: 'food snaps',
    coach_message: 'coach messages',
    meal_plan: 'meal plans',
    nutrition_lookup: 'nutrition lookups',
  };

  return (
    <div className="mx-4 mb-3 p-3 rounded-2xl bg-gradient-to-r from-neon-pink/10 to-yellow-500/10 border border-neon-pink/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Crown size={16} className="text-yellow-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">
              Daily limit reached ({check.used}/{check.limit})
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Upgrade to Pro for more {actionLabels[check.tier] || 'AI features'}
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 p-0.5">
          <X size={14} />
        </button>
      </div>
      <button onClick={onUpgrade}
        className="mt-2 w-full py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-neon-teal to-neon-pink text-white hover:opacity-90 transition"
      >
        View Plans
      </button>
    </div>
  );
}

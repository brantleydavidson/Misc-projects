import { useState, useEffect } from 'react';
import { Crown, Check, Zap, Sparkles, ArrowLeft, Tag, Loader2, ExternalLink } from 'lucide-react';
import { checkUsage, validateDiscount, createCheckout, type Tier, type UsageCheckResult } from '../lib/api';

interface UpgradeProps {
  onBack: () => void;
}

const PLAN_FEATURES: Record<Tier, { name: string; price: string; features: string[] }> = {
  free: {
    name: 'Free',
    price: '$0',
    features: [
      '5 food snaps / day',
      '15 coach messages / day',
      '2 meal plans / month',
      '10 nutrition lookups / day',
      'Basic trends dashboard',
      'Manual health data entry',
    ],
  },
  pro: {
    name: 'Pro',
    price: '$9.99/mo',
    features: [
      '50 food snaps / day',
      '100 coach messages / day',
      '30 meal plans / month',
      '50 nutrition lookups / day',
      'Full trends + analytics',
      'Garmin auto-sync',
      'Weekly email reports',
      'Priority AI responses',
    ],
  },
  unlimited: {
    name: 'Unlimited',
    price: '$19.99/mo',
    features: [
      'Unlimited food snaps',
      'Unlimited coach messages',
      'Unlimited meal plans',
      'Unlimited nutrition lookups',
      'Everything in Pro',
      'Early access to new features',
      'API access (coming soon)',
    ],
  },
};

export function Upgrade({ onBack }: UpgradeProps) {
  const [currentTier, setCurrentTier] = useState<Tier>('free');
  const [usage, setUsage] = useState<UsageCheckResult | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [discountResult, setDiscountResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  useEffect(() => {
    checkUsage('food_snap')
      .then(result => {
        setCurrentTier(result.tier);
        setUsage(result);
      })
      .catch(() => {});
  }, []);

  const [checkoutLoading, setCheckoutLoading] = useState<Tier | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Check URL params for success/canceled from Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setCurrentTier((params.get('plan') as Tier) || 'pro');
      // Clean up URL
      window.history.replaceState({}, '', '/upgrade');
    }
  }, []);

  async function handleCheckout(plan: 'pro' | 'unlimited') {
    setCheckoutLoading(plan);
    setCheckoutError(null);
    try {
      const result = await createCheckout(plan, discountCode || undefined);
      if (result.url) {
        window.location.href = result.url;
      } else {
        setCheckoutError('Could not create checkout session. Stripe may not be configured yet.');
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleDiscount() {
    if (!discountCode.trim()) return;
    setDiscountLoading(true);
    setDiscountResult(null);
    try {
      const result = await validateDiscount(discountCode.trim());
      setDiscountResult({ valid: result.valid, message: result.message });
      if (result.valid && result.grants_tier) {
        setCurrentTier(result.grants_tier);
      }
    } catch (err: any) {
      setDiscountResult({ valid: false, message: err.message || 'Failed to validate code' });
    } finally {
      setDiscountLoading(false);
    }
  }

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-full glass flex items-center justify-center">
          <ArrowLeft size={16} className="text-slate-400" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white font-display flex items-center gap-2">
            <Crown size={20} className="text-yellow-400" />
            Upgrade
          </h1>
          <p className="text-xs text-slate-400">Unlock the full BeJacked experience</p>
        </div>
      </div>

      {/* Current usage */}
      {usage && (
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">Current Plan</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              currentTier === 'free' ? 'bg-slate-500/20 text-slate-300' :
              currentTier === 'pro' ? 'bg-neon-teal/20 text-neon-teal' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {PLAN_FEATURES[currentTier].name}
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Food snaps today: <span className="text-white font-data">{usage.used}</span> / {usage.limit}
          </div>
        </div>
      )}

      {/* Plans */}
      {(['free', 'pro', 'unlimited'] as Tier[]).map(tier => {
        const plan = PLAN_FEATURES[tier];
        const isCurrent = currentTier === tier;
        const isUpgrade = tier === 'pro' || tier === 'unlimited';

        return (
          <div key={tier} className={`glass rounded-2xl p-4 border ${
            isCurrent ? 'border-neon-teal/40' :
            tier === 'pro' ? 'border-neon-teal/20' :
            tier === 'unlimited' ? 'border-yellow-500/20' :
            'border-white/5'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {tier === 'free' && <Zap size={16} className="text-slate-400" />}
                {tier === 'pro' && <Sparkles size={16} className="text-neon-teal" />}
                {tier === 'unlimited' && <Crown size={16} className="text-yellow-400" />}
                <span className="text-sm font-semibold text-white">{plan.name}</span>
              </div>
              <span className="text-sm font-bold font-data text-white">{plan.price}</span>
            </div>

            <ul className="space-y-1.5 mb-3">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                  <Check size={12} className={
                    tier === 'unlimited' ? 'text-yellow-400' :
                    tier === 'pro' ? 'text-neon-teal' : 'text-slate-500'
                  } />
                  {f}
                </li>
              ))}
            </ul>

            {isCurrent ? (
              <div className="text-center py-2 text-xs text-neon-teal font-medium">Current Plan</div>
            ) : isUpgrade ? (
              <button
                onClick={() => handleCheckout(tier as 'pro' | 'unlimited')}
                disabled={checkoutLoading !== null}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition bg-gradient-to-r from-neon-teal to-neon-pink text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {checkoutLoading === tier ? (
                  <><Loader2 size={14} className="animate-spin" /> Processing...</>
                ) : (
                  <><ExternalLink size={14} /> Subscribe to {plan.name}</>
                )}
              </button>
            ) : null}
          </div>
        );
      })}

      {/* Discount code */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag size={16} className="text-neon-pink" />
          <span className="text-sm font-semibold text-white">Discount Code</span>
        </div>
        <div className="flex gap-2">
          <input
            value={discountCode}
            onChange={e => setDiscountCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleDiscount(); }}
            placeholder="Enter code..."
            className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none uppercase"
          />
          <button onClick={handleDiscount} disabled={discountLoading || !discountCode.trim()}
            className="px-4 py-2 rounded-lg bg-neon-teal/20 text-neon-teal text-sm font-medium border border-neon-teal/30 hover:bg-neon-teal/30 transition disabled:opacity-30"
          >
            {discountLoading ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
          </button>
        </div>
        {discountResult && (
          <div className={`mt-2 text-xs ${discountResult.valid ? 'text-green-400' : 'text-red-400'}`}>
            {discountResult.message}
          </div>
        )}
      </div>

      {/* Checkout error */}
      {checkoutError && (
        <div className="mx-0 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">
          {checkoutError}
        </div>
      )}

      <p className="text-[10px] text-slate-500 text-center px-4">
        Secure payment via Stripe. Cancel anytime. Use a discount code for free Pro access.
      </p>
    </div>
  );
}

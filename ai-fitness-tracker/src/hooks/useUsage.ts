import { useState, useCallback } from 'react';
import { checkUsage as checkUsageApi, type UsageAction, type Tier, type UsageCheckResult } from '../lib/api';

interface UseUsageReturn {
  /** Check if an action is allowed before executing it. */
  checkAction: (action: UsageAction) => Promise<boolean>;
  /** Current tier (cached from last check). */
  tier: Tier;
  /** Whether a usage limit was hit (show upgrade prompt). */
  limitHit: boolean;
  /** The last check result (for showing details). */
  lastCheck: UsageCheckResult | null;
  /** Dismiss the limit prompt. */
  dismissLimit: () => void;
}

/**
 * Hook for client-side usage gating.
 * Checks the user's tier and usage before AI actions.
 * Shows an upgrade prompt when limits are hit.
 */
export function useUsage(): UseUsageReturn {
  const [tier, setTier] = useState<Tier>('free');
  const [limitHit, setLimitHit] = useState(false);
  const [lastCheck, setLastCheck] = useState<UsageCheckResult | null>(null);

  const checkAction = useCallback(async (action: UsageAction): Promise<boolean> => {
    try {
      const result = await checkUsageApi(action);
      setTier(result.tier);
      setLastCheck(result);

      if (!result.allowed) {
        setLimitHit(true);
        return false;
      }
      return true;
    } catch {
      // If the check fails (network, etc.), allow the action (fail open)
      return true;
    }
  }, []);

  const dismissLimit = useCallback(() => {
    setLimitHit(false);
  }, []);

  return { checkAction, tier, limitHit, lastCheck, dismissLimit };
}

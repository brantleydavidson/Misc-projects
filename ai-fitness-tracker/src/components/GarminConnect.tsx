import { useState, useEffect } from 'react';
import { Watch, Link, CheckCircle, RefreshCw, Loader2, Unplug } from 'lucide-react';
import type { HealthConnection } from '../types/health';
import { getHealthStatus, connectGarmin } from '../lib/health';

export function GarminConnect() {
  const [status, setStatus] = useState<HealthConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const s = await getHealthStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const result = await connectGarmin();
      if (result?.authorization_url) {
        window.location.href = result.authorization_url;
      } else {
        setError('Could not get authorization URL. Try again.');
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="text-neon-teal animate-spin" />
        <span className="ml-2 text-xs text-slate-400">Checking connection...</span>
      </div>
    );
  }

  // Connected state
  if (status?.connected) {
    const backfill = status.backfill_status;
    const isSyncing = backfill?.overall === 'syncing';
    const syncedTypes = backfill?.types
      ? Object.entries(backfill.types).filter(([, v]) => v.status === 'complete').length
      : 0;
    const totalTypes = backfill?.types ? Object.keys(backfill.types).length : 0;

    return (
      <div className="space-y-3">
        {/* Connected badge */}
        <div className="hud-corners p-4 bg-neon-teal/5 border border-neon-teal/20 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neon-teal/20 flex items-center justify-center">
                <CheckCircle size={20} className="text-green-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white font-ui">
                  {status.provider || 'Garmin'} Connected
                </div>
                {status.last_sync && (
                  <div className="text-[10px] text-slate-400">
                    Last sync: {formatSyncTime(status.last_sync)}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={fetchStatus}
              className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition"
              title="Refresh status"
            >
              <RefreshCw size={14} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Backfill progress */}
        {isSyncing && totalTypes > 0 && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 size={12} className="text-neon-teal animate-spin" />
              <span className="text-xs text-slate-300 font-ui uppercase tracking-wider">
                Syncing Historical Data
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-neon-teal to-neon-pink transition-all duration-500"
                style={{ width: `${totalTypes > 0 ? (syncedTypes / totalTypes) * 100 : 0}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500">
              {syncedTypes}/{totalTypes} data types synced
            </div>
            {backfill?.types && (
              <div className="mt-2 space-y-1">
                {Object.entries(backfill.types).map(([type, info]) => (
                  <div key={type} className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 capitalize">{type.replace(/_/g, ' ')}</span>
                    <span className={
                      info.status === 'complete' ? 'text-green-400' :
                      info.status === 'syncing' ? 'text-neon-teal' :
                      'text-slate-500'
                    }>
                      {info.status === 'complete' ? 'Done' :
                       info.status === 'syncing' ? 'Syncing...' :
                       `Pending (${info.attempts})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Not connected state
  return (
    <div className="space-y-3">
      <div className="text-center py-4">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-neon-teal/20 to-blue-500/20 flex items-center justify-center">
          <Watch size={28} className="text-neon-teal" />
        </div>
        <h3 className="text-sm font-semibold text-white font-ui mb-1">Connect Your Garmin</h3>
        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
          Automatically sync steps, heart rate, sleep, stress, body battery, and more from your Garmin device.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">
          {error}
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-neon-teal/20 to-blue-500/20 border border-neon-teal/30 text-neon-teal text-sm font-semibold font-ui hover:from-neon-teal/30 hover:to-blue-500/30 transition disabled:opacity-50"
      >
        {connecting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Link size={16} />
        )}
        {connecting ? 'Connecting...' : 'Link Garmin Account'}
      </button>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5">
        <Unplug size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Uses Open Wearables to securely connect. Your data stays private and is only used for your fitness tracking.
        </p>
      </div>
    </div>
  );
}

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

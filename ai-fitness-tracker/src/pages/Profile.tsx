import { useState, useRef, useEffect } from 'react';
import {
  Dumbbell, Watch, Apple, ChevronRight, ChevronDown, RotateCcw, Loader2, Footprints, Flame, Heart, Moon,
  Zap, Activity, LogOut, Settings, Sparkles, Send, Scale, Ruler, Droplets, Clock, Calendar,
} from 'lucide-react';
import type { UserProfile, GarminData, ChatMessage } from '../types';
import { calculateMacros, calculateWaterTarget, calculateTDEE, calculateBMR, getActivityMultiplier } from '../lib/calculations';
import { getGarminData, saveGarminData, getDailySummary } from '../lib/storage';
import { displayWeight, displayHeight, displayWaterTarget, getDefaultPreferences } from '../lib/units';
import { sendChat } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { performFullSync } from '../lib/db';
import { Cloud, CheckCircle, AlertCircle } from 'lucide-react';

interface ProfileProps {
  profile: UserProfile;
  onUpdate: (data: Partial<UserProfile>) => void;
  onResetOnboarding: () => void;
}

type Section = 'stats' | 'targets' | 'settings' | 'coach' | 'health' | 'account';

// Extract profile_update JSON from AI response
function extractProfileUpdate(text: string): Partial<UserProfile> | null {
  const match = text.match(/```profile_update\s*\n?([\s\S]*?)\n?```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function cleanDisplayText(text: string): string {
  return text.replace(/```profile_update\s*\n?[\s\S]*?\n?```/g, '').trim();
}

export function Profile({ profile, onUpdate, onResetOnboarding }: ProfileProps) {
  const { user, signOut } = useAuth();
  const macros = calculateMacros(profile);
  const tdee = calculateTDEE(profile);
  const bmr = calculateBMR(profile);
  const { label: activityLabel } = getActivityMultiplier(profile);
  const water = calculateWaterTarget(profile);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [garminData, setGarminData] = useState<GarminData | null>(getGarminData());
  const [garminConnecting, setGarminConnecting] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [expandedSection, setExpandedSection] = useState<Section | null>(null);
  const [manualData, setManualData] = useState<Partial<GarminData>>({
    steps: garminData?.steps || undefined,
    calories_burned: garminData?.calories_burned || undefined,
    heart_rate_avg: garminData?.heart_rate_avg || undefined,
    heart_rate_resting: garminData?.heart_rate_resting || undefined,
    sleep_hours: garminData?.sleep_hours || undefined,
    body_battery: garminData?.body_battery || undefined,
    stress_level: garminData?.stress_level || undefined,
    active_minutes: garminData?.active_minutes || undefined,
  });

  // Coach chat state
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>([]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [appliedUpdates, setAppliedUpdates] = useState<Set<number>>(new Set());
  const coachScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    coachScrollRef.current?.scrollTo({ top: coachScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [coachMessages]);

  // Ensure defaults are set
  useEffect(() => {
    if (!profile.unit_weight) {
      onUpdate(getDefaultPreferences());
    }
  }, []);

  async function connectGarmin() {
    setGarminConnecting(true);
    setGarminError(null);
    try {
      const res = await fetch('/.netlify/functions/garmin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_request_token' }),
      });
      const data = await res.json();
      if (data.setup_required) {
        setGarminError('Garmin API keys not configured.');
        return;
      }
      if (data.auth_url) {
        localStorage.setItem('garmin_oauth_token', data.oauth_token);
        window.open(data.auth_url, '_blank');
      } else {
        setGarminError(data.error || 'Failed to start Garmin connection');
      }
    } catch (err: any) {
      setGarminError(err.message || 'Connection failed');
    } finally {
      setGarminConnecting(false);
    }
  }

  function disconnectGarmin() {
    localStorage.removeItem('garmin_access_token');
    localStorage.removeItem('garmin_access_token_secret');
    saveGarminData({} as GarminData);
    setGarminData(null);
  }

  function saveManualData() {
    const data: GarminData = { ...manualData, last_synced: new Date().toISOString() };
    saveGarminData(data);
    setGarminData(data);
    setShowManualEntry(false);
  }

  // Coach chat
  async function sendCoachMessage(text?: string) {
    const msg = text || coachInput.trim();
    if (!msg || coachLoading) return;
    setCoachInput('');

    const userMsg: ChatMessage = { role: 'user', content: msg };
    const updated = [...coachMessages, userMsg];
    setCoachMessages(updated);
    setCoachLoading(true);

    try {
      const summary = getDailySummary();
      const garmin = getGarminData();
      const response = await sendChat(updated, profile, { todaySummary: summary, garminData: garmin });
      setCoachMessages(prev => [...prev, { role: 'assistant', content: response.message }]);
    } catch (err: any) {
      setCoachMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection issue. ${err.message || 'Try again.'}`,
      }]);
    } finally {
      setCoachLoading(false);
    }
  }

  function applyCoachUpdate(msgIndex: number, update: Partial<UserProfile>) {
    onUpdate(update);
    setAppliedUpdates(prev => new Set(prev).add(msgIndex));
  }

  const isGarminConnected = !!localStorage.getItem('garmin_access_token');

  const toggle = (s: Section) => setExpandedSection(expandedSection === s ? null : s);

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="text-center py-3">
        <div className="w-16 h-16 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center">
          <Dumbbell size={28} className="text-white" />
        </div>
        <h1 className="text-lg font-bold gradient-text font-display">JackedAI</h1>
        <p className="text-xs text-slate-400">{user?.email || 'Your AI fitness protocol'}</p>
      </div>

      {/* Stats Overview */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Your Stats</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatItem label="Age" value={`${profile.age || '—'}`} />
          <StatItem label="Height" value={profile.height_cm ? displayHeight(profile.height_cm, profile) : '—'} />
          <StatItem label="Current" value={profile.current_weight_kg ? displayWeight(profile.current_weight_kg, profile) : '—'} />
          <StatItem label="Goal" value={profile.goal_weight_kg ? displayWeight(profile.goal_weight_kg, profile) : '—'} />
        </div>
      </div>

      {/* Daily Targets */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Daily Targets</h2>
        <div className="space-y-2 text-sm">
          <Row label="BMR" value={`${Math.round(bmr)} cal`} />
          <Row label="Activity" value={activityLabel} />
          <Row label="TDEE" value={`${tdee} cal`} />
          <Row label="Calorie Target" value={`${macros.calories} cal`} highlight />
          <div className="border-t border-white/10 pt-2 mt-2 grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-neon-teal font-data">{macros.protein}g</div>
              <div className="text-[10px] text-slate-400">Protein</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-neon-pink font-data">{macros.carbs}g</div>
              <div className="text-[10px] text-slate-400">Carbs</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-neon-pink font-data">{macros.fat}g</div>
              <div className="text-[10px] text-slate-400">Fat</div>
            </div>
          </div>
          <Row label="Water" value={displayWaterTarget(water, profile)} />
        </div>
      </div>

      {/* Coach — Brainstorm Targets */}
      <div className="glass rounded-2xl overflow-hidden">
        <button onClick={() => toggle('coach')}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-neon-pink" />
            <span className="text-sm font-semibold text-white">Talk to Coach</span>
            <span className="text-[10px] text-slate-400 ml-1">Brainstorm targets</span>
          </div>
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${expandedSection === 'coach' ? 'rotate-180' : ''}`} />
        </button>

        {expandedSection === 'coach' && (
          <div className="border-t border-white/10">
            {/* Coach messages */}
            <div ref={coachScrollRef} className="max-h-80 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
              {coachMessages.length === 0 && (
                <div className="text-center py-4">
                  <Sparkles size={24} className="text-neon-pink mx-auto mb-2 opacity-40" />
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mb-3">
                    I can help adjust your macro targets, calorie goals, and training approach. What would you like to brainstorm?
                  </p>
                  <div className="space-y-2">
                    {[
                      "My calories seem too low — can we recalculate?",
                      "I want to try higher carbs, lower fat",
                      "What if I went more aggressive on the deficit?",
                      "Can we do a reverse diet / maintenance phase?",
                    ].map(q => (
                      <button key={q} onClick={() => sendCoachMessage(q)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-white/5 text-xs text-slate-300 hover:bg-white/10 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {coachMessages.map((msg, i) => {
                const update = msg.role === 'assistant' ? extractProfileUpdate(msg.content) : null;
                const text = msg.role === 'assistant' ? cleanDisplayText(msg.content) : msg.content;
                const applied = appliedUpdates.has(i);

                return (
                  <div key={i}>
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-neon-teal to-neon-pink text-white rounded-br-md'
                          : 'bg-white/5 text-slate-200 rounded-bl-md'
                      }`}>
                        <div className="whitespace-pre-wrap">{text}</div>
                      </div>
                    </div>

                    {update && (
                      <div className="flex justify-start mt-2">
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 border text-xs ${
                          applied
                            ? 'bg-green-500/5 border-green-500/20'
                            : 'bg-neon-teal/5 border-neon-teal/20'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Settings size={12} className={applied ? 'text-green-400' : 'text-neon-teal'} />
                            <span className="font-semibold text-chrome/70">
                              {applied ? 'Applied' : 'Suggested Changes'}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {update.calorie_target != null && (
                              <div className="flex justify-between text-chrome/60">
                                <span>Calories</span>
                                <span className="font-data text-chrome">{update.calorie_target} cal</span>
                              </div>
                            )}
                            {update.protein_target != null && (
                              <div className="flex justify-between text-chrome/60">
                                <span>Protein</span>
                                <span className="font-data text-chrome">{update.protein_target}g</span>
                              </div>
                            )}
                            {update.carb_target != null && (
                              <div className="flex justify-between text-chrome/60">
                                <span>Carbs</span>
                                <span className="font-data text-chrome">{update.carb_target}g</span>
                              </div>
                            )}
                            {update.fat_target != null && (
                              <div className="flex justify-between text-chrome/60">
                                <span>Fat</span>
                                <span className="font-data text-chrome">{update.fat_target}g</span>
                              </div>
                            )}
                            {update.water_target_liters != null && (
                              <div className="flex justify-between text-chrome/60">
                                <span>Water</span>
                                <span className="font-data text-chrome">{update.water_target_liters}L</span>
                              </div>
                            )}
                          </div>
                          {!applied && (
                            <button onClick={() => applyCoachUpdate(i, update)}
                              className="mt-2 w-full py-1.5 rounded-lg bg-neon-teal/10 text-neon-teal text-xs font-semibold border border-neon-teal/30 hover:bg-neon-teal/20 transition"
                            >
                              Apply Changes
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {coachLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 rounded-2xl rounded-bl-md px-3 py-2">
                    <Loader2 size={14} className="text-neon-pink animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Coach input */}
            <div className="px-4 pb-3 pt-2 border-t border-white/10">
              <div className="flex gap-2 items-end">
                <input
                  value={coachInput}
                  onChange={e => setCoachInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendCoachMessage(); } }}
                  placeholder="Brainstorm targets..."
                  className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none"
                />
                <button onClick={() => sendCoachMessage()} disabled={coachLoading || !coachInput.trim()}
                  className="w-8 h-8 rounded-lg bg-gradient-to-r from-neon-teal to-neon-pink flex items-center justify-center disabled:opacity-30 flex-shrink-0"
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preferences / Settings */}
      <div className="glass rounded-2xl overflow-hidden">
        <button onClick={() => toggle('settings')}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-neon-teal" />
            <span className="text-sm font-semibold text-white">Preferences</span>
          </div>
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${expandedSection === 'settings' ? 'rotate-180' : ''}`} />
        </button>

        {expandedSection === 'settings' && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Units */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Units</h3>
              <div className="space-y-3">
                <SettingToggle
                  icon={<Scale size={14} className="text-neon-teal" />}
                  label="Weight"
                  options={[{ value: 'lbs', label: 'lbs' }, { value: 'kg', label: 'kg' }]}
                  current={profile.unit_weight || 'lbs'}
                  onChange={v => onUpdate({ unit_weight: v as 'lbs' | 'kg' })}
                />
                <SettingToggle
                  icon={<Ruler size={14} className="text-blue-400" />}
                  label="Height"
                  options={[{ value: 'in', label: 'ft/in' }, { value: 'cm', label: 'cm' }]}
                  current={profile.unit_height || 'in'}
                  onChange={v => onUpdate({ unit_height: v as 'in' | 'cm' })}
                />
                <SettingToggle
                  icon={<Footprints size={14} className="text-green-400" />}
                  label="Distance"
                  options={[{ value: 'mi', label: 'miles' }, { value: 'km', label: 'km' }]}
                  current={profile.unit_distance || 'mi'}
                  onChange={v => onUpdate({ unit_distance: v as 'mi' | 'km' })}
                />
                <SettingToggle
                  icon={<Droplets size={14} className="text-blue-400" />}
                  label="Water"
                  options={[{ value: 'oz', label: 'oz' }, { value: 'ml', label: 'ml/L' }]}
                  current={profile.unit_water || 'oz'}
                  onChange={v => onUpdate({ unit_water: v as 'oz' | 'ml' })}
                />
              </div>
            </div>

            {/* Date & Time */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Date & Time</h3>
              <div className="space-y-3">
                <SettingToggle
                  icon={<Calendar size={14} className="text-neon-pink" />}
                  label="Date Format"
                  options={[
                    { value: 'MM/DD/YYYY', label: 'MM/DD' },
                    { value: 'DD/MM/YYYY', label: 'DD/MM' },
                    { value: 'YYYY-MM-DD', label: 'ISO' },
                  ]}
                  current={profile.date_format || 'MM/DD/YYYY'}
                  onChange={v => onUpdate({ date_format: v as any })}
                />
                <SettingToggle
                  icon={<Clock size={14} className="text-yellow-400" />}
                  label="Time Format"
                  options={[{ value: '12h', label: '12h' }, { value: '24h', label: '24h' }]}
                  current={profile.time_format || '12h'}
                  onChange={v => onUpdate({ time_format: v as '12h' | '24h' })}
                />
              </div>
            </div>

            {/* Meal Timing */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Meal Timing</h3>
              <div className="grid grid-cols-2 gap-3">
                <TimeInput
                  label="Eating Window Start"
                  value={profile.meal_window_start || '08:00'}
                  onChange={v => onUpdate({ meal_window_start: v })}
                />
                <TimeInput
                  label="Eating Window End"
                  value={profile.meal_window_end || '20:00'}
                  onChange={v => onUpdate({ meal_window_end: v })}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">For intermittent fasting / meal timing reminders</p>
            </div>

            {/* Weigh-in */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Weekly Weigh-In</h3>
              <div className="flex gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                  <button key={day} onClick={() => onUpdate({ weekly_weigh_in_day: i })}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-medium transition ${
                      (profile.weekly_weigh_in_day ?? 1) === i
                        ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/30'
                        : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Goal Type */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Goal & Pace</h3>
              <div className="space-y-3">
                <SettingToggle
                  icon={<Zap size={14} className="text-orange-400" />}
                  label="Deficit Pace"
                  options={[
                    { value: 'steady', label: 'Steady' },
                    { value: 'moderate', label: 'Moderate' },
                    { value: 'aggressive', label: 'Aggressive' },
                  ]}
                  current={profile.weight_loss_pace || 'steady'}
                  onChange={v => onUpdate({ weight_loss_pace: v as any })}
                />
              </div>
            </div>

            {/* SMS Notifications */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">SMS Reminders</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block">Phone Number</label>
                  <input
                    type="tel"
                    value={profile.phone || ''}
                    onChange={e => onUpdate({ phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-neon-teal focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-slate-300">Enable SMS Reminders</span>
                    <p className="text-[10px] text-slate-500">Weigh-in reminders & missed check-in nudges</p>
                  </div>
                  <button
                    onClick={() => onUpdate({ sms_opted_in: !profile.sms_opted_in })}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      profile.sms_opted_in ? 'bg-neon-teal' : 'bg-white/10'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${
                      profile.sms_opted_in ? 'left-5.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Health Data Connections */}
      <div className="glass rounded-2xl overflow-hidden">
        <button onClick={() => toggle('health')}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Heart size={16} className="text-red-400" />
            <span className="text-sm font-semibold text-white">Health Data</span>
          </div>
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${expandedSection === 'health' ? 'rotate-180' : ''}`} />
        </button>

        {expandedSection === 'health' && (
          <div className="border-t border-white/10 p-4 space-y-3">
            {garminError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {garminError}
              </div>
            )}

            {/* Garmin */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Watch size={18} className="text-blue-400" />
                <span className="text-sm text-slate-300">Garmin Connect</span>
              </div>
              {isGarminConnected ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Connected</span>
                  <button onClick={disconnectGarmin} className="text-xs text-red-400">Disconnect</button>
                </div>
              ) : (
                <button onClick={connectGarmin} disabled={garminConnecting}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition disabled:opacity-50 flex items-center gap-1"
                >
                  {garminConnecting ? <Loader2 size={12} className="animate-spin" /> : null}
                  Connect
                </button>
              )}
            </div>

            {/* Apple Health */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Apple size={18} className="text-red-400" />
                <span className="text-sm text-slate-300">Apple Health</span>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-500/20 text-slate-400">Native app only</span>
            </div>

            {/* Manual entry */}
            <div className="border-t border-white/10 pt-3">
              <button onClick={() => setShowManualEntry(!showManualEntry)}
                className="w-full flex items-center justify-between text-sm text-slate-300 hover:text-white transition"
              >
                <span className="flex items-center gap-2">
                  <Activity size={16} className="text-green-400" />
                  Enter Activity Manually
                </span>
                <ChevronRight size={16} className={`text-slate-500 transition ${showManualEntry ? 'rotate-90' : ''}`} />
              </button>
            </div>

            {showManualEntry && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <ManualInput icon={<Footprints size={14} className="text-green-400" />} label="Steps"
                    value={manualData.steps} onChange={v => setManualData(d => ({ ...d, steps: v }))} />
                  <ManualInput icon={<Flame size={14} className="text-orange-400" />} label="Calories Burned"
                    value={manualData.calories_burned} onChange={v => setManualData(d => ({ ...d, calories_burned: v }))} />
                  <ManualInput icon={<Heart size={14} className="text-red-400" />} label="Avg Heart Rate"
                    value={manualData.heart_rate_avg} onChange={v => setManualData(d => ({ ...d, heart_rate_avg: v }))} />
                  <ManualInput icon={<Heart size={14} className="text-neon-pink" />} label="Resting HR"
                    value={manualData.heart_rate_resting} onChange={v => setManualData(d => ({ ...d, heart_rate_resting: v }))} />
                  <ManualInput icon={<Moon size={14} className="text-indigo-400" />} label="Sleep Hours"
                    value={manualData.sleep_hours} onChange={v => setManualData(d => ({ ...d, sleep_hours: v }))} step="0.1" />
                  <ManualInput icon={<Zap size={14} className="text-yellow-400" />} label="Active Minutes"
                    value={manualData.active_minutes} onChange={v => setManualData(d => ({ ...d, active_minutes: v }))} />
                  <ManualInput icon={<Activity size={14} className="text-neon-teal" />} label="Body Battery"
                    value={manualData.body_battery} onChange={v => setManualData(d => ({ ...d, body_battery: v }))} />
                  <ManualInput icon={<Activity size={14} className="text-neon-pink" />} label="Stress Level"
                    value={manualData.stress_level} onChange={v => setManualData(d => ({ ...d, stress_level: v }))} />
                </div>
                <button onClick={saveManualData}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-neon-teal text-white text-sm font-semibold"
                >
                  Save Activity Data
                </button>
              </div>
            )}

            {/* Current data display */}
            {garminData && (garminData.steps || garminData.calories_burned || garminData.sleep_hours) && (
              <div className="border-t border-white/10 pt-3">
                <h3 className="text-xs font-semibold text-slate-400 mb-2">Current Data</h3>
                <div className="grid grid-cols-4 gap-2">
                  {garminData.steps != null && <MiniStat label="Steps" value={garminData.steps.toLocaleString()} />}
                  {garminData.calories_burned != null && <MiniStat label="Burned" value={`${garminData.calories_burned}`} />}
                  {garminData.active_minutes != null && <MiniStat label="Active" value={`${garminData.active_minutes}m`} />}
                  {garminData.sleep_hours != null && <MiniStat label="Sleep" value={`${garminData.sleep_hours}h`} />}
                  {garminData.heart_rate_resting != null && <MiniStat label="Rest HR" value={`${garminData.heart_rate_resting}`} />}
                  {garminData.body_battery != null && <MiniStat label="Battery" value={`${garminData.body_battery}`} />}
                  {garminData.stress_level != null && <MiniStat label="Stress" value={`${garminData.stress_level}`} />}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account & Sync */}
      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-2">Account & Data</h2>
        {user && <p className="text-xs text-slate-400 mb-3">{user.email}</p>}

        {/* Sync to Cloud */}
        <button
          onClick={async () => {
            setSyncing(true);
            setSyncResult(null);
            const result = await performFullSync();
            setSyncing(false);
            setSyncResult(result.synced
              ? { ok: true, msg: 'All data synced to cloud' }
              : { ok: false, msg: result.error || 'Sync failed' }
            );
            setTimeout(() => setSyncResult(null), 4000);
          }}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-ui
            bg-neon-teal/10 border border-neon-teal/30 text-neon-teal hover:bg-neon-teal/20
            disabled:opacity-50 transition mb-3"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
          {syncing ? 'Syncing...' : 'Sync All Data to Cloud'}
        </button>

        {syncResult && (
          <div className={`flex items-center gap-2 text-xs mb-3 ${syncResult.ok ? 'text-green-400' : 'text-neon-pink'}`}>
            {syncResult.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            {syncResult.msg}
          </div>
        )}

        {user && (
          <button onClick={signOut}
            className="flex items-center gap-2 text-xs text-neon-pink hover:text-neon-pink/80 transition"
          >
            <LogOut size={14} /> Sign Out
          </button>
        )}
      </div>

      {/* Actions */}
      <button onClick={onResetOnboarding}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl glass text-slate-300 hover:text-white transition"
      >
        <span className="flex items-center gap-2 text-sm">
          <RotateCcw size={16} /> Redo Setup
        </span>
        <ChevronRight size={16} className="text-slate-500" />
      </button>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/5 text-center">
      <div className="text-white font-bold font-data">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={highlight ? 'text-white font-bold text-sm' : 'text-slate-200 text-sm'}>{value}</span>
    </div>
  );
}

function SettingToggle({ icon, label, options, current, onChange }: {
  icon: React.ReactNode;
  label: string;
  options: { value: string; label: string }[];
  current: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className="flex gap-1">
        {options.map(opt => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              current === opt.value
                ? 'bg-neon-teal/20 text-neon-teal border border-neon-teal/30'
                : 'bg-white/5 text-slate-500 border border-white/5'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-slate-400 mb-1 block">{label}</label>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-neon-teal focus:outline-none"
      />
    </div>
  );
}

function ManualInput({ icon, label, value, onChange, step }: {
  icon: React.ReactNode; label: string; value: number | undefined;
  onChange: (v: number | undefined) => void; step?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 mb-1">
        {icon} {label}
      </label>
      <input
        type="number"
        step={step}
        value={value || ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
        placeholder="—"
        className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-white/10 focus:border-neon-teal focus:outline-none"
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-1.5 rounded-lg bg-white/5">
      <div className="text-xs font-bold text-white font-data">{value}</div>
      <div className="text-[9px] text-slate-400">{label}</div>
    </div>
  );
}

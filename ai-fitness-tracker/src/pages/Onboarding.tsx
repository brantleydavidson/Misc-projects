import { useState, useRef, useEffect, useCallback } from 'react';
import { Dumbbell, Send, Zap, ChevronRight, Mail, Lock, Eye, EyeOff, Loader2, Activity, Check, X as XIcon } from 'lucide-react';
import type { UserProfile } from '../types';
import { sendOnboarding, initTerraWidget, buildHealthBaseline, onboardingAgent, type HealthBaseline } from '../lib/api';
import { calculateMacros, calculateWaterTarget, calculateBMR, calculateTDEE } from '../lib/calculations';
import { useAuth } from '../hooks/useAuth';

interface OnboardingProps {
  profile: UserProfile;
  onUpdate: (data: Partial<UserProfile>) => void;
  onComplete: () => void;
  initialPhase?: Phase;
}

export type Phase = 'arrival' | 'connect' | 'analyzing' | 'confirm' | 'conversation' | 'auth' | 'reveal' | 'commit';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const TOTAL_TURNS = 9;

export function Onboarding({ profile, onUpdate, onComplete, initialPhase }: OnboardingProps) {
  const [phase, setPhase] = useState<Phase>(initialPhase || 'arrival');
  const [baseline, setBaseline] = useState<HealthBaseline | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [arrivalStep, setArrivalStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turn, setTurn] = useState(0);
  const [collectedData, setCollectedData] = useState<Partial<UserProfile>>(profile);
  const [revealStep, setRevealStep] = useState(0);
  const [showPlan, setShowPlan] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auth state
  const { user, signUp, signIn, signInWithGoogle } = useAuth();
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Auto-advance from auth phase when user signs in (e.g. Google redirect)
  useEffect(() => {
    if (phase === 'auth' && user) {
      setPhase('reveal');
    }
  }, [phase, user]);

  // Arrival animation sequence
  useEffect(() => {
    if (phase !== 'arrival') return;
    const timers = [
      setTimeout(() => setArrivalStep(1), 500),   // line appears
      setTimeout(() => setArrivalStep(2), 1000),   // grid fades in
      setTimeout(() => setArrivalStep(3), 1600),   // logo appears
      setTimeout(() => setArrivalStep(4), 2200),   // name types out
      setTimeout(() => setArrivalStep(5), 3000),   // tagline
      setTimeout(() => setArrivalStep(6), 3600),   // button
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Auto-scroll messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input after AI responds
  useEffect(() => {
    if (!loading && phase === 'conversation') {
      inputRef.current?.focus();
    }
  }, [loading, phase]);

  // Reveal animation sequence
  useEffect(() => {
    if (phase !== 'reveal') return;
    const steps = [
      setTimeout(() => setRevealStep(1), 600),
      setTimeout(() => setRevealStep(2), 1200),
      setTimeout(() => setRevealStep(3), 1800),
      setTimeout(() => setRevealStep(4), 2400),
      setTimeout(() => setRevealStep(5), 3000),
      setTimeout(() => setShowPlan(true), 3800),
    ];
    return () => steps.forEach(clearTimeout);
  }, [phase]);

  const startConversation = useCallback(() => {
    setPhase('connect');
  }, []);

  const handleConnectTracker = useCallback(async () => {
    setConnectLoading(true);
    try {
      const { url } = await initTerraWidget('/?terra=connected', user?.email);
      window.location.href = url;
    } catch (err: any) {
      setConnectLoading(false);
      setAnalyzeError(err?.message || 'Failed to open tracker connection');
    }
  }, [user]);

  const handleSkipTracker = useCallback(() => {
    setPhase('conversation');
  }, []);

  // Analyzing phase — fetch baseline, then advance to confirm (or fall back to scripted)
  useEffect(() => {
    if (phase !== 'analyzing') return;
    let cancelled = false;
    const stepTimers = [
      setTimeout(() => !cancelled && setAnalyzeStep(1), 400),
      setTimeout(() => !cancelled && setAnalyzeStep(2), 1400),
      setTimeout(() => !cancelled && setAnalyzeStep(3), 2600),
    ];
    (async () => {
      try {
        const result = await buildHealthBaseline();
        if (cancelled) return;
        const dq = result.baseline?.data_quality;
        const usableDays = (dq?.days_with_sleep ?? 0) + (dq?.days_with_workouts ?? 0) + (dq?.days_with_hrv ?? 0);
        if (result.days_with_data === 0 || usableDays === 0) {
          // Tracker connected but no data flowed through (common with Apple Health
          // on web — needs the iOS SDK). Skip to scripted onboarding.
          setAnalyzeError("No data from your tracker yet — falling back to a manual intake.");
          setTimeout(() => !cancelled && setPhase('conversation'), 1500);
          return;
        }
        setBaseline(result.baseline);
        // Brief pause so the user reads the animation, then show the read-back
        setTimeout(() => !cancelled && setPhase('confirm'), 800);
      } catch (err: any) {
        if (cancelled) return;
        setAnalyzeError(err?.message || 'Could not analyze data');
        setTimeout(() => !cancelled && setPhase('conversation'), 1500);
      }
    })();
    return () => {
      cancelled = true;
      stepTimers.forEach(clearTimeout);
    };
  }, [phase]);

  const [correction, setCorrection] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);

  const handleConfirmYes = useCallback(() => {
    setPhase('conversation');
  }, []);

  const handleConfirmCorrect = useCallback(() => {
    if (!correction.trim()) {
      setShowCorrection(true);
      return;
    }
    // Seed the conversation with the user's correction so the agent
    // incorporates it via mark_known on the next turn.
    setMessages([{ role: 'user', content: correction.trim() }]);
    setCorrection('');
    setPhase('conversation');
  }, [correction]);

  // Parse user message to extract structured data
  function extractData(userMsg: string, currentTurn: number): Partial<UserProfile> {
    const data: Partial<UserProfile> = {};
    const msg = userMsg.toLowerCase();

    if (currentTurn === 0) {
      // Name turn — the first message IS their name
      // (We store it as part of collectedData for context, not in UserProfile)
    }

    // Extract numbers for stats
    const numbers = userMsg.match(/\d+\.?\d*/g)?.map(Number) || [];

    if (currentTurn === 1) {
      // Goal/mission
      if (msg.includes('lose') || msg.includes('fat') || msg.includes('cut') || msg.includes('lean'))
        data.goal_description = 'lose fat';
      else if (msg.includes('muscle') || msg.includes('bulk') || msg.includes('gain') || msg.includes('mass'))
        data.goal_description = 'build muscle';
      else if (msg.includes('recomp'))
        data.goal_description = 'recomp';
      else if (msg.includes('strong'))
        data.goal_description = 'get stronger';
      else
        data.goal_description = userMsg.trim().substring(0, 100);
    }

    if (currentTurn === 2) {
      // Stats - age, sex, height, weight, goal weight
      if (numbers.length >= 3) {
        // Try to guess: age is usually 15-80, height 140-220cm, weight 40-200kg
        const sorted = [...numbers].sort((a, b) => a - b);
        if (sorted.length >= 4) {
          data.age = sorted[0] < 80 ? sorted[0] : undefined;
          data.height_cm = sorted.find(n => n >= 140 && n <= 230);
          const weights = sorted.filter(n => n >= 40 && n <= 200 && n !== data.height_cm && n !== data.age);
          if (weights.length >= 2) {
            data.current_weight_kg = weights[weights.length - 1] >= weights[0] ? weights[weights.length - 1] : weights[0];
            data.goal_weight_kg = weights[weights.length - 1] >= weights[0] ? weights[0] : weights[weights.length - 1];
          } else if (weights.length === 1) {
            data.current_weight_kg = weights[0];
          }
        }
      }
      if (msg.includes('male') && !msg.includes('female')) data.biological_sex = 'male';
      if (msg.includes('female') || msg.includes('woman') || msg.includes('girl')) data.biological_sex = 'female';
    }

    if (currentTurn === 3) {
      // Movement - job, exercise freq, types
      if (msg.includes('desk')) data.job_type = 'desk';
      else if (msg.includes('feet') || msg.includes('stand')) data.job_type = 'on_feet';
      else if (msg.includes('physical') || msg.includes('labor') || msg.includes('construction')) data.job_type = 'physical';
      else if (msg.includes('mix')) data.job_type = 'mixed';

      const freqMatch = msg.match(/(\d)\s*(?:times|days|x)/);
      if (freqMatch) data.exercise_frequency = Number(freqMatch[1]);
      else if (numbers.length > 0 && numbers[0] <= 7) data.exercise_frequency = numbers[0];
    }

    if (currentTurn === 4) {
      // Recovery
      const sleepMatch = msg.match(/(\d+\.?\d*)\s*(?:hours|hrs|h)/);
      if (sleepMatch) data.sleep_hours = Number(sleepMatch[1]);
      else if (numbers.length > 0 && numbers[0] <= 12) data.sleep_hours = numbers[0];

      if (msg.includes('low') && msg.includes('stress')) data.stress_level = 'low';
      else if (msg.includes('high') && msg.includes('stress')) data.stress_level = 'high';
      else if (msg.includes('moderate') || msg.includes('medium')) data.stress_level = 'moderate';

      const alcoholMatch = msg.match(/(\d+)\s*(?:drinks?|beers?|glasses?)/);
      if (alcoholMatch) data.alcohol_per_week = alcoholMatch[0];
      else if (msg.includes('none') || msg.includes("don't drink") || msg.includes('no alcohol'))
        data.alcohol_per_week = '0';
    }

    if (currentTurn === 5) {
      // Food preferences
      if (msg.includes('scratch')) data.cooking_style = 'scratch';
      else if (msg.includes('quick') || msg.includes('fast') || msg.includes('easy')) data.cooking_style = 'quick';
      else if (msg.includes('prep') || msg.includes('batch')) data.cooking_style = 'meal_prep';

      const advMatch = msg.match(/(\d+)\s*(?:\/10|out of)/);
      if (advMatch) data.food_adventurousness = Number(advMatch[1]);
    }

    if (currentTurn === 6) {
      // Snacks
      if (msg.includes('hunger') || msg.includes('hungry')) data.snack_reason = 'hunger';
      else if (msg.includes('bore') || msg.includes('boredom')) data.snack_reason = 'boredom';
      else if (msg.includes('habit')) data.snack_reason = 'habit';

      if (msg.includes('sweet') && msg.includes('savory')) data.snack_preference = 'both';
      else if (msg.includes('sweet')) data.snack_preference = 'sweet';
      else if (msg.includes('savory') || msg.includes('salty')) data.snack_preference = 'savory';

      data.late_night_snacking = msg.includes('late night') || msg.includes('midnight') ||
        (msg.includes('night') && msg.includes('snack'));
    }

    if (currentTurn === 7) {
      // Supplements & peptides
      const supps: string[] = [];
      const peps: string[] = [];
      const suppKeywords = ['creatine', 'protein', 'whey', 'casein', 'pre-workout', 'preworkout',
        'multivitamin', 'vitamin', 'fish oil', 'omega', 'magnesium', 'zinc', 'ashwagandha',
        'caffeine', 'bcaa', 'eaa', 'collagen', 'glutamine', 'beta-alanine', 'citrulline'];
      const pepKeywords = ['bpc-157', 'bpc 157', 'tb-500', 'tb 500', 'ghk', 'semaglutide',
        'tirzepatide', 'ipamorelin', 'cjc-1295', 'cjc 1295', 'mk-677', 'mk677'];

      suppKeywords.forEach(s => { if (msg.includes(s)) supps.push(s); });
      pepKeywords.forEach(p => { if (msg.includes(p)) peps.push(p); });

      if (supps.length) data.supplements = supps;
      if (peps.length) data.peptides = peps;
      data.supplement_notes = userMsg.trim();
    }

    if (currentTurn === 8) {
      // Health & wearable
      if (msg.includes('garmin')) { data.has_wearable = true; data.wearable_type = 'garmin'; }
      else if (msg.includes('apple watch')) { data.has_wearable = true; data.wearable_type = 'apple_watch'; }
      else if (msg.includes('whoop')) { data.has_wearable = true; data.wearable_type = 'whoop'; }
      else if (msg.includes('oura')) { data.has_wearable = true; data.wearable_type = 'oura'; }
      else if (msg.includes('fitbit')) { data.has_wearable = true; data.wearable_type = 'fitbit'; }

      data.wildcard_notes = userMsg.trim();
    }

    if (currentTurn === 9) {
      // Pace
      if (msg.includes('steady') || msg.includes('slow')) data.weight_loss_pace = 'steady';
      else if (msg.includes('aggressive') || msg.includes('fast')) data.weight_loss_pace = 'aggressive';
      else data.weight_loss_pace = 'moderate';
    }

    return data;
  }

  // Agentic mode kicks off when conversation phase starts with a baseline
  const agenticMode = baseline !== null;
  const agenticKickoffRef = useRef(false);
  useEffect(() => {
    if (phase !== 'conversation' || !agenticMode || agenticKickoffRef.current) return;
    agenticKickoffRef.current = true;
    setLoading(true);
    // If the user pre-seeded a correction in the confirm phase, send it.
    const seed = messages.length > 0 ? messages.map(m => ({ role: m.role, content: m.content })) : [];
    onboardingAgent(seed)
      .then(reply => {
        setMessages(prev => [...prev, { role: 'assistant', content: reply.message }]);
        if (reply.done) {
          setPhase('reveal');
        }
      })
      .catch(err => {
        console.error('[onboarding-agent kickoff]', err);
        setMessages(prev => [...prev, { role: 'assistant', content: "Tell me your name and what brings you here." }]);
      })
      .finally(() => setLoading(false));
  }, [phase, agenticMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    // ─── Agentic path ──────────────────────────────────────
    if (agenticMode) {
      try {
        const reply = await onboardingAgent(updated.map(m => ({ role: m.role, content: m.content })));
        setMessages(prev => [...prev, { role: 'assistant', content: reply.message }]);
        if (reply.done) {
          // Pull the freshly persisted user_model fields onto the local profile so
          // calculateMacros etc. have what they need (best-effort).
          const um: any = reply.user_model || {};
          onUpdate({
            ...collectedData,
            age: um?.identity?.age ?? collectedData.age,
            biological_sex: um?.identity?.sex ?? collectedData.biological_sex,
            current_weight_kg: um?.identity?.weight_kg ?? collectedData.current_weight_kg,
            height_cm: um?.identity?.height_cm ?? collectedData.height_cm,
            goal_weight_kg: um?.goal?.target_kg ?? collectedData.goal_weight_kg,
            goal_description: um?.goal?.primary ?? collectedData.goal_description,
          });
          setLoading(false);
          setPhase(user ? 'reveal' : 'auth');
        }
      } catch (err) {
        console.error('[onboarding-agent]', err);
        setMessages(prev => [...prev, { role: 'assistant', content: "I had a hiccup — say that again?" }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // ─── Scripted fallback ─────────────────────────────────
    // Extract data from user message
    const extracted = extractData(msg, turn);
    const newCollected = { ...collectedData, ...extracted };
    setCollectedData(newCollected);

    // Check if conversation is complete
    if (turn >= TOTAL_TURNS) {
      setLoading(false);
      onUpdate(newCollected);
      // If already authenticated, skip auth phase
      if (user) {
        setPhase('reveal');
      } else {
        setPhase('auth');
      }
      return;
    }

    try {
      const response = await sendOnboarding(updated, newCollected as Record<string, unknown>, turn);
      const assistantMsg: Message = { role: 'assistant', content: response.message };
      setMessages(prev => [...prev, assistantMsg]);
      setTurn(t => t + 1);
    } catch (err: any) {
      console.error('[Onboarding] API error:', err);
      const detail = err?.message || '';
      const errMsg: Message = {
        role: 'assistant',
        content: `Connection glitch${detail ? `: ${detail}` : ''}. Try that again.`,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function finishOnboarding() {
    const macros = calculateMacros(collectedData as UserProfile);
    const water = calculateWaterTarget(collectedData as UserProfile);
    const bmr = calculateBMR(collectedData as UserProfile);
    const tdee = calculateTDEE(collectedData as UserProfile);
    onUpdate({
      ...collectedData,
      bmr,
      tdee,
      calorie_target: macros.calories,
      protein_target: macros.protein,
      carb_target: macros.carbs,
      fat_target: macros.fat,
      water_target_liters: water,
      onboarding_complete: true,
    });
    onComplete();
  }

  // ─── PHASE 0: ARRIVAL ──────────────────────────────────
  if (phase === 'arrival') {
    return (
      <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden">
        {/* Grid background */}
        <div className={`absolute inset-0 grid-bg transition-opacity duration-1000 ${arrivalStep >= 2 ? 'opacity-100' : 'opacity-0'}`} />

        {/* Scanlines */}
        <div className="absolute inset-0 scanlines" />

        {/* Center line */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[2px] bg-neon-teal transition-all duration-500 ${
          arrivalStep >= 1 ? 'w-48 opacity-100' : 'w-0 opacity-0'
        }`} style={{ boxShadow: '0 0 20px #00E5CC, 0 0 40px #00E5CC' }} />

        {/* Logo */}
        <div className={`relative z-10 flex flex-col items-center transition-all duration-700 ${
          arrivalStep >= 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}>
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal mb-6">
            <Dumbbell size={40} className="text-white" />
          </div>

          {/* Name */}
          <h1 className={`font-display text-4xl tracking-wider text-neon-teal glow-text transition-opacity duration-500 ${
            arrivalStep >= 4 ? 'opacity-100' : 'opacity-0'
          }`}>
            BEJACKED
          </h1>

          {/* Tagline */}
          <p className={`font-ui text-sm text-chrome/60 mt-3 tracking-widest uppercase transition-opacity duration-500 ${
            arrivalStep >= 5 ? 'opacity-100' : 'opacity-0'
          }`}>
            Built in the Neon
          </p>

          {/* CTA */}
          <button
            onClick={startConversation}
            className={`mt-10 px-8 py-4 rounded-xl font-ui font-semibold text-sm uppercase tracking-widest
              bg-neon-teal/10 text-neon-teal border border-neon-teal/40
              glow-breathe btn-neon transition-all duration-500 ${
              arrivalStep >= 6 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            Initialize Protocol
          </button>
        </div>
      </div>
    );
  }

  // ─── PHASE: CONNECT TRACKER ──────────────────────────────
  if (phase === 'connect') {
    return (
      <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-0 scanlines" />
        <div className="relative z-10 w-full max-w-sm fade-up">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
              <Activity size={28} className="text-white" />
            </div>
            <h1 className="font-display text-xl text-neon-teal glow-text uppercase tracking-wider">
              Connect Your Tracker
            </h1>
            <p className="font-ui text-sm text-chrome/60 mt-3 leading-relaxed">
              I'll read your last 30 days — sleep, heart rate, workouts — so I can coach you on your real numbers, not a formula.
            </p>
          </div>

          <button
            onClick={handleConnectTracker}
            disabled={connectLoading}
            className="w-full py-4 rounded-xl font-ui font-semibold text-sm uppercase tracking-wider
              bg-gradient-to-r from-neon-teal to-neon-pink text-white
              disabled:opacity-50 transition btn-neon flex items-center justify-center gap-2 mb-3"
          >
            {connectLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
            Connect Garmin · Whoop · Apple · Oura · Fitbit
          </button>

          <button
            onClick={handleSkipTracker}
            className="w-full py-3 rounded-xl font-ui text-xs text-chrome/50 hover:text-chrome/80 transition uppercase tracking-widest"
          >
            Skip — I'll tell you myself
          </button>

          {analyzeError && (
            <p className="mt-4 text-neon-pink text-xs font-ui text-center">{analyzeError}</p>
          )}

          <p className="mt-8 text-[10px] text-chrome/30 font-ui text-center uppercase tracking-widest leading-relaxed">
            We never share your data. Disconnect anytime in Profile.
          </p>
        </div>
      </div>
    );
  }

  // ─── PHASE: ANALYZING ────────────────────────────────────
  if (phase === 'analyzing') {
    const lines = [
      'Pulling 30 days of biometric data…',
      'Modeling your training and recovery…',
      'Building your baseline…',
    ];
    return (
      <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 grid-bg opacity-40 animate-pulse" />
        <div className="absolute inset-0 scanlines" />
        <div className="relative z-10 w-full max-w-sm text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
            <Loader2 size={36} className="text-white animate-spin" />
          </div>
          <h1 className="font-display text-xl text-neon-teal glow-text uppercase tracking-wider mb-6">
            Reading Your Data
          </h1>
          <div className="space-y-2 font-ui text-sm text-chrome/60">
            {lines.map((line, i) => (
              <p key={i} className={`transition-opacity duration-500 ${i <= analyzeStep ? 'opacity-100' : 'opacity-30'}`}>
                {i <= analyzeStep ? '✓' : '·'} {line}
              </p>
            ))}
          </div>
          {baseline && (
            <p className="mt-8 text-xs text-chrome/40 font-ui italic px-4">{baseline.summary}</p>
          )}
          {analyzeError && (
            <p className="mt-6 text-neon-pink/80 text-xs font-ui">{analyzeError} — continuing without data.</p>
          )}
        </div>
      </div>
    );
  }

  // ─── PHASE: CONFIRM (read-back of baseline) ──────────────
  if (phase === 'confirm' && baseline) {
    const m = baseline.metrics || {};
    const facts: { label: string; value: string }[] = [];
    if (m.avg_sleep_minutes) facts.push({ label: 'Sleep', value: `${(Math.round((m.avg_sleep_minutes as number) / 60 * 10) / 10)}h avg` });
    if (m.avg_resting_hr) facts.push({ label: 'Resting HR', value: `${Math.round(m.avg_resting_hr as number)} bpm` });
    if (m.avg_hrv) facts.push({ label: 'HRV', value: `${Math.round(m.avg_hrv as number)} ms` });
    if (m.avg_steps) facts.push({ label: 'Steps', value: `${Math.round(m.avg_steps as number).toLocaleString()}/day` });
    if (m.avg_active_calories) facts.push({ label: 'Active', value: `${Math.round(m.avg_active_calories as number)} kcal` });
    if (baseline.estimated_tdee) facts.push({ label: 'Est. TDEE', value: `${baseline.estimated_tdee} kcal` });

    return (
      <div className="min-h-screen bg-deep-navy flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute inset-0 scanlines" />
        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-md mx-auto fade-up">
            <div className="text-center mb-8">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
                <Activity size={24} className="text-white" />
              </div>
              <h1 className="font-display text-xl text-neon-teal glow-text uppercase tracking-wider">
                Here's What I See
              </h1>
              <p className="font-ui text-xs text-chrome/40 mt-2 tracking-widest uppercase">
                Last {baseline.window_days || 30} days
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-2xl border border-neon-teal/20 bg-neon-teal/5 p-4 mb-5">
              <p className="font-ui text-sm text-chrome/90 leading-relaxed italic">
                {baseline.summary}
              </p>
            </div>

            {/* Facts */}
            {facts.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-5">
                {facts.map((f, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="font-ui text-[10px] text-chrome/40 uppercase tracking-widest mb-1">{f.label}</div>
                    <div className="font-display text-base text-chrome">{f.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Patterns */}
            {baseline.patterns && baseline.patterns.length > 0 && (
              <div className="mb-6">
                <div className="font-ui text-[10px] text-chrome/40 uppercase tracking-widest mb-2">What I'm noticing</div>
                <div className="space-y-1.5">
                  {baseline.patterns.slice(0, 4).map((p, i) => (
                    <div key={i} className="flex items-start gap-2 font-ui text-sm text-chrome/80 leading-relaxed">
                      <span className="text-neon-pink mt-1">·</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Correction textarea (lazy-shown) */}
            {showCorrection && (
              <div className="mb-5">
                <label className="font-ui text-[10px] text-chrome/40 uppercase tracking-widest mb-2 block">
                  What's off? Tell me in your own words.
                </label>
                <textarea
                  value={correction}
                  onChange={e => setCorrection(e.target.value)}
                  placeholder="e.g. The HRV looks low because I was sick last week. I usually train 4–5x a week, not 2."
                  rows={4}
                  className="w-full bg-white/5 rounded-xl px-4 py-3 text-chrome text-sm placeholder-chrome/30 border border-white/10 focus:border-neon-teal/50 focus:outline-none font-ui resize-none"
                  autoFocus
                />
              </div>
            )}

            {/* CTAs */}
            <div className="space-y-3">
              <button
                onClick={handleConfirmYes}
                className="w-full py-4 rounded-xl font-ui font-semibold text-sm uppercase tracking-wider
                  bg-gradient-to-r from-neon-teal to-neon-pink text-white
                  transition btn-neon flex items-center justify-center gap-2"
              >
                <Check size={16} />
                That's Right — Let's Build It
              </button>
              <button
                onClick={handleConfirmCorrect}
                className="w-full py-3 rounded-xl font-ui text-xs text-chrome/60 hover:text-chrome border border-white/10 bg-white/5 hover:bg-white/10 transition uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <XIcon size={14} />
                {showCorrection
                  ? (correction.trim() ? 'Send Correction' : 'Type your correction above')
                  : 'Some Things Are Off'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── PHASE 1: CONVERSATION ─────────────────────────────
  if (phase === 'conversation') {
    return (
      <div className="min-h-screen bg-deep-navy flex flex-col relative">
        {/* Subtle grid */}
        <div className="absolute inset-0 grid-bg opacity-30" />

        {/* Header */}
        <div className="relative z-10 px-4 pt-6 pb-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-ui font-semibold text-chrome text-sm">APEX</h1>
            <p className="text-[10px] text-chrome/40 font-body">Performance Coach</p>
          </div>
          {/* Turn indicator */}
          <div className="ml-auto flex gap-1">
            {Array.from({ length: TOTAL_TURNS + 1 }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                i < turn ? 'bg-neon-teal glow-teal' : i === turn ? 'bg-neon-teal/50' : 'bg-white/10'
              }`} />
            ))}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-4 pb-4 no-scrollbar space-y-3">
          {messages.length === 0 && !loading && (
            <div className="mt-8 text-center fade-up">
              <p className="text-chrome/50 font-body text-sm mb-6">
                Tell APEX your name to begin.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-up`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-neon-teal/15 text-chrome border border-neon-teal/20 rounded-br-md'
                  : 'glass text-chrome/90 rounded-bl-md hud-corners'
              }`}>
                <div className="whitespace-pre-wrap relative z-10">{msg.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-neon-teal neon-pulse" />
                  <div className="w-2 h-2 rounded-full bg-neon-teal neon-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 rounded-full bg-neon-teal neon-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick suggestions per turn */}
        {!loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
          <QuickSuggestions turn={turn} onSelect={handleSend} />
        )}

        {/* Input */}
        <div className="relative z-10 flex-shrink-0 px-4 pb-8 pt-2">
          <div className="flex gap-2 items-end glass rounded-2xl p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={turn === 0 ? "Your name..." : "Type your response..."}
              rows={1}
              className="flex-1 bg-transparent text-chrome text-sm placeholder-chrome/30 resize-none focus:outline-none px-2 py-1.5 max-h-24 font-ui"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-r from-neon-teal to-neon-pink flex items-center justify-center disabled:opacity-20 transition btn-neon flex-shrink-0"
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PHASE: AUTH ────────────────────────────────────────
  if (phase === 'auth') {
    async function handleAuth(e: React.FormEvent) {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      try {
        if (authMode === 'signup') {
          await signUp(authEmail, authPassword);
        } else {
          await signIn(authEmail, authPassword);
        }
        setPhase('reveal');
      } catch (err: any) {
        setAuthError(err?.message || 'Authentication failed');
      } finally {
        setAuthLoading(false);
      }
    }

    async function handleGoogle() {
      setAuthError('');
      try {
        await signInWithGoogle();
        // Redirect flow — page will reload with session
      } catch (err: any) {
        setAuthError(err?.message || 'Google sign-in failed');
      }
    }

    return (
      <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute inset-0 scanlines" />

        <div className="relative z-10 w-full max-w-sm fade-up">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
              <Zap size={24} className="text-white" />
            </div>
            <h1 className="font-display text-lg text-neon-teal glow-text uppercase tracking-wider">
              Save Your Protocol
            </h1>
            <p className="font-ui text-xs text-chrome/50 mt-2">
              Create an account to sync across devices and never lose your data.
            </p>
          </div>

          {/* Google OAuth button */}
          <button
            onClick={handleGoogle}
            className="w-full py-3 rounded-xl font-ui text-sm text-chrome bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center gap-3 mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-chrome/30 font-ui uppercase">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleAuth} className="space-y-3">
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome/30" />
              <input
                type="email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full bg-white/5 rounded-xl pl-10 pr-4 py-3 text-chrome text-sm placeholder-chrome/30 border border-white/10 focus:border-neon-teal/50 focus:outline-none font-ui"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome/30" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                required
                minLength={6}
                className="w-full bg-white/5 rounded-xl pl-10 pr-10 py-3 text-chrome text-sm placeholder-chrome/30 border border-white/10 focus:border-neon-teal/50 focus:outline-none font-ui"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-chrome/30 hover:text-chrome/60"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {authError && (
              <p className="text-neon-pink text-xs font-ui">{authError}</p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl font-ui font-semibold text-sm uppercase tracking-wider
                bg-gradient-to-r from-neon-teal to-neon-pink text-white
                disabled:opacity-50 transition btn-neon flex items-center justify-center gap-2"
            >
              {authLoading && <Loader2 size={16} className="animate-spin" />}
              {authMode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <button
            onClick={() => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')}
            className="w-full mt-3 text-center text-xs text-chrome/40 font-ui hover:text-chrome/60 transition"
          >
            {authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>

          {/* Skip option */}
          <button
            onClick={() => setPhase('reveal')}
            className="w-full mt-6 text-center text-[10px] text-chrome/25 font-ui hover:text-chrome/40 transition"
          >
            Skip for now — I'll create an account later
          </button>
        </div>
      </div>
    );
  }

  // ─── PHASE 2: THE REVEAL ───────────────────────────────
  if (phase === 'reveal') {
    const macros = calculateMacros(collectedData as UserProfile);
    const bmr = calculateBMR(collectedData as UserProfile);
    const tdee = calculateTDEE(collectedData as UserProfile);
    const water = calculateWaterTarget(collectedData as UserProfile);

    const processingLines = [
      `> Parsing goal: ${collectedData.goal_description || 'optimize performance'}...`,
      `> Cross-referencing: ${collectedData.exercise_frequency || '?'}x/week training + ${collectedData.job_type || 'unknown'} lifestyle...`,
      `> Calculating BMR via ${collectedData.body_fat_pct ? 'Katch-McArdle' : 'Mifflin-St Jeor'}...`,
      `> Applying conservative activity multiplier → TDEE...`,
      `> Computing ISSN-backed macro split (protein-forward)...`,
      collectedData.supplements?.length ? `> Factoring supplement stack: ${collectedData.supplements.join(', ')}...` : '> Checking supplement considerations...',
      `> PROTOCOL READY.`,
    ];

    return (
      <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 scanlines" />

        <div className="relative z-10 w-full max-w-md">
          {/* Processing lines */}
          {!showPlan && (
            <div className="space-y-2 font-body text-xs">
              <p className="font-display text-sm text-neon-teal glow-text mb-6 uppercase tracking-wider">
                {revealStep < 6 ? 'Analyzing profile...' : 'Analysis complete'}
              </p>
              {processingLines.map((line, i) => (
                <div key={i} className={`transition-all duration-300 ${
                  i < revealStep ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                }`}>
                  <span className={i === processingLines.length - 1 && revealStep >= processingLines.length
                    ? 'text-neon-teal glow-text' : 'text-chrome/60'}>
                    {line}
                  </span>
                  {i < revealStep - 1 && <span className="text-neon-teal ml-2">✓</span>}
                </div>
              ))}
            </div>
          )}

          {/* Plan card */}
          {showPlan && (
            <div className="fade-up">
              <div className="glass rounded-2xl p-5 border border-neon-teal/20 glow-teal">
                <h2 className="font-display text-sm text-neon-teal uppercase tracking-wider mb-4">Your Protocol</h2>

                <div className="space-y-3 font-body text-sm">
                  <div className="flex justify-between">
                    <span className="text-chrome/60">BMR</span>
                    <span className="text-chrome font-data">{Math.round(bmr)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-chrome/60">TDEE (maintenance)</span>
                    <span className="text-chrome font-data">{tdee}</span>
                  </div>
                  <div className="border-t border-neon-teal/10 pt-3">
                    <div className="flex justify-between">
                      <span className="text-chrome/60">Daily Target</span>
                      <span className="text-neon-teal font-data font-bold text-lg glow-text">{macros.calories} cal</span>
                    </div>
                  </div>
                </div>

                {/* Macro bars */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-3 rounded-xl bg-neon-teal/5 border border-neon-teal/10">
                    <div className="font-data text-lg text-neon-teal">{macros.protein}g</div>
                    <div className="text-[10px] text-chrome/40 font-ui">PROTEIN</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-neon-pink/5 border border-neon-pink/10">
                    <div className="font-data text-lg text-neon-pink">{macros.carbs}g</div>
                    <div className="text-[10px] text-chrome/40 font-ui">CARBS</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-neon-orange/5 border border-neon-orange/10">
                    <div className="font-data text-lg text-neon-orange">{macros.fat}g</div>
                    <div className="text-[10px] text-chrome/40 font-ui">FAT</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-between text-sm font-body">
                  <span className="text-chrome/60">Water Target</span>
                  <span className="text-chrome font-data">{water}L / day</span>
                </div>

                {collectedData.supplements?.length ? (
                  <div className="mt-3 pt-3 border-t border-neon-teal/10">
                    <span className="text-[10px] text-chrome/40 font-ui uppercase tracking-wider">Active Stack</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {collectedData.supplements.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-electric-purple/10 text-electric-purple border border-electric-purple/20 font-body">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* CTA */}
              <button
                onClick={() => setPhase('commit')}
                className="w-full mt-6 py-4 rounded-xl font-ui font-semibold text-sm uppercase tracking-wider
                  bg-gradient-to-r from-neon-teal to-neon-pink text-white
                  glow-teal btn-neon"
              >
                Lock It In <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── PHASE 3: COMMITMENT ───────────────────────────────
  return (
    <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute inset-0 scanlines" />

      <div className="relative z-10 text-center max-w-sm fade-up">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
          <Zap size={28} className="text-white" />
        </div>

        <h1 className="font-display text-xl text-neon-teal glow-text uppercase tracking-wider mb-3">
          Protocol Loaded
        </h1>
        <p className="font-ui text-sm text-chrome/60 mb-8">
          Your AI nutritionist is calibrated. Every meal, every check-in, every conversation — APEX has your data and your back.
        </p>

        <button
          onClick={finishOnboarding}
          className="w-full py-4 rounded-xl font-display text-sm uppercase tracking-wider
            bg-gradient-to-r from-neon-teal to-neon-pink text-white
            glow-breathe btn-neon"
        >
          Let's Get Jacked
        </button>

        <p className="text-[10px] text-chrome/30 mt-4 font-body">
          Your protocol adapts in real-time as you train and eat.
        </p>
      </div>
    </div>
  );
}

// ─── QUICK SUGGESTIONS ────────────────────────────────────
// Shows tappable suggestion chips per conversation turn to reduce typing

const TURN_SUGGESTIONS: Record<number, string[]> = {
  1: [
    'Lose fat and get lean',
    'Build muscle and strength',
    'Recomp — lose fat, gain muscle',
    'Get stronger, maintain weight',
  ],
  2: [
    'Male, 30, 183cm, 95kg, goal 85kg',
    'Male, 35, 178cm, 90kg, goal 82kg',
    'Female, 28, 165cm, 70kg, goal 62kg',
    'Male, 40, 175cm, 100kg, goal 88kg',
  ],
  3: [
    'Desk job, lift 4x/week',
    'Desk job, lift 3x/week + cardio 2x',
    'On my feet all day, lift 3x/week',
    'Physical job, train 5x/week',
  ],
  4: [
    '7 hours sleep, moderate stress, 2-3 drinks/week',
    '8 hours sleep, low stress, no alcohol',
    '6 hours sleep, high stress, 4-5 drinks/week',
    '7 hours sleep, moderate stress, no alcohol',
  ],
  5: [
    'Love steak, tacos, stir fry. Hate mushrooms. Quick meals. 7/10 adventurous',
    'Love chicken, pasta, sushi. Hate seafood. Meal prep. 5/10 adventurous',
    'Love burgers, BBQ, rice bowls. Hate olives. From scratch. 8/10 adventurous',
  ],
  6: [
    'Chips and trail mix, mostly boredom snacking. Both sweet and savory.',
    'Protein bars and fruit, genuine hunger. Savory preference.',
    'Late night snacking — ice cream, habit-driven. Sweet tooth.',
  ],
  7: [
    'Creatine, protein powder, multivitamin, fish oil. No peptides.',
    'Creatine, pre-workout, magnesium. Taking BPC-157 for a shoulder issue.',
    'Just protein powder and creatine. Interested in optimizing my stack.',
    'No supplements currently. Open to recommendations.',
  ],
  8: [
    'Garmin watch. No major injuries. Just want to be consistent.',
    'Apple Watch. Bad left knee from running. Love deadlifts.',
    'Garmin. Recovering from lower back strain. Sleep could be better.',
    'No wearable yet. Generally healthy, no injuries.',
  ],
  9: [
    'Moderate pace — about 1.2 lbs per week',
    'Steady and sustainable — 1 lb per week',
    'Aggressive — let\'s go hard, 1.5 lbs per week',
  ],
};

function QuickSuggestions({ turn, onSelect }: { turn: number; onSelect: (text: string) => void }) {
  const suggestions = TURN_SUGGESTIONS[turn];
  if (!suggestions) return null;

  return (
    <div className="relative z-10 px-4 pb-2">
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="text-left px-3 py-2 rounded-xl text-xs font-ui text-chrome/60
              bg-white/[0.03] border border-white/[0.06]
              hover:bg-neon-teal/5 hover:border-neon-teal/20 hover:text-chrome/80
              transition-all duration-200 active:scale-[0.98]"
          >
            {s}
          </button>
        ))}
      </div>
      <p className="text-[9px] text-chrome/20 mt-1.5 text-center font-ui">Tap a suggestion or type your own</p>
    </div>
  );
}

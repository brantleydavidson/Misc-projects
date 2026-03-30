import { useState, useRef, useEffect, useCallback } from 'react';
import { Dumbbell, Send, Zap, ChevronRight } from 'lucide-react';
import type { UserProfile } from '../types';
import { sendOnboarding } from '../lib/api';
import { calculateMacros, calculateWaterTarget, calculateBMR, calculateTDEE } from '../lib/calculations';

interface OnboardingProps {
  profile: UserProfile;
  onUpdate: (data: Partial<UserProfile>) => void;
  onComplete: () => void;
}

type Phase = 'arrival' | 'conversation' | 'reveal' | 'commit';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const TOTAL_TURNS = 9;

export function Onboarding({ profile, onUpdate, onComplete }: OnboardingProps) {
  const [phase, setPhase] = useState<Phase>('arrival');
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
    setPhase('conversation');
  }, []);

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

  async function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    // Extract data from user message
    const extracted = extractData(msg, turn);
    const newCollected = { ...collectedData, ...extracted };
    setCollectedData(newCollected);

    // Check if conversation is complete
    if (turn >= TOTAL_TURNS) {
      // Move to reveal phase
      setLoading(false);
      onUpdate(newCollected);
      setPhase('reveal');
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
            JACKEDAI
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

  // ─── PHASE 2: THE REVEAL ───────────────────────────────
  if (phase === 'reveal') {
    const macros = calculateMacros(collectedData as UserProfile);
    const bmr = calculateBMR(collectedData as UserProfile);
    const tdee = calculateTDEE(collectedData as UserProfile);
    const water = calculateWaterTarget(collectedData as UserProfile);

    const processingLines = [
      `> Parsing goal: ${collectedData.goal_description || 'optimize performance'}...`,
      `> Cross-referencing: ${collectedData.exercise_frequency || '?'}x/week training + ${collectedData.job_type || 'unknown'} lifestyle...`,
      `> Calculating BMR via Mifflin-St Jeor...`,
      `> Mapping activity multiplier → TDEE...`,
      `> Computing macro split (protein-forward)...`,
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

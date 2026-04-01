import { useState, useEffect, useRef } from 'react';
import {
  Camera, Zap, Target, Brain, UtensilsCrossed,
  ChevronRight, Dumbbell, ArrowRight, Smartphone, Monitor,
  Shield, BarChart3, MessageCircle, Sparkles,
} from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export function Landing({ onGetStarted, onSignIn }: LandingProps) {
  const [visible, setVisible] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-deep-navy text-chrome overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-deep-navy/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center">
              <Dumbbell size={18} className="text-white" />
            </div>
            <span className="font-display text-lg tracking-wider text-neon-teal">BEJACKED</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onSignIn} className="text-sm font-ui text-chrome/60 hover:text-chrome transition px-3 py-2">
              Sign In
            </button>
            <button onClick={onGetStarted}
              className="text-sm font-ui font-semibold text-deep-navy bg-neon-teal hover:bg-neon-teal/90 px-5 py-2 rounded-xl transition btn-neon hidden sm:block"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-15" />
        <div className="absolute inset-0 scanlines" />
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-neon-teal/10 blur-[128px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-neon-pink/10 blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-electric-purple/5 blur-[160px]" />

        <div className={`relative z-10 max-w-4xl mx-auto px-6 text-center transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neon-teal/10 border border-neon-teal/20 mb-8">
            <Sparkles size={14} className="text-neon-teal" />
            <span className="text-xs font-ui text-neon-teal uppercase tracking-wider">AI-Powered Fitness Intelligence</span>
          </div>

          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-wider uppercase leading-[1.1] mb-6">
            <span className="text-chrome">Your Body.</span>
            <br />
            <span className="gradient-text">Your Protocol.</span>
          </h1>

          <p className="font-ui text-base sm:text-lg text-chrome/50 max-w-xl mx-auto mb-10 leading-relaxed">
            Snap a photo. Get instant macros. Chat with an AI coach that actually knows your data.
            BeJacked turns every meal into a calculated move.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-ui font-bold text-base uppercase tracking-wider
                bg-gradient-to-r from-neon-teal to-neon-pink text-white glow-teal btn-neon
                flex items-center justify-center gap-3"
            >
              Start Your Protocol <ArrowRight size={18} />
            </button>
            <button onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-ui text-sm uppercase tracking-wider
                text-chrome/60 border border-white/10 hover:border-white/20 hover:text-chrome transition
                flex items-center justify-center gap-2"
            >
              See How It Works
            </button>
          </div>

          {/* Hero visual — phone mockup */}
          <div className="relative mx-auto max-w-xs">
            <div className="relative rounded-[2rem] border-2 border-white/10 bg-midnight overflow-hidden shadow-2xl shadow-neon-teal/10">
              <div className="aspect-[9/16] p-4 flex flex-col">
                {/* Mock status bar */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-data text-chrome/40">9:41</span>
                  <div className="flex gap-1">
                    <div className="w-4 h-2 rounded-sm bg-neon-teal/40" />
                    <div className="w-2 h-2 rounded-full bg-chrome/20" />
                  </div>
                </div>
                {/* Mock greeting */}
                <div className="mb-3">
                  <p className="font-display text-xs text-chrome uppercase tracking-wider">DAY 47. LET'S MOVE.</p>
                </div>
                {/* Mock calorie ring */}
                <div className="glass rounded-2xl p-4 mb-3 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full border-4 border-neon-teal/60 flex items-center justify-center relative">
                    <div className="absolute inset-0 rounded-full border-4 border-transparent" style={{ borderTopColor: '#00E5CC', borderRightColor: '#00E5CC', transform: 'rotate(45deg)' }} />
                    <div className="text-center">
                      <span className="font-data text-sm text-white">847</span>
                      <span className="block text-[8px] text-chrome/40">left</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <MockBar label="Protein" pct={65} color="bg-neon-teal" />
                    <MockBar label="Carbs" pct={42} color="bg-neon-pink" />
                    <MockBar label="Fat" pct={55} color="bg-neon-orange" />
                  </div>
                </div>
                {/* Mock food entry */}
                <div className="glass rounded-2xl p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px]">☀️</span>
                    <span className="text-[10px] font-ui text-chrome/60 uppercase">Lunch</span>
                    <span className="ml-auto text-[10px] font-data text-chrome/40">680 cal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-teal/20 to-neon-pink/20 flex items-center justify-center">
                      <Camera size={12} className="text-neon-teal" />
                    </div>
                    <div>
                      <p className="text-[11px] text-chrome">Grilled chicken bowl</p>
                      <p className="text-[9px] text-chrome/40">42p 65c 22f</p>
                    </div>
                  </div>
                </div>
                {/* Mock coach message */}
                <div className="glass rounded-2xl p-3 hud-corners">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap size={10} className="text-electric-purple" />
                    <span className="text-[9px] font-ui text-electric-purple uppercase">APEX</span>
                  </div>
                  <p className="text-[10px] text-chrome/70 font-body leading-relaxed">
                    You're 38g short on protein today. A Greek yogurt with almonds before bed would close the gap and support overnight recovery.
                  </p>
                </div>
              </div>
            </div>
            {/* Phone glow */}
            <div className="absolute -inset-4 rounded-[3rem] bg-gradient-to-b from-neon-teal/5 to-neon-pink/5 blur-xl -z-10" />
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="relative py-12 border-y border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            <StatBlock value="<5s" label="Photo to macros" />
            <StatBlock value="24/7" label="AI coach access" />
            <StatBlock value="97%" label="Logging accuracy" />
            <StatBlock value="0" label="Guesswork" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section ref={featuresRef} className="relative py-24 sm:py-32">
        <div className="absolute inset-0 grid-bg opacity-10" />
        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl sm:text-4xl tracking-wider uppercase text-chrome mb-4">
              EVERY TOOL. <span className="text-neon-teal">ONE SYSTEM.</span>
            </h2>
            <p className="font-ui text-sm text-chrome/40 max-w-lg mx-auto">
              Not another calorie counter. BeJacked is an AI-first fitness system that adapts to you.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <FeatureCard
              icon={<Camera size={22} />}
              title="Snap & Track"
              description="Photograph your food. AI identifies it instantly — calories, protein, carbs, fat. No typing. No searching databases."
              color="neon-teal"
            />
            <FeatureCard
              icon={<Brain size={22} />}
              title="APEX Coach"
              description="Your AI coach remembers everything — your goals, injuries, preferences. Every conversation builds on the last."
              color="electric-purple"
            />
            <FeatureCard
              icon={<Target size={22} />}
              title="Smart Targets"
              description="Personalized macro protocols calculated from your body, goals, and activity level. Adjusted in real-time by your coach."
              color="neon-pink"
            />
            <FeatureCard
              icon={<UtensilsCrossed size={22} />}
              title="Eat Out Mode"
              description="At a restaurant? Tell APEX where you are. Get macro-optimized ordering recommendations for any menu."
              color="neon-orange"
            />
            <FeatureCard
              icon={<BarChart3 size={22} />}
              title="Trend Intelligence"
              description="14-day rolling analysis spots patterns you'd miss — weekend calorie spikes, protein gaps, weight stalls."
              color="neon-teal"
            />
            <FeatureCard
              icon={<MessageCircle size={22} />}
              title="Real Conversations"
              description="Not canned responses. Real LLM conversations about your nutrition, training, supplements, and progress."
              color="electric-purple"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative py-24 sm:py-32 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl sm:text-4xl tracking-wider uppercase text-chrome mb-4">
              THREE MINUTES TO <span className="text-neon-pink">LAUNCH</span>
            </h2>
            <p className="font-ui text-sm text-chrome/40">From zero to fully calibrated AI coaching.</p>
          </div>

          <div className="space-y-8 sm:space-y-12">
            <StepRow step="01" title="Talk to APEX" description="A quick conversation about your goals, body, and lifestyle. No forms — just talk." icon={<MessageCircle size={24} />} color="neon-teal" />
            <StepRow step="02" title="Get Your Protocol" description="APEX calculates your BMR, TDEE, and optimal macro split using exercise science standards." icon={<Target size={24} />} color="neon-pink" />
            <StepRow step="03" title="Start Snapping" description="Photograph every meal. APEX handles the rest — tracking, coaching, adjusting." icon={<Camera size={24} />} color="neon-orange" />
          </div>
        </div>
      </section>

      {/* Device showcase */}
      <section className="relative py-24 sm:py-32 border-t border-white/5 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-neon-teal/5 blur-[160px] rounded-full" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl tracking-wider uppercase text-chrome mb-4">
            WORKS <span className="text-neon-teal">EVERYWHERE</span>
          </h2>
          <p className="font-ui text-sm text-chrome/40 max-w-lg mx-auto mb-12">
            Phone, tablet, desktop. Your data syncs instantly across every device.
          </p>
          <div className="flex items-center justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl glass flex items-center justify-center mb-3 border border-neon-teal/20">
                <Smartphone size={28} className="text-neon-teal" />
              </div>
              <span className="font-ui text-xs text-chrome/40 uppercase">Mobile</span>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl glass flex items-center justify-center mb-3 border border-neon-teal/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-neon-teal">
                  <rect x="4" y="3" width="16" height="14" rx="2" />
                  <path d="M2 20h20" />
                  <path d="M12 17v3" />
                </svg>
              </div>
              <span className="font-ui text-xs text-chrome/40 uppercase">Tablet</span>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl glass flex items-center justify-center mb-3 border border-neon-teal/20">
                <Monitor size={28} className="text-neon-teal" />
              </div>
              <span className="font-ui text-xs text-chrome/40 uppercase">Desktop</span>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial / APEX quote */}
      <section className="relative py-24 sm:py-32 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="glass rounded-3xl p-8 sm:p-12 hud-corners relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-electric-purple/20 border border-electric-purple/30">
              <Zap size={12} className="text-electric-purple" />
              <span className="text-[10px] font-ui text-electric-purple uppercase tracking-wider">APEX Intelligence</span>
            </div>
            <p className="font-body text-lg sm:text-xl text-chrome/80 leading-relaxed mt-4 mb-6">
              "I don't count calories for you — I learn how you eat, when you're inconsistent, and what's actually holding you back.
              Then I fix it. Every conversation makes me sharper."
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-electric-purple to-neon-pink flex items-center justify-center">
                <Zap size={14} className="text-white" />
              </div>
              <div className="text-left">
                <p className="font-ui text-xs text-chrome/80">APEX</p>
                <p className="text-[10px] text-chrome/40 font-body">Adaptive Personal EXpert</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security strip */}
      <section className="py-12 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-chrome/30">
            <div className="flex items-center gap-2">
              <Shield size={16} /> <span className="font-ui text-xs uppercase">End-to-end encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={16} /> <span className="font-ui text-xs uppercase">Your data stays yours</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={16} /> <span className="font-ui text-xs uppercase">No ads. Ever.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-15" />
        <div className="absolute inset-0 scanlines" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-neon-teal/8 blur-[160px]" />

        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-wider uppercase text-chrome mb-6 leading-[1.1]">
            THE GRID<br /><span className="text-neon-teal glow-text">NEVER SLEEPS</span>
          </h2>
          <p className="font-ui text-sm text-chrome/50 mb-10 max-w-md mx-auto">
            Your AI coach is ready. Your protocol is waiting.
            The only thing missing is the data — and that starts with your first meal.
          </p>
          <button onClick={onGetStarted}
            className="px-10 py-5 rounded-xl font-display text-base uppercase tracking-widest
              bg-gradient-to-r from-neon-teal to-neon-pink text-white glow-teal btn-neon glow-breathe
              flex items-center justify-center gap-3 mx-auto"
          >
            Initialize Protocol <ChevronRight size={20} />
          </button>
          <p className="mt-6 text-[11px] text-chrome/30 font-body">Free to start. No credit card required.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center">
              <Dumbbell size={12} className="text-white" />
            </div>
            <span className="font-display text-sm tracking-wider text-chrome/40">BEJACKED</span>
          </div>
          <p className="text-[11px] text-chrome/20 font-body">&copy; {new Date().getFullYear()} BeJacked. Built in the neon.</p>
        </div>
      </footer>
    </div>
  );
}

/* Sub-components */

function MockBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[8px] text-chrome/50">{label}</span>
        <span className="text-[8px] font-data text-chrome/40">{pct}%</span>
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-data text-2xl sm:text-3xl text-neon-teal mb-1">{value}</div>
      <div className="font-ui text-[10px] text-chrome/40 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }: {
  icon: React.ReactNode; title: string; description: string; color: string;
}) {
  const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
    'neon-teal': { border: 'border-neon-teal/20', bg: 'bg-neon-teal/10', text: 'text-neon-teal', glow: 'group-hover:shadow-[0_0_30px_rgba(0,229,204,0.1)]' },
    'neon-pink': { border: 'border-neon-pink/20', bg: 'bg-neon-pink/10', text: 'text-neon-pink', glow: 'group-hover:shadow-[0_0_30px_rgba(255,45,120,0.1)]' },
    'neon-orange': { border: 'border-neon-orange/20', bg: 'bg-neon-orange/10', text: 'text-neon-orange', glow: 'group-hover:shadow-[0_0_30px_rgba(255,107,26,0.1)]' },
    'electric-purple': { border: 'border-electric-purple/20', bg: 'bg-electric-purple/10', text: 'text-electric-purple', glow: 'group-hover:shadow-[0_0_30px_rgba(139,47,201,0.1)]' },
  };
  const c = colorMap[color] || colorMap['neon-teal'];

  return (
    <div className={`group glass rounded-2xl p-6 border ${c.border} hover:border-opacity-40 transition-all duration-300 ${c.glow}`}>
      <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center mb-4 ${c.text}`}>
        {icon}
      </div>
      <h3 className="font-ui text-sm font-semibold text-chrome uppercase tracking-wider mb-2">{title}</h3>
      <p className="font-body text-xs text-chrome/50 leading-relaxed">{description}</p>
    </div>
  );
}

function StepRow({ step, title, description, icon, color }: {
  step: string; title: string; description: string; icon: React.ReactNode; color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    'neon-teal': { bg: 'bg-neon-teal/10', text: 'text-neon-teal', border: 'border-neon-teal/20' },
    'neon-pink': { bg: 'bg-neon-pink/10', text: 'text-neon-pink', border: 'border-neon-pink/20' },
    'neon-orange': { bg: 'bg-neon-orange/10', text: 'text-neon-orange', border: 'border-neon-orange/20' },
  };
  const c = colorMap[color] || colorMap['neon-teal'];

  return (
    <div className="flex items-start gap-6">
      <div className="flex-shrink-0 flex flex-col items-center">
        <div className={`w-14 h-14 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center ${c.text}`}>
          {icon}
        </div>
        <span className={`font-data text-[10px] mt-2 ${c.text}`}>{step}</span>
      </div>
      <div className="pt-2">
        <h3 className="font-ui text-base font-semibold text-chrome uppercase tracking-wider mb-1">{title}</h3>
        <p className="font-body text-sm text-chrome/50 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

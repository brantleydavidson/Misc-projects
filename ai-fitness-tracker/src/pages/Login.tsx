import { useState } from 'react';
import { Dumbbell, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { fetchProfileByEmail, linkProfileToDevice, saveProfileEmail } from '../lib/db';
import { saveProfile } from '../lib/storage';
import type { UserProfile } from '../types';

interface LoginProps {
  onLoggedIn: (profile: UserProfile) => void;
  onStartOnboarding: () => void;
}

export function Login({ onLoggedIn, onStartOnboarding }: LoginProps) {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await signIn(email, password);
      if (!user?.email) throw new Error('Login failed');
      await pullProfile(user.email);
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    try {
      await signInWithGoogle();
      // Redirect flow — onAuthStateChange in App.tsx will handle the rest
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed');
    }
  }

  async function pullProfile(userEmail: string) {
    try {
      const remoteProfile = await fetchProfileByEmail(userEmail);
      if (remoteProfile && remoteProfile.onboarding_complete) {
        // Link this device to the existing profile
        await linkProfileToDevice(remoteProfile.id!, userEmail);
        // Merge into localStorage
        const merged = saveProfile(remoteProfile);
        onLoggedIn(merged);
      } else {
        // No existing profile found — go to onboarding
        // But save email for later
        await saveProfileEmail(userEmail);
        onStartOnboarding();
      }
    } catch {
      // If profile fetch fails, still proceed to onboarding
      onStartOnboarding();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-deep-navy flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute inset-0 scanlines" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neon-teal to-neon-pink flex items-center justify-center glow-teal">
            <Dumbbell size={32} className="text-white" />
          </div>
          <h1 className="font-display text-3xl tracking-wider text-neon-teal glow-text">JACKEDAI</h1>
          <p className="font-ui text-xs text-chrome/40 mt-2 tracking-widest uppercase">Welcome back</p>
        </div>

        {/* Google OAuth */}
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
          Sign in with Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-chrome/30 font-ui uppercase">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome/30" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-white/5 rounded-xl pl-10 pr-4 py-3 text-chrome text-sm placeholder-chrome/30 border border-white/10 focus:border-neon-teal/50 focus:outline-none font-ui"
            />
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome/30" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
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

          {error && (
            <p className="text-neon-pink text-xs font-ui">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-ui font-semibold text-sm uppercase tracking-wider
              bg-gradient-to-r from-neon-teal to-neon-pink text-white
              disabled:opacity-50 transition btn-neon flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Sign In
          </button>
        </form>

        {/* New user CTA */}
        <div className="mt-8 text-center">
          <p className="text-xs text-chrome/30 font-ui mb-3">First time here?</p>
          <button
            onClick={onStartOnboarding}
            className="w-full py-3 rounded-xl font-ui text-sm text-neon-teal border border-neon-teal/30 bg-neon-teal/5 hover:bg-neon-teal/10 transition"
          >
            Start New Protocol
          </button>
        </div>
      </div>
    </div>
  );
}

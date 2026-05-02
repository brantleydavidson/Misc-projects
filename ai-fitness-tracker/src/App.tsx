import { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Dashboard } from './pages/Dashboard';
import { SnapFood } from './pages/SnapFood';
import { Chat } from './pages/Chat';
import { FoodLog } from './pages/FoodLog';
import { Profile } from './pages/Profile';
import { CheckIn } from './pages/CheckIn';
import { Trends } from './pages/Trends';
import { Upgrade } from './pages/Upgrade';
import { Habits } from './pages/Habits';
import { EatOut } from './pages/EatOut';
import { Onboarding } from './pages/Onboarding';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { useProfile } from './hooks/useProfile';
import { useAuth } from './hooks/useAuth';
import {
  registerServiceWorker, scheduleAllReminders, getNotificationPermission,
} from './lib/notifications';
import { performFullSync, saveProfileEmail, fetchProfileByEmail } from './lib/db';
import { saveProfile as saveProfileToStorage } from './lib/storage';
import { sendEmail } from './lib/api';
import type { UserProfile } from './types';

type Screen = 'landing' | 'login' | 'onboarding' | 'app';

export default function App() {
  const { profile, updateProfile } = useProfile();
  const { user, loading: authLoading } = useAuth();

  // Detect Terra OAuth return — if so, jump straight into the analyzing phase
  const terraReturn = typeof window !== 'undefined' && /[?&]terra=connected/.test(window.location.search);

  // Determine initial screen
  const [screen, setScreen] = useState<Screen>(
    terraReturn ? 'onboarding' : (profile.onboarding_complete ? 'app' : 'landing')
  );
  const [onboardingInitialPhase, setOnboardingInitialPhase] = useState<'analyzing' | undefined>(
    terraReturn ? 'analyzing' : undefined
  );

  // Clean the terra param out of the URL once we've consumed it
  useEffect(() => {
    if (terraReturn) {
      const url = new URL(window.location.href);
      url.searchParams.delete('terra');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register service worker + schedule notifications + initial Supabase sync
  useEffect(() => {
    registerServiceWorker().then(() => {
      if (getNotificationPermission() === 'granted') {
        scheduleAllReminders();
      }
    });

    performFullSync().then(result => {
      if (result.synced) console.log('[App] Supabase sync complete');
    });
  }, []);

  // Handle Google OAuth redirect — user comes back with a session
  useEffect(() => {
    if (authLoading || !user?.email) return;
    if (screen !== 'login' && screen !== 'landing') return;

    // User just authenticated via Google redirect — try to pull their profile
    (async () => {
      const remoteProfile = await fetchProfileByEmail(user.email!);
      if (remoteProfile && remoteProfile.onboarding_complete) {
        const merged = saveProfileToStorage(remoteProfile);
        updateProfile(merged);
        setScreen('app');
      } else {
        // Save email for later, go to onboarding
        await saveProfileEmail(user.email!);
        setScreen('onboarding');
      }
    })();
  }, [user, authLoading, screen, updateProfile]);

  // After auth during onboarding, save the user's email on their profile
  useEffect(() => {
    if (user?.email && profile.onboarding_complete) {
      saveProfileEmail(user.email).catch(() => {});
    }
  }, [user, profile.onboarding_complete]);

  const handleOnboardingComplete = useCallback(() => {
    // Save email if authenticated
    if (user?.email) {
      saveProfileEmail(user.email).catch(() => {});
      // Send welcome email
      sendEmail(user.email, 'welcome', { name: user.email.split('@')[0] }).catch(() => {});
    }
    setScreen('app');
  }, [user]);

  const handleResetOnboarding = useCallback(() => {
    setScreen('onboarding');
  }, []);

  const handleLoggedIn = useCallback((remoteProfile: UserProfile) => {
    updateProfile(remoteProfile);
    setScreen('app');
  }, [updateProfile]);

  const handleStartOnboarding = useCallback(() => {
    setScreen('onboarding');
  }, []);

  if (screen === 'landing') {
    return (
      <Landing
        onGetStarted={handleStartOnboarding}
        onSignIn={() => setScreen('login')}
      />
    );
  }

  if (screen === 'login') {
    return (
      <Login
        onLoggedIn={handleLoggedIn}
        onStartOnboarding={handleStartOnboarding}
        onBack={() => setScreen('landing')}
      />
    );
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        profile={profile}
        onUpdate={updateProfile}
        onComplete={handleOnboardingComplete}
        initialPhase={onboardingInitialPhase}
      />
    );
  }

  return (
    <BrowserRouter>
      <div className="h-full flex flex-col bg-deep-navy">
        <main className="flex-1 overflow-y-auto no-scrollbar">
          <Routes>
            <Route path="/" element={<Dashboard profile={profile} />} />
            <Route path="/trends" element={<Trends profile={profile} />} />
            <Route path="/snap" element={<SnapFood />} />
            <Route path="/chat" element={<Chat profile={profile} onUpdateProfile={updateProfile} />} />
            <Route path="/eat-out" element={<EatOut profile={profile} />} />
            <Route path="/log" element={<FoodLog profile={profile} />} />
            <Route path="/checkin" element={<CheckIn profile={profile} />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/upgrade" element={<Upgrade onBack={() => window.history.back()} />} />
            <Route path="/profile" element={
              <Profile profile={profile} onUpdate={updateProfile} onResetOnboarding={handleResetOnboarding} />
            } />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

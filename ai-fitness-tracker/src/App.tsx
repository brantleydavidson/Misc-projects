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
import { Onboarding } from './pages/Onboarding';
import { Login } from './pages/Login';
import { useProfile } from './hooks/useProfile';
import { useAuth } from './hooks/useAuth';
import {
  registerServiceWorker, scheduleAllReminders, getNotificationPermission,
} from './lib/notifications';
import { performFullSync, saveProfileEmail, fetchProfileByEmail } from './lib/db';
import { saveProfile as saveProfileToStorage } from './lib/storage';
import type { UserProfile } from './types';

type Screen = 'login' | 'onboarding' | 'app';

export default function App() {
  const { profile, updateProfile } = useProfile();
  const { user, loading: authLoading } = useAuth();

  // Determine initial screen
  const [screen, setScreen] = useState<Screen>(
    profile.onboarding_complete ? 'app' : 'login'
  );

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
    if (screen !== 'login') return;

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

  if (screen === 'login') {
    return (
      <Login
        onLoggedIn={handleLoggedIn}
        onStartOnboarding={handleStartOnboarding}
      />
    );
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        profile={profile}
        onUpdate={updateProfile}
        onComplete={handleOnboardingComplete}
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
            <Route path="/log" element={<FoodLog profile={profile} />} />
            <Route path="/checkin" element={<CheckIn />} />
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

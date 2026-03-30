import { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Dashboard } from './pages/Dashboard';
import { SnapFood } from './pages/SnapFood';
import { Chat } from './pages/Chat';
import { FoodLog } from './pages/FoodLog';
import { Profile } from './pages/Profile';
import { CheckIn } from './pages/CheckIn';
import { Onboarding } from './pages/Onboarding';
import { useProfile } from './hooks/useProfile';
import { scheduleAllReminders, getNotificationPermission } from './lib/notifications';

export default function App() {
  const { profile, updateProfile } = useProfile();
  const [showOnboarding, setShowOnboarding] = useState(!profile.onboarding_complete);

  // Start notification scheduling on mount if permission granted
  useEffect(() => {
    if (getNotificationPermission() === 'granted') {
      scheduleAllReminders();
    }
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleResetOnboarding = useCallback(() => {
    setShowOnboarding(true);
  }, []);

  if (showOnboarding) {
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
      <div className="h-full flex flex-col bg-slate-950">
        <main className="flex-1 overflow-y-auto no-scrollbar">
          <Routes>
            <Route path="/" element={<Dashboard profile={profile} />} />
            <Route path="/snap" element={<SnapFood />} />
            <Route path="/chat" element={<Chat profile={profile} />} />
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

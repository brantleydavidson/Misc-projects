import { useState, useCallback } from 'react';
import type { UserProfile } from '../types';
import { getProfile, saveProfile } from '../lib/storage';

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(getProfile);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    const updated = saveProfile(updates);
    setProfile(updated);
    return updated;
  }, []);

  return { profile, updateProfile };
}

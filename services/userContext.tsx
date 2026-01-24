import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { UserProfile, UserPreferences } from '../types';
import { Language } from './i18n';
import { supabase } from './supabaseClient';
import { authService } from './authService';

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const getDefaultLanguage = (): Language => {
  return (localStorage.getItem('brew_lang') as Language) || 'en';
};

const defaultPreferences: UserPreferences = {
  units: 'metric',
  colorScale: 'srm',
  language: getDefaultLanguage()
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    }) ?? { data: { subscription: null } };

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      let p = await authService.getProfile(userId);
      if (!p) {
        // Create default profile if not exists
        const newProfile: UserProfile = {
          id: userId,
          role: 'user',
          preferences: defaultPreferences
        };
        await authService.updateProfile(newProfile);
        p = newProfile;
      }
      setProfile(p);
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    const currentPrefs = profile?.preferences || defaultPreferences;
    const newPrefs = { ...currentPrefs, ...prefs };

    if (prefs.language) {
      localStorage.setItem('brew_lang', prefs.language);
    }

    if (!user || !profile) {
      // If no user, just update local default preferences (simulated)
      // This helps when user is not logged in
      setProfile(prev => prev ? { ...prev, preferences: newPrefs } : { id: 'temp', role: 'user', preferences: newPrefs });
      return;
    }

    const updatedProfile = { ...profile, preferences: newPrefs };
    await authService.updateProfile(updatedProfile);
    setProfile(updatedProfile);
  };

  const signOut = async () => {
    await authService.signOut();
  };

  const value = {
    user,
    profile,
    loading,
    preferences: profile?.preferences || defaultPreferences,
    updatePreferences,
    signOut,
    isAdmin: profile?.role === 'admin'
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

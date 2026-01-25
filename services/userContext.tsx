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
  const saved = localStorage.getItem('brew_lang') as Language;
  if (saved && (saved === 'en' || saved === 'nl' || saved === 'fr')) return saved;

  const browserLang = navigator.language.split('-')[0];
  if (browserLang === 'nl' || browserLang === 'fr') return browserLang as Language;

  return 'en';
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

  // Debounced persistence of preferences
  useEffect(() => {
    if (!user || !profile || profile.id === 'temp') return;

    const timer = setTimeout(async () => {
      try {
        await authService.updateProfile(profile);
      } catch (err) {
        console.error('Failed to sync preferences to Supabase:', err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [profile, user]);

  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    // 1. Update state immediately using functional update to avoid stale closures
    setProfile(prev => {
      const currentPrefs = { ...defaultPreferences, ...prev?.preferences };
      const newPrefs = { ...currentPrefs, ...prefs };

      if (prefs.language) {
        localStorage.setItem('brew_lang', prefs.language);
      }

      if (prev) {
        return { ...prev, preferences: newPrefs };
      } else {
        return { id: 'temp', role: 'user', preferences: newPrefs } as UserProfile;
      }
    });
  };

  const signOut = async () => {
    try {
      // Add a safety timeout of 3 seconds for the signout call to prevent UI hanging
      await Promise.race([
        authService.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Signout timeout')), 3000))
      ]);
    } catch (err) {
      console.error('Error or timeout during signOut:', err);
    } finally {
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
  };

  const value = {
    user,
    profile,
    loading,
    preferences: { ...defaultPreferences, ...profile?.preferences },
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

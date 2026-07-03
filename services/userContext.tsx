import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { UserProfile, UserPreferences } from '../types';
import { Language } from './i18n';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import { breweryService } from './breweryService';

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  breweryRole: string | null;
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
  language: getDefaultLanguage(),
  enableStockManagement: false
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

  useEffect(() => {
    let profileSubscription: any = null;
    if (user?.id && supabase) {
       profileSubscription = supabase
         .channel('profile-updates')
         .on('postgres_changes', {
           event: 'UPDATE',
           schema: 'public',
           table: 'profiles',
           filter: `id=eq.${user.id}`
         }, (payload) => {
           setProfile(prev => ({ ...prev, ...payload.new } as UserProfile));
         })
         .subscribe();
    }
    return () => {
       if (profileSubscription) supabase?.removeChannel(profileSubscription);
    }
  }, [user?.id]);

  const fetchProfile = async (userId: string) => {
    try {
      let p = await authService.getProfile(userId);

      const pendingInviteCode = localStorage.getItem('pending_invite_code');

      if (!p) {
        // This case should ideally be handled by handle_new_user trigger.
        // If it isn't (e.g. race condition or trigger error), we create a minimal profile.
        // The trigger in SQL_SCHEMA handles brewery creation more reliably.
        const minimalProfile: UserProfile = {
          id: userId,
          role: 'user',
          preferences: defaultPreferences
        };
        await authService.updateProfile(minimalProfile);
        p = await authService.getProfile(userId) || minimalProfile;
      } else {
        // Ensure fetched profile has all default preference keys (e.g. language)
        const mergedPrefs = { ...defaultPreferences, ...p.preferences };
        if (JSON.stringify(mergedPrefs) !== JSON.stringify(p.preferences)) {
           p = { ...p, preferences: mergedPrefs };
           await authService.updateProfile(p);
        }
      }

      // Handle pending invite for existing user who just logged in
      if (p && pendingInviteCode) {
         if (p.brewery_id) {
            alert("You are already part of a brewery. Please export your data, delete your account, and re-join if you want to switch.");
         } else {
            try {
               await breweryService.joinBrewery(pendingInviteCode, userId);
               p = await authService.getProfile(userId);
            } catch (err: any) {
               alert(`Join failed: ${err.message}`);
            }
         }
         localStorage.removeItem('pending_invite_code');
      }

      setProfile(p);
    } catch (err) {
      console.error('Critical Error in fetchProfile:', err);
      // Even if fetch/upsert fails, we set a minimal profile state if we have a user
      // so the app can at least function in "optimistic" mode.
      if (user?.id) {
        setProfile({ id: user.id, role: 'user', preferences: defaultPreferences });
      }
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
        // Use the actual user ID if available, even if the profile hasn't loaded yet.
        // This allows the debounced sync to try and create/update the row.
        return { id: user?.id || 'temp', role: 'user', preferences: newPrefs } as UserProfile;
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
    isAdmin: profile?.role === 'admin',
    breweryRole: profile?.brewery_role ?? null
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

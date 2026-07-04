import { supabase } from './supabaseClient';
import { UserProfile } from '../types';

export const authService = {
  async signUp(email: string, password: string, inviteCode?: string) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: inviteCode ? { invite_code: inviteCode } : undefined
      }
    });
    if (error) throw error;
    return data;
  },

  async signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  },

  async updateProfile(profile: Partial<UserProfile>) {
    if (!supabase || !profile.id) return;

    // Ensure we are only sending valid columns to avoid potential destructive updates.
    // We explicitly omit 'role' and brewery fields to prevent client-side privilege escalation
    // and to avoid wiping those columns if they already exist (which they should via trigger).
    const profileData: any = {};
    if (profile.preferences) profileData.preferences = profile.preferences;
    if (profile.email) profileData.email = profile.email;

    if (Object.keys(profileData).length === 0) return;

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: profile.id, ...profileData });

    if (error) {
      console.error('Detailed error in updateProfile:', error);
      throw error;
    }
  },

  async getSession() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session;
  }
};

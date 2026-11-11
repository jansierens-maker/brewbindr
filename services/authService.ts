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

  /**
   * Sends a password reset mail. The link brings the user back to this site, signed in for
   * a password recovery (the app then asks for a new password). Says nothing about whether
   * the address has an account.
   */
  async requestPasswordReset(email: string) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  },

  /** Whether this is the user's current password (signs in again with it). */
  async verifyPassword(email: string, password: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  },

  /** Sets a new password for the signed-in user. */
  async updatePassword(password: string) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
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
    // Only sent once the user set it, so this also works before the column exists
    if ('display_name' in profile) profileData.display_name = profile.display_name?.trim() || null;

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

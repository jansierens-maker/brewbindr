import { supabase } from './supabaseClient';
import { Brewery, BreweryRole, Invitation } from '../types';

export const breweryService = {
  async getBrewery(id: string): Promise<Brewery | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('breweries')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async createBrewery(name: string): Promise<Brewery | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('breweries')
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateBrewery(id: string, name: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from('breweries')
      .update({ name })
      .eq('id', id);
    if (error) throw error;
  },

  async getMembers(breweryId: string) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, brewery_role')
      .eq('brewery_id', breweryId);
    if (error) return [];

    // We can't join with auth.users easily from client,
    // so we just return the profiles we found.
    // In a real app we might have a public 'users' table with names/emails.
    return data;
  },

  async removeMember(userId: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        brewery_id: null,
        brewery_role: null
      })
      .eq('id', userId);
    if (error) throw error;
  },

  async generateInvitation(breweryId: string, role: BreweryRole): Promise<Invitation | null> {
    if (!supabase) return null;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase
      .from('invitations')
      .insert({
        brewery_id: breweryId,
        role,
        code,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getInvitations(breweryId: string): Promise<Invitation[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('brewery_id', breweryId);
    if (error) return [];
    return data;
  },

  async deleteInvitation(id: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async joinBrewery(code: string, userId: string) {
    if (!supabase) return;

    // 1. Validate invitation
    const { data: invite, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('code', code)
      .single();

    if (inviteError || !invite) throw new Error('Invalid or expired invitation code');

    const now = new Date();
    if (new Date(invite.expires_at) < now) {
      throw new Error('Invitation code has expired');
    }

    // 2. Join brewery (Update profile)
    // Note: This requires the profile update policy to allow setting brewery_id if it's currently null
    // or we might need a RPC function for this if RLS is too strict.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        brewery_id: invite.brewery_id,
        brewery_role: invite.role
      })
      .eq('id', userId);

    if (profileError) throw profileError;

    return invite.brewery_id;
  }
};

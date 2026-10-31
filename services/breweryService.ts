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
      .select('id, email, brewery_role')
      .eq('brewery_id', breweryId);
    if (error) return [];

    // We can't join with auth.users easily from client,
    // so we just return the profiles we found.
    // In a real app we might have a public 'users' table with names/emails.
    return data;
  },

  async removeMember(userId: string) {
    if (!supabase) return;
    // Server-side function checks that the caller is admin of the same brewery
    const { error } = await supabase.rpc('remove_brewery_member', { member_id: userId });
    if (error) throw error;
  },

  async generateInvitation(breweryId: string, role: BreweryRole, email?: string): Promise<Invitation | null> {
    if (!supabase) return null;
    // 8 characters from an unambiguous alphabet (no 0/O, 1/I/L), cryptographically random
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    const { data, error } = await supabase
      .from('invitations')
      .insert({
        brewery_id: breweryId,
        role,
        email,
        code,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async sendInviteEmail(invitationId: string) {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ invitationId }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to send email');
    }
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

  async joinBrewery(code: string, _userId?: string) {
    if (!supabase) return;
    // Server-side function validates the code and updates the caller's own profile
    const { data, error } = await supabase.rpc('join_brewery', { invite_code: code });
    if (error) throw new Error(error.message || 'Invalid or expired invitation code');
    return data as string;
  }
};

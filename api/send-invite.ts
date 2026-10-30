import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const ROLES = ['admin', 'brewmaster', 'brewer', 'taster'];

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase configuration missing in API handler');
    return res.status(500).json({ error: 'Internal configuration error' });
  }

  // Authentication: only signed-in users can send invites
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Query as the calling user, so RLS decides what they may see
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { invitationId } = req.body ?? {};
  if (typeof invitationId !== 'string' || invitationId.length > 64) {
    return res.status(400).json({ error: 'Invalid invitation' });
  }

  // Authorization: RLS only returns invitations to admins of that brewery.
  // Recipient, code and role come from the database, never from the request.
  const { data: invite } = await supabase
    .from('invitations')
    .select('email, code, role, brewery_id, expires_at')
    .eq('id', invitationId)
    .maybeSingle();

  if (!invite || !invite.email || new Date(invite.expires_at) < new Date()) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  const { data: brewery } = await supabase
    .from('breweries')
    .select('name')
    .eq('id', invite.brewery_id)
    .maybeSingle();

  const breweryName = escapeHtml(brewery?.name || 'a brewery');
  const role = ROLES.includes(invite.role) ? invite.role : 'member';
  const code = escapeHtml(invite.code);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://brewbindr.com';

  try {
    const { data, error } = await resend.emails.send({
      from: 'Brewbindr <noreply@sierens.com>',
      to: [invite.email],
      subject: `You're invited to join ${brewery?.name || 'a brewery'} on Brewbindr`.slice(0, 150),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #d97706; text-transform: uppercase;">Brewbindr</h2>
          <p>Hi there!</p>
          <p>You have been invited to join <strong>${breweryName}</strong> as a <strong>${role}</strong>.</p>
          <p>Use the following invite code during signup to join the team:</p>
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <code style="font-size: 32px; font-weight: 900; color: #b45309; letter-spacing: 4px;">${code}</code>
          </div>
          <p>Head over to <a href="${siteUrl}" style="color: #d97706; font-weight: bold;">Brewbindr</a> to get started!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999;">Happy brewing!<br />The Brewbindr Team</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error.message);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ message: 'Email sent successfully', id: data?.id });
  } catch (err: any) {
    console.error('API Error:', err?.message || 'Unknown error occurred');
    return res.status(500).json({ error: 'Failed to send email' });
  }
}

import { Resend } from 'resend';
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

// Basic HTML sanitizer to prevent XSS
const escapeHtml = (unsafe: string) => {
  return (unsafe || "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authentication check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase configuration missing in API handler");
    return res.status(500).json({ error: 'Internal configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { email, code, breweryName, role } = req.body;

  if (!email || !code || !breweryName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const safeBreweryName = escapeHtml(breweryName);
  const safeRole = escapeHtml(role);
  const safeCode = escapeHtml(code);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Brewbindr <noreply@sierens.com>',
      to: [email],
      subject: `You're invited to join ${safeBreweryName} on Brewbindr`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #d97706; text-transform: uppercase;">Brewbindr</h2>
          <p>Hi there!</p>
          <p>You have been invited to join <strong>${safeBreweryName}</strong> as a <strong>${safeRole}</strong>.</p>
          <p>Use the following invite code during signup to join the team:</p>
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <code style="font-size: 32px; font-weight: 900; color: #b45309; letter-spacing: 4px;">${safeCode}</code>
          </div>
          <p>Head over to <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://brewbindr.com'}" style="color: #d97706; font-weight: bold;">Brewbindr</a> to get started!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999;">Happy brewing!<br />The Brewbindr Team</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend API Error:", error.message || "Unknown error");
      return res.status(400).json({ error: 'Failed to send email. Please try again.' });
    }

    return res.status(200).json({ message: 'Email sent successfully', id: data?.id });
  } catch (err: any) {
    console.error("Internal Server Error in send-invite API:", err.message || err);
    return res.status(500).json({ error: 'An internal error occurred. Please try again later.' });
  }
}

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, code, breweryName, role } = req.body;

  if (!email || !code || !breweryName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Brewbindr <onboarding@resend.dev>', // Note: This is the default Resend sandbox sender
      to: [email],
      subject: `You're invited to join ${breweryName} on Brewbindr`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #d97706; text-transform: uppercase;">Brewbindr</h2>
          <p>Hi there!</p>
          <p>You have been invited to join <strong>${breweryName}</strong> as a <strong>${role}</strong>.</p>
          <p>Use the following invite code during signup to join the team:</p>
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <code style="font-size: 32px; font-weight: 900; color: #b45309; letter-spacing: 4px;">${code}</code>
          </div>
          <p>Head over to <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://brewbindr.com'}" style="color: #d97706; font-weight: bold;">Brewbindr</a> to get started!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999;">Happy brewing!<br />The Brewbindr Team</p>
        </div>
      `,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Email sent successfully', id: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

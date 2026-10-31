import { createClient } from '@supabase/supabase-js';

// Shared by the AI endpoints. Files under api/_lib are not exposed as routes.

export const AI_LIMIT_CODE = 'AI_DAILY_LIMIT';

/**
 * Counts one AI request for the signed-in user and reports whether it is allowed.
 * Sends a 429 (daily limit) or 503 (check failed) response itself and returns
 * false; returns true when the caller may go ahead.
 * Fails closed: if the check itself fails, no AI request is made.
 */
export async function consumeAiQuota(res: any, token: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Call as the user so auth.uid() identifies them in the database
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.rpc('consume_ai_quota');
  if (error || !data) {
    console.error('AI quota check failed:', error?.message || 'No result');
    res.status(503).json({ error: 'AI service is currently unavailable.' });
    return false;
  }

  if (!data.allowed) {
    res.status(429).json({
      error: `Daily AI limit reached (${data.limit} requests per day). Try again tomorrow.`,
      code: AI_LIMIT_CODE,
      limit: data.limit,
    });
    return false;
  }

  return true;
}

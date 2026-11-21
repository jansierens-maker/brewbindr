import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { consumeAiQuota } from './_lib/aiQuota.js';
import { buildPrompt, parseResult, validateInput } from './_lib/translate.js';

/**
 * Translation proposals for public library items (#212), for the app admin only.
 * At most 50 items per request; the admin reviews and edits every proposal before saving.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase configuration missing in API handler");
    return res.status(500).json({ error: 'Internal configuration error' });
  }

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  // As the user, so is_admin() checks their own profile
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });
  const { data: admin, error: adminError } = await client.rpc('is_admin');
  if (adminError) {
    console.error('Admin check failed:', adminError.message);
    return res.status(503).json({ error: 'Service is currently unavailable.' });
  }
  if (!admin) return res.status(403).json({ error: 'Only the app admin can translate the public library' });

  const input = validateInput(req.body);
  if ('error' in input) return res.status(400).json({ error: input.error });

  if (!(await consumeAiQuota(res, token))) return;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured");
      return res.status(500).json({ error: 'AI service is currently unavailable.' });
    }
    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: 'user', parts: [{ text: buildPrompt(input.items) }] }],
      config: { responseMimeType: 'application/json' },
    });
    res.status(200).json({ items: parseResult(response.text || '', input.items) });
  } catch (error: any) {
    console.error("API Error:", error.message || "Unknown error occurred");
    let clientMessage = 'An error occurred while translating. Please try again later.';
    try { const parsed = JSON.parse(error.message); if (parsed?.error?.message) clientMessage = parsed.error.message; } catch {}
    res.status(500).json({ error: clientMessage });
  }
}

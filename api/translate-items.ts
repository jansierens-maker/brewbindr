import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { consumeAiQuota } from './_lib/aiQuota.js';
import { ATTEMPT_TIMEOUT_MS, buildPrompt, callWithRetry, clientMessage, parseWithReport, validateInput } from './_lib/translate.js';

/**
 * Translation proposals for public library items (#212), for the app admin only.
 * Retries an overloaded model, then a lighter one; each attempt has a time limit.
 * With `debug: true` the answer also carries what happened: attempts, timings, tokens,
 * the prompt and Gemini's raw answer (the admin's own request, public library data only).
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
  const debug = req.body?.debug === true;

  // One request counts once, whatever the retries below (#218)
  if (!(await consumeAiQuota(res, token))) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured");
    return res.status(500).json({ error: 'AI service is currently unavailable.' });
  }

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  const prompt = buildPrompt(input.items);
  const started = Date.now();
  const result = await callWithRetry(async model => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', abortSignal: controller.signal, httpOptions: { timeout: ATTEMPT_TIMEOUT_MS } },
      });
      const u = response.usageMetadata;
      return {
        text: response.text || '',
        finishReason: response.candidates?.[0]?.finishReason,
        usage: { prompt: u?.promptTokenCount, output: u?.candidatesTokenCount, thoughts: u?.thoughtsTokenCount, total: u?.totalTokenCount },
      };
    } catch (e: any) {
      throw new Error(controller.signal.aborted ? `Timed out after ${ATTEMPT_TIMEOUT_MS / 1000} s` : (e?.message || 'Unknown error'));
    } finally {
      clearTimeout(timer);
    }
  });

  const report = result.answer ? parseWithReport(result.answer.text || '', input.items, result.answer.finishReason) : undefined;
  // Counts only, no content, in the server log
  console.log('translate-items', JSON.stringify({
    items: input.items.length, attempts: result.attempts.map(a => `${a.model}:${a.ok ? 'ok' : 'fail'}:${a.durationMs}ms`),
    finishReason: result.answer?.finishReason, parsed: report?.items.length, missing: report?.missingIds.length, ms: Date.now() - started,
  }));

  const debugInfo = debug ? {
    attempts: result.attempts,
    model: result.model,
    durationMs: Date.now() - started,
    finishReason: result.answer?.finishReason,
    usage: result.answer?.usage,
    prompt,
    raw: result.answer?.text,
    missingIds: report?.missingIds,
    truncated: report?.truncated,
    jsonError: report?.jsonError,
  } : undefined;

  if (!result.answer || !report) {
    console.error('API Error:', result.error || 'Unknown error occurred');
    return res.status(502).json({ error: clientMessage(result.error || ''), ...(debugInfo ? { debug: debugInfo } : {}) });
  }
  const warning = report.truncated ? 'Gemini cut its answer off: translate fewer items at once.'
    : report.jsonError ? 'Gemini did not answer with valid JSON.'
    : report.missingIds.length ? `${report.missingIds.length} item(s) without a proposal.` : undefined;
  res.status(200).json({ items: report.items, model: result.model, ...(warning ? { warning } : {}), ...(debugInfo ? { debug: debugInfo } : {}) });
}

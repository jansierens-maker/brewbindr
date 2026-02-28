
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
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

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { recipe, notes } = req.body;

  if (!recipe || !notes) {
    return res.status(400).json({ error: 'Recipe and notes are required' });
  }

  // Input validation: Limit length of inputs to prevent resource exhaustion
  if (typeof notes !== 'string' || notes.length > 2000) {
    return res.status(400).json({ error: 'Invalid notes: Notes must be a string and less than 2000 characters.' });
  }
  const recipeStr = JSON.stringify(recipe);
  if (recipeStr.length > 10000) {
    return res.status(400).json({ error: 'Invalid recipe: Recipe data is too large.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured");
      return res.status(500).json({ error: 'AI service is currently unavailable.' });
    }

    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        parts: [{
          text: `As a Master Cicerone, analyze this recipe and the following tasting notes:

      Recipe: ${JSON.stringify(recipe)}
      Tasting Notes: ${notes}

      Provide feedback on stylistic accuracy, possible brewing improvements, and suggestions for future iterations.`
        }]
      }],
    });
    res.status(200).json({ text: response.text || "" });
  } catch (error: any) {
    // Log detailed error for debugging, but return generic message to client
    console.error("API Error:", error);
    res.status(500).json({ error: 'An error occurred during tasting analysis. Please try again later.' });
  }
}


import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { recipe, notes } = req.body;

  // Security: Input validation
  if (!recipe || !notes) {
    return res.status(400).json({ error: 'Recipe and notes are required' });
  }

  if (notes.length > 2000) {
    return res.status(400).json({ error: 'Notes too long (max 2000 characters)' });
  }

  const recipeStr = JSON.stringify(recipe);
  if (recipeStr.length > 10000) {
    return res.status(400).json({ error: 'Recipe too large' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As a Master Cicerone, analyze this recipe and the following tasting notes:

      Recipe: ${recipeStr}
      Tasting Notes: ${notes}

      Provide feedback on stylistic accuracy, possible brewing improvements, and suggestions for future iterations.`,
    });
    res.status(200).json({ text: response.text || "" });
  } catch (error: any) {
    // Security: Log error details server-side but return a generic message to client
    console.error("API Error:", error);
    res.status(500).json({ error: 'Failed to analyze tasting' });
  }
}

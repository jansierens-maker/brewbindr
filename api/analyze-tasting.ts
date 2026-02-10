
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { recipe, notes } = req.body;

  if (!recipe || !notes || typeof notes !== 'string') {
    return res.status(400).json({ error: 'Recipe and notes (string) are required' });
  }

  if (notes.length > 2000) {
    return res.status(400).json({ error: 'Notes are too long (max 2000 characters)' });
  }

  if (JSON.stringify(recipe).length > 10000) {
    return res.status(400).json({ error: 'Recipe data is too large' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As a Master Cicerone, analyze this recipe and the following tasting notes:

      Recipe: ${JSON.stringify(recipe)}
      Tasting Notes: ${notes}

      Provide feedback on stylistic accuracy, possible brewing improvements, and suggestions for future iterations.`,
    });
    res.status(200).json({ text: response.text || "" });
  } catch (error: any) {
    console.error("API Error:", error);
    // Secure error response - don't leak internal error details
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

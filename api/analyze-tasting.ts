
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { recipe, notes } = req.body;

  if (!recipe || !notes) {
    return res.status(400).json({ error: 'Recipe and notes are required' });
  }

  if (typeof notes !== 'string' || notes.length > 2000) {
    return res.status(400).json({ error: 'Invalid tasting notes' });
  }

  const recipeStr = JSON.stringify(recipe);
  // Security: Limit recipe data size to prevent resource exhaustion
  if (recipeStr.length > 10000) {
    return res.status(400).json({ error: 'Recipe data too large' });
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
    // Security: Log detailed error on the server but return a generic message to the client
    console.error("API Error:", error);
    res.status(500).json({ error: 'An error occurred while analyzing the tasting notes. Please try again later.' });
  }
}

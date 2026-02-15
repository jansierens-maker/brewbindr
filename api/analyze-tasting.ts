
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { recipe, notes } = req.body;

  // Security: Input validation and length limits to prevent DoS/abuse
  if (!recipe || !notes || typeof notes !== 'string' || notes.trim().length === 0) {
    return res.status(400).json({ error: 'Recipe and notes are required' });
  }
  if (notes.length > 2000 || JSON.stringify(recipe).length > 10000) {
    return res.status(400).json({ error: 'Input too long' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing in environment variables");
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As a Master Cicerone, analyze this recipe and the following tasting notes:

      Recipe: ${JSON.stringify(recipe)}
      Tasting Notes: ${notes}

      Provide feedback on stylistic accuracy, possible brewing improvements, and suggestions for future iterations.`,
    });
    res.status(200).json({ text: response.text || "" });
  } catch (error: any) {
    // Security: Log detailed error on server, but return generic message to client to avoid info leakage
    console.error("API Error:", error);
    res.status(500).json({ error: 'An error occurred while analyzing tasting notes' });
  }
}

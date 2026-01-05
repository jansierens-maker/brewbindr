
import { GoogleGenAI, Type } from "@google/genai";
import { Recipe } from "../types";

export class GeminiService {
  // Instance-level GoogleGenAI is removed to follow best practices of instantiating right before use.

  async generateRecipe(prompt: string): Promise<Recipe> {
    // Initializing right before API call ensures we use the correct environment API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Generate a detailed beer recipe in BeerJSON structure based on the following request: ${prompt}. 
      
      CRITICAL INSTRUCTIONS:
      1. Use EXACTLY these unit strings: 'kilograms' for fermentables, 'grams' for hops, 'liters' for batch size, 'minutes' for boil time and hop additions.
      2. For fermentables, include 'yield' with 'potential' value (e.g., 1.037).
      3. For cultures, include 'attenuation' percentage (e.g., 75).
      4. Ensure all ingredients have names that describe them well (e.g. 'Pilsner Malt', 'Citra Hops').
      5. Include a brief description of the beer style and any specific brewing tips in the 'notes' field.
      6. The output must be strictly valid JSON matching the provided schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["extract", "partial_mash", "all_grain"] },
            author: { type: Type.STRING },
            notes: { type: Type.STRING },
            batch_size: {
              type: Type.OBJECT,
              properties: {
                unit: { type: Type.STRING },
                value: { type: Type.NUMBER }
              },
              required: ["unit", "value"]
            },
            style: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING }
              }
            },
            ingredients: {
              type: Type.OBJECT,
              properties: {
                fermentables: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      type: { type: Type.STRING },
                      amount: {
                        type: Type.OBJECT,
                        properties: { unit: { type: Type.STRING }, value: { type: Type.NUMBER } }
                      },
                      yield: {
                        type: Type.OBJECT,
                        properties: {
                          potential: {
                            type: Type.OBJECT,
                            properties: { value: { type: Type.NUMBER } }
                          }
                        }
                      },
                      color: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } }
                    }
                  }
                },
                hops: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      use: { type: Type.STRING, enum: ["boil", "dry_hop", "mash", "first_wort", "whirlpool"] },
                      amount: {
                        type: Type.OBJECT,
                        properties: { unit: { type: Type.STRING }, value: { type: Type.NUMBER } }
                      },
                      alpha_acid: {
                        type: Type.OBJECT,
                        properties: { value: { type: Type.NUMBER } }
                      },
                      time: {
                        type: Type.OBJECT,
                        properties: { unit: { type: Type.STRING }, value: { type: Type.NUMBER } }
                      }
                    }
                  }
                },
                cultures: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      type: { type: Type.STRING, enum: ["ale", "lager", "wheat", "wine", "champagne"] },
                      form: { type: Type.STRING, enum: ["liquid", "dry"] },
                      attenuation: { type: Type.NUMBER }
                    }
                  }
                }
              }
            },
            efficiency: {
              type: Type.OBJECT,
              properties: { brewhouse: { type: Type.NUMBER } }
            },
            boil_time: {
              type: Type.OBJECT,
              properties: { unit: { type: Type.STRING }, value: { type: Type.NUMBER } }
            },
            specifications: {
              type: Type.OBJECT,
              properties: {
                og: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } },
                fg: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } },
                abv: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } },
                ibu: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } },
                color: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER } } }
              }
            }
          },
          required: ["name", "type", "author", "batch_size", "ingredients", "efficiency", "boil_time"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  }

  async analyzeTasting(recipe: Recipe, notes: string): Promise<string> {
    // Initializing right before API call ensures we use the correct environment API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As a Master Cicerone, analyze this recipe and the following tasting notes:
      
      Recipe: ${JSON.stringify(recipe)}
      Tasting Notes: ${notes}
      
      Provide feedback on stylistic accuracy, possible brewing improvements, and suggestions for future iterations.`,
    });
    return response.text || "";
  }
}

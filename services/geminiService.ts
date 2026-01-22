
import { Recipe } from "../types";

export class GeminiService {
  private getCacheKey(input: any): string {
    const str = JSON.stringify(input);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  private getCache(key: string): any | null {
    try {
      const cached = localStorage.getItem(`gemini_cache_${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  }

  private setCache(key: string, value: any): void {
    try {
      localStorage.setItem(`gemini_cache_${key}`, JSON.stringify(value));
    } catch (e) {
      // Silently fail if localStorage is full
    }
  }

  async generateRecipe(prompt: string): Promise<Recipe> {
    const cacheKey = `recipe_${this.getCacheKey(prompt)}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const response = await fetch('/api/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to generate recipe');
    }

    const data = await response.json();
    this.setCache(cacheKey, data);
    return data;
  }

  async analyzeTasting(recipe: Recipe, notes: string): Promise<string> {
    const cacheKey = `tasting_${this.getCacheKey({ recipeId: recipe.id, name: recipe.name, notes })}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const response = await fetch('/api/analyze-tasting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe, notes })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to analyze tasting');
    }

    const data = await response.json();
    const resultText = data.text || "";
    this.setCache(cacheKey, resultText);
    return resultText;
  }
}

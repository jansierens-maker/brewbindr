import { supabase } from './supabaseClient';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from '../types';

/**
 * Supabase Service for Brewbindr
 *
 * Expected Database Schema:
 *
 * Table: recipes
 * - id: text (primary key)
 * - data: jsonb
 *
 * Table: brew_logs
 * - id: text (primary key)
 * - data: jsonb
 *
 * Table: tasting_notes
 * - id: text (primary key)
 * - data: jsonb
 *
 * Table: library_ingredients
 * - id: text (primary key)
 * - data: jsonb
 */

export const supabaseService = {
  async checkTableHealth() {
    const client = supabase;
    if (!client) return { recipes: false, brew_logs: false, tasting_notes: false, library_ingredients: false };

    const tables = ['recipes', 'brew_logs', 'tasting_notes', 'library_ingredients'];
    const results: Record<string, boolean> = {};

    await Promise.all(tables.map(async (table) => {
      const { error } = await client.from(table).select('id').limit(1);
      // If error is 42P01, the table does not exist
      results[table] = !error || error.code !== '42P01';
    }));

    return results as { recipes: boolean, brew_logs: boolean, tasting_notes: boolean, library_ingredients: boolean };
  },

  async fetchAppData() {
    const client = supabase;
    if (!client) return null;
    try {
      const [recipesRes, logsRes, notesRes, libRes] = await Promise.all([
        client.from('recipes').select('data'),
        client.from('brew_logs').select('data'),
        client.from('tasting_notes').select('data'),
        client.from('library_ingredients').select('data')
      ]);

      // Check for errors (Supabase returns error object if table missing or access denied)
      if (recipesRes.error || logsRes.error || notesRes.error || libRes.error) {
        console.warn('Supabase fetch partial error. Some tables might be missing.');
      }

      return {
        recipes: (recipesRes.data?.map(r => r.data) as Recipe[]) || [],
        brewLogs: (logsRes.data?.map(l => l.data) as BrewLogEntry[]) || [],
        tastingNotes: (notesRes.data?.map(n => n.data) as TastingNote[]) || [],
        library: (libRes.data?.map(i => i.data) as LibraryIngredient[]) || []
      };
    } catch (err) {
      console.error('Critical error fetching from Supabase:', err);
      return null;
    }
  },

  async saveRecipe(recipe: Recipe) {
    const client = supabase;
    if (!client || !recipe.id) return;
    return client.from('recipes').upsert({ id: recipe.id, data: recipe });
  },

  async deleteRecipe(id: string) {
    const client = supabase;
    if (!client) return;
    return client.from('recipes').delete().eq('id', id);
  },

  async saveBrewLog(log: BrewLogEntry) {
    const client = supabase;
    if (!client) return;
    return client.from('brew_logs').upsert({ id: log.id, data: log });
  },

  async saveTastingNote(note: TastingNote) {
    const client = supabase;
    if (!client) return;
    return client.from('tasting_notes').upsert({ id: note.id, data: note });
  },

  async saveLibraryIngredient(item: LibraryIngredient) {
    const client = supabase;
    if (!client) return;
    return client.from('library_ingredients').upsert({ id: item.id, data: item });
  },

  async deleteLibraryIngredient(id: string) {
    const client = supabase;
    if (!client) return;
    return client.from('library_ingredients').delete().eq('id', id);
  },

  async syncAll(data: { recipes: Recipe[], brewLogs: BrewLogEntry[], tastingNotes: TastingNote[], library: LibraryIngredient[] }) {
    const client = supabase;
    if (!client) return;
    const { recipes, brewLogs, tastingNotes, library } = data;

    // Use bulk upserts for better performance and to respect rate limits
    const tasks = [];

    if (recipes.length > 0) {
      tasks.push(client.from('recipes').upsert(recipes.map(r => ({ id: r.id, data: r }))));
    }
    if (brewLogs.length > 0) {
      tasks.push(client.from('brew_logs').upsert(brewLogs.map(l => ({ id: l.id, data: l }))));
    }
    if (tastingNotes.length > 0) {
      tasks.push(client.from('tasting_notes').upsert(tastingNotes.map(n => ({ id: n.id, data: n }))));
    }
    if (library.length > 0) {
      tasks.push(client.from('library_ingredients').upsert(library.map(i => ({ id: i.id, data: i }))));
    }

    try {
      await Promise.all(tasks);
    } catch (err) {
      console.error('Error during bulk sync to Supabase:', err);
    }
  }
};

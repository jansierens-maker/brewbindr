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
  async fetchAppData() {
    if (!supabase) return null;
    try {
      const [recipesRes, logsRes, notesRes, libRes] = await Promise.all([
        supabase.from('recipes').select('data'),
        supabase.from('brew_logs').select('data'),
        supabase.from('tasting_notes').select('data'),
        supabase.from('library_ingredients').select('data')
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
    if (!supabase || !recipe.id) return;
    return supabase.from('recipes').upsert({ id: recipe.id, data: recipe });
  },

  async deleteRecipe(id: string) {
    if (!supabase) return;
    return supabase.from('recipes').delete().eq('id', id);
  },

  async saveBrewLog(log: BrewLogEntry) {
    if (!supabase) return;
    return supabase.from('brew_logs').upsert({ id: log.id, data: log });
  },

  async saveTastingNote(note: TastingNote) {
    if (!supabase) return;
    return supabase.from('tasting_notes').upsert({ id: note.id, data: note });
  },

  async saveLibraryIngredient(item: LibraryIngredient) {
    if (!supabase) return;
    return supabase.from('library_ingredients').upsert({ id: item.id, data: item });
  },

  async deleteLibraryIngredient(id: string) {
    if (!supabase) return;
    return supabase.from('library_ingredients').delete().eq('id', id);
  },

  async syncAll(data: { recipes: Recipe[], brewLogs: BrewLogEntry[], tastingNotes: TastingNote[], library: LibraryIngredient[] }) {
    if (!supabase) return;
    const { recipes, brewLogs, tastingNotes, library } = data;

    // Use bulk upserts for better performance and to respect rate limits
    const tasks = [];

    if (recipes.length > 0) {
      tasks.push(supabase.from('recipes').upsert(recipes.map(r => ({ id: r.id, data: r }))));
    }
    if (brewLogs.length > 0) {
      tasks.push(supabase.from('brew_logs').upsert(brewLogs.map(l => ({ id: l.id, data: l }))));
    }
    if (tastingNotes.length > 0) {
      tasks.push(supabase.from('tasting_notes').upsert(tastingNotes.map(n => ({ id: n.id, data: n }))));
    }
    if (library.length > 0) {
      tasks.push(supabase.from('library_ingredients').upsert(library.map(i => ({ id: i.id, data: i }))));
    }

    try {
      await Promise.all(tasks);
    } catch (err) {
      console.error('Error during bulk sync to Supabase:', err);
    }
  }
};

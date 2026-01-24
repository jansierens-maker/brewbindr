import { supabase } from './supabaseClient';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from '../types';

/**
 * Supabase Service for Brewbindr
 *
 * Expected Database Schema:
 * Tables are created via the Sync Details modal SQL schema instructions.
 */

const TABLE_MAP: Record<string, string> = {
  'fermentable': 'fermentables',
  'hop': 'hops',
  'culture': 'cultures',
  'style': 'styles',
  'misc': 'miscs',
  'mash_profile': 'mash_profiles',
  'equipment': 'equipment',
  'water': 'waters'
};

export const supabaseService = {
  async checkTableHealth() {
    const client = supabase;
    const tables = ['recipes', 'brew_logs', 'tasting_notes', ...Object.values(TABLE_MAP)];
    if (!client) {
      return tables.reduce((acc, table) => ({ ...acc, [table]: false }), {}) as Record<string, boolean>;
    }

    const results: Record<string, boolean> = {};

    await Promise.all(tables.map(async (table) => {
      const { error } = await client.from(table).select('id').limit(1);
      results[table] = !error;
    }));

    return results;
  },

  async fetchAppData() {
    const client = supabase;
    if (!client) return null;
    try {
      const tableList = ['recipes', 'brew_logs', 'tasting_notes', ...Object.values(TABLE_MAP)];
      const requests = tableList.map(t => client.from(t).select('data'));

      const responses = await Promise.all(requests);
      const data: any = {};

      tableList.forEach((table, idx) => {
        data[table] = responses[idx].data?.map(r => r.data) || [];
      });

      // Merge library tables back into a single array
      const library: LibraryIngredient[] = [];
      Object.entries(TABLE_MAP).forEach(([type, table]) => {
        if (data[table]) {
          library.push(...data[table]);
        }
      });

      return {
        recipes: data['recipes'] as Recipe[],
        brewLogs: data['brew_logs'] as BrewLogEntry[],
        tastingNotes: data['tasting_notes'] as TastingNote[],
        library
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

  async saveLibraryIngredient(item: LibraryIngredient) {
    const client = supabase;
    const table = TABLE_MAP[item.type];
    if (!client || !table) return;
    return client.from(table).upsert({ id: item.id, data: item });
  },

  async deleteLibraryIngredient(id: string, type: string) {
    const client = supabase;
    const table = TABLE_MAP[type];
    if (!client || !table) return;
    return client.from(table).delete().eq('id', id);
  },

  async syncAll(data: { recipes: Recipe[], brewLogs: BrewLogEntry[], tastingNotes: TastingNote[], library: LibraryIngredient[] }) {
    const client = supabase;
    if (!client) return;
    const { recipes, brewLogs, tastingNotes, library } = data;

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

    // Split library by type for granular storage
    const libraryByType: Record<string, LibraryIngredient[]> = {};
    library.forEach(item => {
      const table = TABLE_MAP[item.type];
      if (table) {
        if (!libraryByType[table]) libraryByType[table] = [];
        libraryByType[table].push(item);
      }
    });

    Object.entries(libraryByType).forEach(([table, items]) => {
      tasks.push(client.from(table).upsert(items.map(i => ({ id: i.id, data: i }))));
    });

    try {
      await Promise.all(tasks);
    } catch (err) {
      console.error('Error during bulk sync to Supabase:', err);
    }
  }
};

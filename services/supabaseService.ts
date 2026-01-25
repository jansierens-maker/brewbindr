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
    const tables = ['profiles', 'recipes', 'brew_logs', 'tasting_notes', ...Object.values(TABLE_MAP)];
    if (!client) {
      return tables.reduce((acc, table) => ({ ...acc, [table]: false }), {}) as Record<string, boolean>;
    }

    const results: Record<string, boolean | 'timeout' | 'error'> = {};

    await Promise.all(tables.map(async (table) => {
      try {
        const query = client.from(table).select('id').limit(1);
        const { error } = await Promise.race([
          query,
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]);

        if (error) {
          // 42P01 = Table not found
          results[table] = error.code === '42P01' ? false : 'error';
        } else {
          results[table] = true;
        }
      } catch (err: any) {
        results[table] = err.message === 'timeout' ? 'timeout' : 'error';
      }
    }));

    return results;
  },

  async checkRLSHealth(userId: string) {
    const client = supabase;
    if (!client || !userId) return { enabled: false, reason: 'No client/user' };

    try {
      // Test 1: Check if we can see our own profile
      const { data: profile, error: pError } = await client.from('profiles').select('id').eq('id', userId).single();

      if (pError) {
        if (pError.code === 'PGRST116') return { enabled: false, reason: 'Profile row missing in DB' };
        return { enabled: false, reason: `Unreachable: ${pError.code} - ${pError.message}` };
      }

      if (!profile) return { enabled: false, reason: 'Profile not found' };

      // Test 2: Try to see if we can update our profile
      // This is a "dry run" or we just assume if select works and upsert doesn't hang it might be okay

      return { enabled: true };
    } catch (err) {
      return { enabled: false, reason: 'Check failed' };
    }
  },

  async fetchAppData(userId?: string) {
    const client = supabase;
    if (!client) return null;
    try {
      const tableList = ['recipes', 'brew_logs', 'tasting_notes', ...Object.values(TABLE_MAP)];

      const requests = tableList.map(t => {
        let query = client.from(t).select('data, user_id, status');

        // For items that can be public, fetch owned OR approved
        if (['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'].includes(t)) {
          if (userId) {
            query = query.or(`user_id.eq.${userId},status.eq.approved`);
          } else {
            query = query.eq('status', 'approved');
          }
        } else if (userId) {
          // For private items (brew logs, etc.), only fetch owned
          query = query.eq('user_id', userId);
        } else {
          // If no user and no public status, return empty
          return Promise.resolve({ data: [] });
        }

        return query;
      });

      const responses = await Promise.all(requests);
      const data: any = {};

      tableList.forEach((table, idx) => {
        data[table] = responses[idx].data?.map((r: any) => ({
          ...r.data,
          user_id: r.user_id,
          status: r.status
        })) || [];
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

  async saveRecipe(recipe: Recipe, userId?: string) {
    const client = supabase;
    if (!client || !recipe.id) return;
    return client.from('recipes').upsert({
      id: recipe.id,
      data: recipe,
      user_id: userId || recipe.user_id,
      status: recipe.status || 'private'
    });
  },

  async deleteRecipe(id: string) {
    const client = supabase;
    if (!client) return;
    return client.from('recipes').delete().eq('id', id);
  },

  async saveLibraryIngredient(item: LibraryIngredient, userId?: string) {
    const client = supabase;
    const table = TABLE_MAP[item.type];
    if (!client || !table) return;
    return client.from(table).upsert({
      id: item.id,
      data: item,
      user_id: userId || item.user_id,
      status: item.status || 'private'
    });
  },

  async deleteLibraryIngredient(id: string, type: string) {
    const client = supabase;
    const table = TABLE_MAP[type];
    if (!client || !table) return;
    return client.from(table).delete().eq('id', id);
  },

  async syncAll(data: { recipes: Recipe[], brewLogs: BrewLogEntry[], tastingNotes: TastingNote[], library: LibraryIngredient[] }, userId?: string) {
    const client = supabase;
    if (!client) return;
    const { recipes, brewLogs, tastingNotes, library } = data;

    // Only sync items owned by the current user OR items without a user_id (migration)
    const filterOwned = (item: any) => !item.user_id || item.user_id === userId;

    const tasks = [];

    const ownedRecipes = recipes.filter(filterOwned);
    if (ownedRecipes.length > 0) {
      tasks.push(client.from('recipes').upsert(ownedRecipes.map(r => ({
        id: r.id,
        data: r,
        user_id: userId || r.user_id,
        status: r.status || 'private'
      }))));
    }

    const ownedLogs = brewLogs.filter(filterOwned);
    if (ownedLogs.length > 0) {
      tasks.push(client.from('brew_logs').upsert(ownedLogs.map(l => ({
        id: l.id,
        data: l,
        user_id: userId || l.user_id
      }))));
    }

    const ownedNotes = tastingNotes.filter(filterOwned);
    if (ownedNotes.length > 0) {
      tasks.push(client.from('tasting_notes').upsert(ownedNotes.map(n => ({
        id: n.id,
        data: n,
        user_id: userId || n.user_id
      }))));
    }

    // Split library by type for granular storage
    const libraryByType: Record<string, LibraryIngredient[]> = {};
    library.filter(filterOwned).forEach(item => {
      const table = TABLE_MAP[item.type];
      if (table) {
        if (!libraryByType[table]) libraryByType[table] = [];
        libraryByType[table].push(item);
      }
    });

    Object.entries(libraryByType).forEach(([table, items]) => {
      tasks.push(client.from(table).upsert(items.map(i => ({
        id: i.id,
        data: i,
        user_id: userId || i.user_id,
        status: i.status || 'private'
      }))));
    });

    try {
      await Promise.all(tasks);
    } catch (err) {
      console.error('Error during bulk sync to Supabase:', err);
    }
  },

  async fetchPendingSubmissions() {
    const client = supabase;
    if (!client) return [];
    const tables = ['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];

    try {
      const requests = tables.map(t => client.from(t).select('data, user_id, status').eq('status', 'submitted'));
      const responses = await Promise.all(requests);

      const pending: any[] = [];
      responses.forEach((res, idx) => {
        if (res.data) {
          pending.push(...res.data.map(r => ({
            ...r.data,
            user_id: r.user_id,
            status: r.status,
            _table: tables[idx]
          })));
        }
      });
      return pending;
    } catch (err) {
      console.error('Error fetching pending submissions:', err);
      return [];
    }
  },

  async updateItemStatus(id: string, type: string, status: 'private' | 'approved', tableOverride?: string) {
    const client = supabase;
    const table = tableOverride || TABLE_MAP[type] || type;
    if (!client || !table) return;

    // Fetch current data to update the status inside the jsonb too
    const { data: item } = await client.from(table).select('data').eq('id', id).single();
    if (item) {
      const newData = { ...item.data, status };
      return client.from(table).update({
        status: status,
        data: newData
      }).eq('id', id);
    }
  }
};

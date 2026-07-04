import { supabase } from './supabaseClient';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Supabase Service for Brewbindr
 *
 * Expected Database Schema:
 * Tables are created via the Connection Details modal SQL schema instructions.
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
        // Try to fetch one row.
        // This checks if the table exists AND if we have at least READ permission.
        const query = client.from(table).select('*').limit(1);
        const { data, error } = await Promise.race([
          query,
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]);

        if (error) {
          if (error.code === '42P01') {
            results[table] = false; // Table not found
          } else if (error.message.includes('apikey')) {
             results[table] = 'error'; // Likely missing API key
          } else {
            // Might be RLS blocking even the count, or other DB error
            results[table] = 'error';
          }
        } else {
          // If we got data (even empty array), the table exists and is reachable
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
      // If RLS is broken or recursive, this will fail or hang.
      const query = client.from('profiles').select('id').eq('id', userId).single();
      const { data: profile, error: pError } = await Promise.race([
        query,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);

      if (pError) {
        if (pError.code === 'PGRST116') return { enabled: false, reason: 'Profile row missing' };
        if (pError.message?.includes('apikey')) return { enabled: false, reason: 'API Key Rejected' };
        return { enabled: false, reason: `Error ${pError.code}: ${pError.message}` };
      }

      if (!profile) return { enabled: false, reason: 'Profile not returned' };

      // Test 2: Check if we can at least reach the recipes table (even if empty)
      const { error: rError } = await client.from('recipes').select('id', { count: 'exact', head: true }).limit(1);
      if (rError && !rError.message.includes('PGRST116')) {
         // If we get a permission error here, RLS might be blocking everything
         if (rError.code === '42501') return { enabled: false, reason: 'RLS Permission Denied' };
      }

      return { enabled: true };
    } catch (err: any) {
      return { enabled: false, reason: err.message === 'timeout' ? 'Check timed out (possible RLS recursion)' : 'Check failed' };
    }
  },

  async fetchAppData(userId?: string, breweryId?: string) {
    const client = supabase;
    if (!client) return null;
    try {
      const tableList = ['recipes', 'brew_logs', 'tasting_notes', ...Object.values(TABLE_MAP)];
      // Tables that have a `status` column
      const STATUS_TABLES = ['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];

      const requests = tableList.map(t => {
        const hasStatus = STATUS_TABLES.includes(t);
        const selectFields = hasStatus
          ? 'id, data, user_id, brewery_id, status'
          : 'id, data, user_id, brewery_id';

        let query = client.from(t).select(selectFields);

        // For items that can be public, fetch owned/brewery OR approved
        if (hasStatus) {
          if (breweryId && userId) {
            query = query.or(`brewery_id.eq.${breweryId},user_id.eq.${userId},status.eq.approved`);
          } else if (breweryId) {
            query = query.or(`brewery_id.eq.${breweryId},status.eq.approved`);
          } else if (userId) {
            query = query.or(`user_id.eq.${userId},status.eq.approved`);
          } else {
            query = query.eq('status', 'approved');
          }
        } else if (breweryId && userId) {
          query = query.or(`brewery_id.eq.${breweryId},user_id.eq.${userId}`);
        } else if (breweryId) {
           query = query.eq('brewery_id', breweryId);
        } else if (userId) {
          // For private items (brew logs, etc.), only fetch owned
          query = query.eq('user_id', userId);
        } else {
          // If no user and no public status, return empty
          return Promise.resolve({ data: [] });
        }

        return query;
      });

      const responses = await Promise.race([
        Promise.all(requests),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);
      const data: any = {};

      tableList.forEach((table, idx) => {
        data[table] = responses[idx].data?.map((r: any) => {
          const merged = { ...r.data };
          if (r.id) merged.id = r.id;
          if (r.user_id) merged.user_id = r.user_id;
          if (r.brewery_id) merged.brewery_id = r.brewery_id;
          if (r.status) merged.status = r.status;
          return merged;
        }) || [];
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

  async saveRecipe(recipe: Recipe, userId?: string, breweryId?: string) {
    const client = supabase;
    if (!client || !recipe.id) return;
    return client.from('recipes').upsert({
      id: recipe.id,
      data: recipe,
      user_id: userId || recipe.user_id,
      brewery_id: breweryId || recipe.brewery_id,
      status: recipe.status || 'private'
    });
  },

  async deleteRecipe(id: string) {
    const client = supabase;
    if (!client) return;
    return client.from('recipes').delete().eq('id', id);
  },

  async saveBrewLog(log: BrewLogEntry, userId?: string, breweryId?: string) {
    const client = supabase;
    if (!client || !log.id) return;
    return client.from('brew_logs').upsert({
      id: log.id,
      data: log,
      user_id: userId || log.user_id,
      brewery_id: breweryId || log.brewery_id
    });
  },

  async deleteBrewLog(id: string) {
    const client = supabase;
    if (!client) return;
    return client.from('brew_logs').delete().eq('id', id);
  },

  async saveTastingNote(note: TastingNote, userId?: string, breweryId?: string) {
    const client = supabase;
    if (!client || !note.id) return;
    return client.from('tasting_notes').upsert({
      id: note.id,
      data: note,
      user_id: userId || note.user_id,
      brewery_id: breweryId || note.brewery_id
    });
  },

  async deleteTastingNote(id: string) {
    const client = supabase;
    if (!client) return;
    return client.from('tasting_notes').delete().eq('id', id);
  },

  async saveLibraryIngredient(item: LibraryIngredient, userId?: string, breweryId?: string) {
    const client = supabase;
    const table = TABLE_MAP[item.type];
    if (!client || !table) return;

    const STATUS_TABLES = ['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];
    const hasStatus = STATUS_TABLES.includes(item.type === 'mash_profile' ? 'mash_profiles' : table);

    const payload: any = {
      id: item.id || uuidv4(),
      data: item,
      user_id: userId || item.user_id,
      brewery_id: breweryId || item.brewery_id
    };

    if (hasStatus) {
      payload.status = item.status || 'private';
    }

    const { error } = await client.from(table).upsert(payload);

    if (error) {
      console.error(`Save error for ${table}:`, error.message, error.details, error.hint, error.code);
    }

    return { error };
  },

  async deleteLibraryIngredient(id: string, type: string) {
    const client = supabase;
    const table = TABLE_MAP[type];
    if (!client || !table) return;
    return client.from(table).delete().eq('id', id);
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

  async updateItemStatus(id: string, type: string, status: 'private' | 'submitted' | 'approved', tableOverride?: string) {
    const client = supabase;
    const table = tableOverride || TABLE_MAP[type] || type;
    if (!client || !table) return;

    // Fetch current data to update the status inside the jsonb too
    const { data: item } = await client.from(table).select('data, user_id').eq('id', id).single();
    if (item) {
      const newData = { ...item.data, status };
      return client.from(table).update({
        status: status,
        data: newData
      }).eq('id', id);
    }
  },

  async batchUpdateStatus(ids: string[], table: string, status: 'private' | 'submitted' | 'approved') {
    const client = supabase;
    if (!client || !table || ids.length === 0) return;

    const { data: items } = await client.from(table).select('id, data, user_id').in('id', ids);
    if (items) {
      const updates = items.map(item => ({
        id: item.id,
        status: status,
        user_id: item.user_id,
        data: { ...item.data, status }
      }));
      return client.from(table).upsert(updates);
    }
  },

  async batchSaveLibraryIngredients(items: LibraryIngredient[], userId: string, breweryId?: string) {
    const client = supabase;
    if (!client || items.length === 0) return;

    const libraryByType: Record<string, LibraryIngredient[]> = {};
    items.forEach(item => {
      const table = TABLE_MAP[item.type];
      if (table) {
        if (!libraryByType[table]) libraryByType[table] = [];
        libraryByType[table].push(item);
      }
    });

    const STATUS_TABLES = ['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];

    const tasks = Object.entries(libraryByType).map(async ([table, items]) => {
      // Find the ingredient type that corresponds to this table
      const firstItemType = Object.entries(TABLE_MAP).find(([type, tbl]) => tbl === table)?.[0] || '';
      const hasStatus = STATUS_TABLES.includes(table) || STATUS_TABLES.includes(firstItemType);

      const { error } = await client.from(table).upsert(items.map(i => {
        const payload: any = {
          id: i.id || uuidv4(),
          data: i,
          user_id: userId,
          brewery_id: breweryId || i.brewery_id
        };
        if (hasStatus) {
          payload.status = i.status || 'private';
        }
        return payload;
      }));
      if (error) {
        console.error(`Batch save error for ${table}:`, error.message, error.details, error.hint, error.code);
      }
      return { error };
    });

    return Promise.all(tasks);
  }
};

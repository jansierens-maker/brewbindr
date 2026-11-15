import { supabase } from './supabaseClient';
import type { FlavourKb, FlavourMapping, FlavourCategory } from './flavourLab';

/**
 * Loads the Flavour Lab knowledge base from Supabase (read-only, the same for everyone) and keeps it
 * in this browser until its version changes. Without a connection it falls back to the copy that
 * ships with the app (data/flavour-lab.json, loaded on demand).
 */

const CACHE_KEY = 'brewbindr.flavourKb';
let memory: Promise<FlavourKb> | null = null;

const bundled = async (): Promise<FlavourKb> => {
  const m = await import('../data/flavour-lab.json');
  return (m.default ?? m) as unknown as FlavourKb;
};

const readCache = (): { version: string; kb: FlavourKb } | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCache = (version: string, kb: FlavourKb) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version, kb })); } catch { /* full or blocked: no cache */ }
};

const fetchKb = async (): Promise<FlavourKb> => {
  if (!supabase) return bundled();
  const client = supabase;
  const { data: meta, error: metaError } = await client.from('flavour_meta').select('value').eq('key', 'version').maybeSingle();
  if (metaError || !meta) return bundled();
  const cached = readCache();
  if (cached && cached.version === meta.value) return cached.kb;

  const all = async <T,>(table: string, order: string) => {
    const { data, error } = await client.from(table).select('*').order(order).range(0, 9999);
    if (error) throw error;
    return (data ?? []) as T[];
  };
  const [families, compounds, ingredients, links, sources] = await Promise.all([
    all<FlavourKb['families'][number]>('flavour_families', 'sort'),
    all<FlavourKb['compounds'][number]>('flavour_compounds', 'id'),
    all<FlavourKb['ingredients'][number]>('flavour_ingredients', 'id'),
    all<FlavourKb['links'][number]>('flavour_ingredient_compounds', 'ingredient_id'),
    all<FlavourKb['sources'][number]>('flavour_sources', 'id'),
  ]);
  const kb: FlavourKb = {
    families, compounds, sources, links,
    ingredients: ingredients.map(i => ({
      ...i,
      dose_min_g_per_l: i.dose_min_g_per_l === null ? null : Number(i.dose_min_g_per_l),
      dose_max_g_per_l: i.dose_max_g_per_l === null ? null : Number(i.dose_max_g_per_l),
    })),
  };
  writeCache(meta.value, kb);
  return kb;
};

export const flavourLabService = {
  /** The knowledge base (cached for the session and, per version, in this browser). */
  loadKb(): Promise<FlavourKb> {
    if (!memory) {
      memory = fetchKb().catch(err => {
        console.error('Flavour Lab knowledge base:', err?.message);
        return bundled();
      });
    }
    return memory;
  },

  /** The brewery's manual links of recipe names. */
  async loadMappings(breweryId: string | undefined): Promise<FlavourMapping[]> {
    if (!supabase || !breweryId) return [];
    const { data, error } = await supabase.from('flavour_mappings').select('category, name_key, ingredient_id').eq('brewery_id', breweryId);
    if (error) {
      console.error('Flavour Lab links:', error.message);
      return [];
    }
    return (data ?? []) as FlavourMapping[];
  },

  /** Links a recipe name to an ingredient (or to nothing: leave it out). */
  async saveMapping(breweryId: string, userId: string, m: { category: FlavourCategory; name_key: string; ingredient_id: string | null }) {
    if (!supabase) return { error: null };
    return supabase.from('flavour_mappings').upsert({ brewery_id: breweryId, created_by: userId, ...m }, { onConflict: 'brewery_id,category,name_key' });
  },

  async deleteMapping(breweryId: string, category: FlavourCategory, nameKey: string) {
    if (!supabase) return { error: null };
    return supabase.from('flavour_mappings').delete().eq('brewery_id', breweryId).eq('category', category).eq('name_key', nameKey);
  },
};

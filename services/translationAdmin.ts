import type { LibraryIngredient } from '../types';
import type { Language } from './i18n';
import { ITEM_LANGS, ItemTextField, textFieldsFor } from './itemI18n';
import { supabase } from './supabaseClient';

/** Translation proposals for the public library (#212): what is sent, merged and counted. */

export interface Proposal {
  id: string;
  name_kind: 'generic' | 'product';
  names: Partial<Record<Language, string>>;
  aliases: string[];
  i18n: Partial<Record<Language, Partial<Record<ItemTextField, string>>>>;
  doubt?: string;
}

export const BATCH_SIZE = 50;

/** The types the translation tool covers. */
export const TRANSLATABLE_TYPES = ['fermentable', 'hop', 'culture', 'misc', 'style', 'water', 'mash_profile', 'equipment'];

/** What Gemini gets per item: names and the descriptions that exist. */
export const toInput = (i: LibraryIngredient) => {
  const texts: Partial<Record<ItemTextField, string>> = {};
  for (const f of textFieldsFor(i.type)) if (i[f]) texts[f] = i[f]!;
  return {
    id: i.id, type: i.type, name: i.name,
    ...(i.name_kind ? { name_kind: i.name_kind } : {}),
    ...(i.names ? { names: i.names } : {}),
    ...(i.aliases?.length ? { aliases: i.aliases } : {}),
    ...(Object.keys(texts).length ? { texts } : {}),
    ...(i.i18n ? { i18n: i.i18n } : {}),
  };
};

/**
 * The item with a proposal filled in where it has nothing yet: existing names and texts stay,
 * aliases are added, and the kind of name is the proposal's unless the item already has one.
 */
export const applyProposal = (item: LibraryIngredient, p: Proposal): LibraryIngredient => {
  const name_kind = item.name_kind ?? p.name_kind;
  const names = name_kind === 'product' ? item.names : { ...p.names, ...strip(item.names) };
  const aliases = [...new Set([...(item.aliases ?? []), ...p.aliases])];
  const i18n: LibraryIngredient['i18n'] = {};
  for (const l of ITEM_LANGS) {
    const merged = { ...p.i18n[l], ...strip(item.i18n?.[l]) };
    if (Object.keys(merged).length) i18n[l] = merged;
  }
  return {
    ...item, name_kind,
    ...(names && Object.keys(names).length ? { names } : {}),
    ...(aliases.length ? { aliases } : {}),
    ...(Object.keys(i18n).length ? { i18n } : {}),
  };
};

/** Leaves out empty strings so they do not hide a proposal. */
const strip = <T extends object>(o: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())) as Partial<T>;

/** Asks for proposals in batches of 50; reports progress; stops at the first error. */
export const requestProposals = async (
  items: LibraryIngredient[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ proposals: Proposal[]; error?: string }> => {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  const proposals: Proposal[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch('/api/translate-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ items: batch.map(toInput) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { proposals, error: body.error || `HTTP ${res.status}` };
      proposals.push(...((body.items ?? []) as Proposal[]));
    } catch (e) {
      return { proposals, error: (e as Error).message };
    }
    onProgress?.(Math.min(i + BATCH_SIZE, items.length), items.length);
  }
  return { proposals };
};

export interface Coverage {
  type: string;
  total: number;
  /** Items whose name still needs a translation (product names excluded), per language */
  namesMissing: Record<Language, number>;
  /** Items with a description that still lacks a translation, per language */
  textsMissing: Record<Language, number>;
}

/** Per type: how many items still miss a name or a description per language. */
export const coverage = (items: LibraryIngredient[]): Coverage[] =>
  TRANSLATABLE_TYPES.map(type => {
    const list = items.filter(i => i.type === type);
    const zero = () => ({ nl: 0, fr: 0, en: 0 } as Record<Language, number>);
    const namesMissing = zero(), textsMissing = zero();
    for (const i of list) {
      for (const l of ITEM_LANGS) {
        if (i.name_kind !== 'product' && !i.names?.[l]?.trim()) namesMissing[l] += 1;
        if (textFieldsFor(type).some(f => (i[f] || ITEM_LANGS.some(x => i.i18n?.[x]?.[f])) && !i.i18n?.[l]?.[f]?.trim())) textsMissing[l] += 1;
      }
    }
    return { type, total: list.length, namesMissing, textsMissing };
  }).filter(c => c.total > 0);

/** Items that still need work for a language: a name (unless a product name) or a description. */
export const needsTranslation = (i: LibraryIngredient, lang: Language | 'any', what: 'name' | 'text' | 'any'): boolean => {
  const langs = lang === 'any' ? ITEM_LANGS : [lang];
  const name = i.name_kind !== 'product' && langs.some(l => !i.names?.[l]?.trim());
  const text = textFieldsFor(i.type).some(f => (i[f] || ITEM_LANGS.some(x => i.i18n?.[x]?.[f])) && langs.some(l => !i.i18n?.[l]?.[f]?.trim()));
  return what === 'name' ? name : what === 'text' ? text : name || text;
};

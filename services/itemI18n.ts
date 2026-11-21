import type { LibraryIngredient } from '../types';
import type { Language } from './i18n';
import { normalizeText } from './search';

/**
 * Library items in several languages (#212): a name and descriptions per language, aliases,
 * and whether the name is a product name (not translated). `name` stays the main name and
 * the fallback, so items without translations show as before.
 */

export const ITEM_LANGS: Language[] = ['nl', 'fr', 'en'];
export type ItemTextField = 'description' | 'profile' | 'examples' | 'notes' | 'use_for';
export const ITEM_TEXT_FIELDS: ItemTextField[] = ['description', 'profile', 'examples', 'notes', 'use_for'];

type Named = Pick<LibraryIngredient, 'name' | 'names' | 'name_kind' | 'aliases'>;

/** The name to show in a language: the translation, else the main name. A product name is never translated. */
export const displayName = (item: Named, lang: Language | string): string =>
  (item.name_kind !== 'product' && item.names?.[lang as Language]?.trim()) || item.name;

/** A description in a language, else the plain field. */
export const displayText = (item: Pick<LibraryIngredient, 'i18n' | ItemTextField>, field: ItemTextField, lang: Language | string): string | undefined =>
  item.i18n?.[lang as Language]?.[field]?.trim() || item[field] || undefined;

/** Every name an item goes by: main name, translations and aliases (each once). */
export const allNames = (item: Named): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [item.name, ...Object.values(item.names ?? {}), ...(item.aliases ?? [])]) {
    const k = n ? normalizeText(n.trim()) : '';
    if (k && !seen.has(k)) { seen.add(k); out.push(n!.trim()); }
  }
  return out;
};

/** All descriptions of an item in every language (for searching). */
export const allTexts = (item: Pick<LibraryIngredient, 'i18n' | ItemTextField>): string[] =>
  [
    ...ITEM_TEXT_FIELDS.map(f => item[f]),
    ...ITEM_LANGS.flatMap(l => ITEM_TEXT_FIELDS.map(f => item.i18n?.[l]?.[f])),
  ].filter((t): t is string => !!t);

/** Whether a name (from a recipe or a file) is one of the item's names, ignoring case and accents. */
export const hasName = (item: Named, name: string | undefined): boolean => {
  if (!name) return false;
  const k = normalizeText(name.trim());
  return allNames(item).some(n => normalizeText(n) === k);
};

/** Which languages still miss a name (product names need none) or a given description. */
export const missingLanguages = (item: LibraryIngredient, what: 'name' | ItemTextField): Language[] => {
  if (what === 'name') return item.name_kind === 'product' ? [] : ITEM_LANGS.filter(l => !item.names?.[l]?.trim());
  const base = item[what];
  if (!base && !ITEM_LANGS.some(l => item.i18n?.[l]?.[what])) return []; // nothing to translate
  return ITEM_LANGS.filter(l => !item.i18n?.[l]?.[what]?.trim());
};

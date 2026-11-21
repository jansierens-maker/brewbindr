import type { BrewLogEntry, LibraryIngredient, Recipe } from '../types';
import { allNames, allTexts } from './itemI18n';

/** Lower case without accents, so "tripel" finds "Trípel" and "creme" finds "crème". */
export const normalizeText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Whether every word of the query appears in the text (in any order). An empty query
 * matches everything: "saaz pils" finds a recipe with Saaz hops and Pilsner malt.
 */
export const matchesQuery = (text: string, query: string) => {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalizeText(text);
  return words.every(w => hay.includes(w));
};

const join = (parts: (string | number | undefined | null)[]) => parts.filter(p => p !== undefined && p !== null && p !== '').join(' \u0001 ');

/** What a recipe is found by: name, style, notes and the names of its ingredients. */
export const recipeSearchText = (r: Recipe) => {
  const ing = r.ingredients;
  return join([
    r.name, r.style?.name, r.style?.category, r.author, r.notes,
    ...(ing?.fermentables ?? []).map(f => f.name),
    ...(ing?.hops ?? []).map(h => h.name),
    ...(ing?.cultures ?? []).map(c => c.name),
    ...(ing?.miscellaneous ?? []).map(m => m.name),
  ]);
};

/** What a brew is found by: its recipe, batch number, date, notes and the ingredients used. */
export const brewSearchText = (log: BrewLogEntry, recipe: Recipe | undefined, batchLabel?: string) => {
  const ing = log.ingredients ?? recipe?.ingredients;
  return join([
    recipe?.name, recipe?.style?.name, batchLabel, log.brewDate ?? log.date, log.notes,
    ...(ing?.fermentables ?? []).map(f => f.name),
    ...(ing?.hops ?? []).map(h => h.name),
    ...(ing?.cultures ?? []).map(c => c.name),
    ...(ing?.miscellaneous ?? []).map(m => m.name),
  ]);
};

/** What a library item is found by: name and its descriptive fields. */
export const ingredientSearchText = (i: LibraryIngredient) =>
  join([...allNames(i), i.category, i.style_guide, ...allTexts(i), i.form, i.preset]);

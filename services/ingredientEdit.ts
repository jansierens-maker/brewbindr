import { Culture, Fermentable, Hop, LibraryIngredient, Misc, Recipe } from '../types';
import { guessFermentableType } from './calculations';

export type IngredientKind = 'fermentable' | 'hop' | 'culture' | 'misc';
type Ingredients = Recipe['ingredients'];

const LIST: Record<IngredientKind, 'fermentables' | 'hops' | 'cultures' | 'miscellaneous'> = {
  fermentable: 'fermentables', hop: 'hops', culture: 'cultures', misc: 'miscellaneous',
};

/** A new, empty ingredient of this kind (units follow the user's preference). */
export const newIngredient = (kind: IngredientKind, imperial: boolean): Fermentable | Hop | Culture | Misc => {
  switch (kind) {
    case 'fermentable': return { name: '', type: 'grain', amount: { unit: imperial ? 'pounds' : 'kilograms', value: 0 }, color: { value: 2 } };
    case 'hop': return { name: '', amount: { unit: imperial ? 'ounces' : 'grams', value: 0 }, use: 'boil', time: { unit: 'minutes', value: 60 }, alpha_acid: { value: 5 } };
    case 'culture': return { name: '', type: 'ale', form: 'dry', attenuation: 75 };
    case 'misc': return { name: '', type: 'spice', use: 'boil', amount: { unit: 'grams', value: 0 }, time: { unit: 'minutes', value: 10 } };
  }
};

/** The ingredient after choosing a library item for it: name, link and the item's properties; amount and timing stay. */
export function fromLibraryItem(kind: 'fermentable', current: Fermentable, item: LibraryIngredient): Fermentable;
export function fromLibraryItem(kind: 'hop', current: Hop, item: LibraryIngredient): Hop;
export function fromLibraryItem(kind: 'culture', current: Culture, item: LibraryIngredient): Culture;
export function fromLibraryItem(kind: 'misc', current: Misc, item: LibraryIngredient): Misc;
export function fromLibraryItem(kind: IngredientKind, current: Fermentable | Hop | Culture | Misc, item: LibraryIngredient): Fermentable | Hop | Culture | Misc {
  switch (kind) {
    case 'fermentable': {
      const potential = 1 + (item.yield || 75) / 100 * 0.046;
      return { ...(current as Fermentable), name: item.name, libraryId: item.id, type: guessFermentableType(item.name), color: { value: item.color || 2 }, yield: { potential: { value: potential } } };
    }
    case 'hop': {
      const h = current as Hop;
      const form = item.form === 'leaf' || item.form === 'plug' || item.form === 'pellet' ? item.form : h.form;
      return { ...h, name: item.name, libraryId: item.id, alpha_acid: { value: item.alpha || 5 }, form };
    }
    case 'culture':
      return { ...(current as Culture), name: item.name, libraryId: item.id, type: item.type as Culture['type'], form: item.form as Culture['form'], attenuation: item.attenuation || 75 };
    case 'misc':
      return { ...(current as Misc), name: item.name, libraryId: item.id, type: item.misc_type || 'spice', use: item.misc_use || 'boil' };
  }
}

/** The ingredient lists with one ingredient replaced. */
export const replaceIngredient = (ings: Ingredients, kind: IngredientKind, idx: number, next: Fermentable | Hop | Culture | Misc): Ingredients => {
  const key = LIST[kind];
  const list = [...((ings[key] as unknown[]) ?? [])];
  list[idx] = next;
  return { ...ings, [key]: list };
};

/** The ingredient lists with one ingredient removed. */
export const removeIngredient = (ings: Ingredients, kind: IngredientKind, idx: number): Ingredients => {
  const key = LIST[kind];
  return { ...ings, [key]: ((ings[key] as unknown[]) ?? []).filter((_, i) => i !== idx) };
};

/** The ingredient lists with an ingredient added at the end. */
export const addIngredient = (ings: Ingredients, kind: IngredientKind, item: Fermentable | Hop | Culture | Misc): Ingredients => {
  const key = LIST[kind];
  return { ...ings, [key]: [...((ings[key] as unknown[]) ?? []), item] };
};

/** Whether two ingredient lists differ (what was used against the recipe). */
export const ingredientsDiffer = (a: Ingredients | undefined, b: Ingredients | undefined): boolean => {
  const norm = (x: Ingredients | undefined) => JSON.stringify({
    fermentables: x?.fermentables ?? [], hops: x?.hops ?? [], cultures: x?.cultures ?? [], miscellaneous: x?.miscellaneous ?? [],
  });
  return norm(a) !== norm(b);
};

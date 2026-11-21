import type { BrewLogEntry, LibraryIngredient, Recipe } from '../types';

/**
 * Filters and sort orders for the lists (recipes, brews, library items). Pure functions:
 * the screens keep the state, these decide what is shown and in which order.
 */

type Specs = Recipe['specifications'];

const inRange = (v: number | undefined, min?: number, max?: number) =>
  (min === undefined && max === undefined) || (v !== undefined && !isNaN(v) && (min === undefined || v >= min) && (max === undefined || v <= max));

/** Number of filters that are set (for the "Filters (n)" button). */
export const activeFilterCount = (f: object) =>
  Object.values(f).filter(v => v !== undefined && v !== '' && v !== null).length;

// ---- Recipes ----

export interface RecipeFilters {
  /** Style name */
  style?: string;
  abvMin?: number;
  abvMax?: number;
  /** Colour in SRM */
  colorMin?: number;
  colorMax?: number;
  brewed?: 'never' | 'brewed';
}

export type RecipeSort = 'name' | 'last_brewed' | 'abv_desc' | 'abv_asc' | 'color_asc' | 'color_desc';
export const RECIPE_SORTS: RecipeSort[] = ['name', 'last_brewed', 'abv_desc', 'abv_asc', 'color_asc', 'color_desc'];

/** When each recipe was last brewed (ISO date), from the brew log. */
export const lastBrewedByRecipe = (logs: Pick<BrewLogEntry, 'recipeId' | 'date' | 'brewDate'>[]) => {
  const map = new Map<string, string>();
  for (const l of logs) {
    const d = l.brewDate || l.date;
    if (d && (!map.has(l.recipeId) || d > map.get(l.recipeId)!)) map.set(l.recipeId, d);
  }
  return map;
};

export const recipeMatches = (r: Recipe, specs: Specs, f: RecipeFilters, lastBrewed: Map<string, string>) =>
  (!f.style || r.style?.name === f.style)
  && inRange(specs?.abv?.value, f.abvMin, f.abvMax)
  && inRange(specs?.color?.value, f.colorMin, f.colorMax)
  && (!f.brewed || (f.brewed === 'brewed') === lastBrewed.has(r.id ?? ''));

export const sortRecipes = <T extends { recipe: Recipe; specs?: Specs }>(items: T[], sort: RecipeSort, lastBrewed: Map<string, string>): T[] => {
  const byName = (a: T, b: T) => a.recipe.name.localeCompare(b.recipe.name);
  const num = (x: T, k: 'abv' | 'color') => x.specs?.[k]?.value ?? 0;
  const cmp: Record<RecipeSort, (a: T, b: T) => number> = {
    name: byName,
    // Never brewed last, then by name
    last_brewed: (a, b) => (lastBrewed.get(b.recipe.id ?? '') ?? '').localeCompare(lastBrewed.get(a.recipe.id ?? '') ?? '') || byName(a, b),
    abv_desc: (a, b) => num(b, 'abv') - num(a, 'abv') || byName(a, b),
    abv_asc: (a, b) => num(a, 'abv') - num(b, 'abv') || byName(a, b),
    color_asc: (a, b) => num(a, 'color') - num(b, 'color') || byName(a, b),
    color_desc: (a, b) => num(b, 'color') - num(a, 'color') || byName(a, b),
  };
  return [...items].sort(cmp[sort]);
};

// ---- Brews ----

export interface BrewFilters {
  year?: number;
  recipeId?: string;
  equipmentId?: string;
  finished?: 'open' | 'finished';
  notes?: 'with' | 'without';
}

export type BrewSort = 'newest' | 'oldest' | 'recipe';
export const BREW_SORTS: BrewSort[] = ['newest', 'oldest', 'recipe'];

export const brewDateOf = (l: Pick<BrewLogEntry, 'date' | 'brewDate'>) => l.brewDate || l.date;
export const brewYear = (l: Pick<BrewLogEntry, 'date' | 'brewDate'>) => new Date(brewDateOf(l)).getFullYear();

export const brewMatches = (l: BrewLogEntry, recipe: Recipe | undefined, f: BrewFilters, noteCount: number) =>
  (f.year === undefined || brewYear(l) === f.year)
  && (!f.recipeId || l.recipeId === f.recipeId)
  && (!f.equipmentId || (l.equipmentId ?? recipe?.equipmentId) === f.equipmentId)
  && (!f.finished || (f.finished === 'finished') === !!l.finished)
  && (!f.notes || (f.notes === 'with') === noteCount > 0);

export const sortBrews = (logs: BrewLogEntry[], sort: BrewSort, recipeName: (l: BrewLogEntry) => string): BrewLogEntry[] => {
  const time = (l: BrewLogEntry) => new Date(brewDateOf(l)).getTime();
  const cmp: Record<BrewSort, (a: BrewLogEntry, b: BrewLogEntry) => number> = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    recipe: (a, b) => recipeName(a).localeCompare(recipeName(b)) || time(b) - time(a),
  };
  return [...logs].sort(cmp[sort]);
};

// ---- Library items ----

export interface IngredientFilters {
  stock?: 'in' | 'out';
  usage?: 'used' | 'unused';
  /** Range on the type's own number: malt colour (SRM), hop alpha acid, yeast attenuation */
  min?: number;
  max?: number;
}

export type IngredientSort = 'name' | 'value_asc' | 'value_desc';

/** The number a type is filtered and sorted on, if it has one. */
export const rangeField = (type: string): 'color' | 'alpha' | 'attenuation' | undefined =>
  type === 'fermentable' ? 'color' : type === 'hop' ? 'alpha' : type === 'culture' ? 'attenuation' : undefined;

/** Library ids and (lower case) names the recipes use, to tell used from unused items. */
export const usedInRecipes = (recipes: Recipe[]) => {
  const used = new Set<string>();
  for (const r of recipes) {
    const ing = r.ingredients;
    for (const i of [...(ing?.fermentables ?? []), ...(ing?.hops ?? []), ...(ing?.cultures ?? []), ...(ing?.miscellaneous ?? [])] as { libraryId?: string; name?: string }[]) {
      if (i.libraryId) used.add(i.libraryId);
      if (i.name) used.add(i.name.toLowerCase());
    }
    if (r.style?.libraryId) used.add(r.style.libraryId);
    if (r.style?.name) used.add(r.style.name.toLowerCase());
  }
  return used;
};

export const ingredientMatches = (i: LibraryIngredient, f: IngredientFilters, used: Set<string>) => {
  const field = rangeField(i.type);
  const hasStock = (i.stock?.amount ?? 0) > 0;
  const isUsed = used.has(i.id) || used.has(i.name.toLowerCase());
  return (!f.stock || (f.stock === 'in') === hasStock)
    && (!f.usage || (f.usage === 'used') === isUsed)
    && (!field || inRange(i[field], f.min, f.max));
};

export const sortIngredients = (items: LibraryIngredient[], sort: IngredientSort, nameOf: (i: LibraryIngredient) => string = i => i.name): LibraryIngredient[] => {
  const byName = (a: LibraryIngredient, b: LibraryIngredient) => nameOf(a).localeCompare(nameOf(b));
  if (sort === 'name') return [...items].sort(byName);
  const v = (i: LibraryIngredient) => { const f = rangeField(i.type); return f ? i[f] ?? 0 : 0; };
  return [...items].sort((a, b) => (sort === 'value_asc' ? v(a) - v(b) : v(b) - v(a)) || byName(a, b));
};

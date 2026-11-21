import { describe, expect, it } from 'vitest';
import {
  activeFilterCount, lastBrewedByRecipe, recipeMatches, sortRecipes, brewMatches, sortBrews, brewYear,
  usedInRecipes, ingredientMatches, sortIngredients, rangeField,
} from '../../services/filters';
import type { BrewLogEntry, LibraryIngredient, Recipe } from '../../types';

const recipe = (id: string, name: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, name, type: 'all_grain', author: '', status: 'private',
  batch_size: { unit: 'liters', value: 20 }, efficiency: { brewhouse: 75 }, boil_time: { unit: 'minutes', value: 60 },
  ingredients: { fermentables: [], hops: [], cultures: [] }, ...extra,
});
const specs = (abv: number, color: number) => ({ abv: { value: abv }, color: { value: color } });
const log = (id: string, recipeId: string, date: string, extra: Partial<BrewLogEntry> = {}) =>
  ({ id, recipeId, date, status: 'bottled', notes: '', measurements: {}, ...extra }) as unknown as BrewLogEntry;

describe('recipe filters', () => {
  const logs = [log('b1', 'r1', '2025-03-01'), log('b2', 'r1', '2026-05-01'), log('b3', 'r2', '2026-01-01')];
  const last = lastBrewedByRecipe(logs);

  it('knows when a recipe was last brewed', () => {
    expect(last.get('r1')).toBe('2026-05-01');
    expect(last.has('r3')).toBe(false);
  });

  it('filters on style, ABV, colour and whether it was brewed', () => {
    const tripel = recipe('r1', 'Tripel', { style: { name: 'Belgian Tripel' } });
    expect(recipeMatches(tripel, specs(8.5, 5), {}, last)).toBe(true);
    expect(recipeMatches(tripel, specs(8.5, 5), { style: 'Witbier' }, last)).toBe(false);
    expect(recipeMatches(tripel, specs(8.5, 5), { abvMin: 6, abvMax: 9 }, last)).toBe(true);
    expect(recipeMatches(tripel, specs(8.5, 5), { abvMax: 7 }, last)).toBe(false);
    expect(recipeMatches(tripel, specs(8.5, 5), { colorMin: 10 }, last)).toBe(false);
    expect(recipeMatches(tripel, undefined, { abvMin: 1 }, last)).toBe(false);
    expect(recipeMatches(tripel, specs(8.5, 5), { brewed: 'never' }, last)).toBe(false);
    expect(recipeMatches(recipe('r3', 'Nieuw'), specs(5, 5), { brewed: 'never' }, last)).toBe(true);
  });

  it('counts the filters that are set', () => {
    expect(activeFilterCount({ style: 'x', abvMin: undefined, brewed: 'never' })).toBe(2);
  });

  it('sorts by name, last brewed, ABV and colour', () => {
    const items = [
      { recipe: recipe('r3', 'Alfa'), specs: specs(5, 20) },
      { recipe: recipe('r2', 'Bravo'), specs: specs(9, 4) },
      { recipe: recipe('r1', 'Charlie'), specs: specs(6, 10) },
    ];
    const names = (s: Parameters<typeof sortRecipes>[1]) => sortRecipes(items, s, last).map(i => i.recipe.name);
    expect(names('name')).toEqual(['Alfa', 'Bravo', 'Charlie']);
    expect(names('last_brewed')).toEqual(['Charlie', 'Bravo', 'Alfa']);
    expect(names('abv_desc')).toEqual(['Bravo', 'Charlie', 'Alfa']);
    expect(names('color_asc')).toEqual(['Bravo', 'Charlie', 'Alfa']);
  });
});

describe('brew filters', () => {
  const r = recipe('r1', 'Wit', { equipmentId: 'eq1' });
  it('filters on year, recipe, installation, finished and tasting notes', () => {
    const l = log('b1', 'r1', '2026-02-01', { brewDate: '2025-12-30', finished: true });
    expect(brewYear(l)).toBe(2025);
    expect(brewMatches(l, r, { year: 2025, recipeId: 'r1', equipmentId: 'eq1', finished: 'finished', notes: 'with' }, 2)).toBe(true);
    expect(brewMatches(l, r, { year: 2026 }, 0)).toBe(false);
    expect(brewMatches(l, r, { equipmentId: 'eq2' }, 0)).toBe(false);
    expect(brewMatches({ ...l, equipmentId: 'eq2' }, r, { equipmentId: 'eq2' }, 0)).toBe(true);
    expect(brewMatches(l, r, { finished: 'open' }, 0)).toBe(false);
    expect(brewMatches(l, r, { notes: 'without' }, 1)).toBe(false);
  });

  it('sorts newest, oldest or by recipe', () => {
    const logs = [log('a', 'r1', '2026-01-01'), log('b', 'r2', '2026-03-01'), log('c', 'r1', '2025-06-01')];
    const name = (l: BrewLogEntry) => (l.recipeId === 'r1' ? 'Wit' : 'Amber');
    expect(sortBrews(logs, 'newest', name).map(l => l.id)).toEqual(['b', 'a', 'c']);
    expect(sortBrews(logs, 'oldest', name).map(l => l.id)).toEqual(['c', 'a', 'b']);
    expect(sortBrews(logs, 'recipe', name).map(l => l.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('library filters', () => {
  const item = (id: string, name: string, extra: Partial<LibraryIngredient>): LibraryIngredient => ({ id, name, type: 'hop', ...extra });
  const saaz = item('h1', 'Saaz', { alpha: 3.5, stock: { amount: 100, unit: 'grams' } as LibraryIngredient['stock'] });
  const citra = item('h2', 'Citra', { alpha: 12 });
  const used = usedInRecipes([recipe('r1', 'Pils', { ingredients: { fermentables: [], hops: [{ name: 'saaz' } as never], cultures: [] } })]);

  it('filters on stock, use in recipes and the type\'s number', () => {
    expect(rangeField('hop')).toBe('alpha');
    expect(rangeField('style')).toBeUndefined();
    expect(ingredientMatches(saaz, { stock: 'in', usage: 'used' }, used)).toBe(true);
    expect(ingredientMatches(citra, { stock: 'in' }, used)).toBe(false);
    expect(ingredientMatches(citra, { usage: 'unused', min: 10 }, used)).toBe(true);
    expect(ingredientMatches(saaz, { min: 10 }, used)).toBe(false);
  });

  it('sorts by name or by the type\'s number', () => {
    expect(sortIngredients([citra, saaz], 'name').map(i => i.name)).toEqual(['Citra', 'Saaz']);
    expect(sortIngredients([saaz, citra], 'value_desc').map(i => i.name)).toEqual(['Citra', 'Saaz']);
  });
});

import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeText, recipeSearchText, brewSearchText, ingredientSearchText } from '../../services/search';
import type { BrewLogEntry, Recipe } from '../../types';

const recipe = {
  id: 'r1', name: 'Trípel Karmeliet-ish', type: 'all_grain', author: 'Jan', status: 'private',
  batch_size: { unit: 'liters', value: 20 }, efficiency: { brewhouse: 75 }, boil_time: { unit: 'minutes', value: 60 },
  style: { name: 'Belgian Tripel' }, notes: 'Met koriander',
  ingredients: {
    fermentables: [{ name: 'Pilsner Malt' }], hops: [{ name: 'Saaz' }], cultures: [{ name: 'WLP500' }],
    miscellaneous: [{ name: 'Crème de cassis' }],
  },
} as unknown as Recipe;

describe('search', () => {
  it('ignores case and accents', () => {
    expect(normalizeText('Trípel CRÈME')).toBe('tripel creme');
  });

  it('needs every word, in any order, and matches everything when empty', () => {
    const text = recipeSearchText(recipe);
    expect(matchesQuery(text, '')).toBe(true);
    expect(matchesQuery(text, 'saaz pils')).toBe(true);
    expect(matchesQuery(text, 'tripel creme')).toBe(true);
    expect(matchesQuery(text, 'koriander')).toBe(true);
    expect(matchesQuery(text, 'saaz cascade')).toBe(false);
  });

  it('finds a brew by recipe, batch and the ingredients used', () => {
    const log = { id: 'b1', recipeId: 'r1', date: '2026-10-01', status: 'fermenting', notes: 'te warm vergist', measurements: {},
      ingredients: { ...recipe.ingredients, hops: [{ name: 'Styrian Goldings' }] } } as unknown as BrewLogEntry;
    const text = brewSearchText(log, recipe, 'batch 3');
    expect(matchesQuery(text, 'batch 3')).toBe(true);
    expect(matchesQuery(text, 'goldings')).toBe(true);
    expect(matchesQuery(text, 'saaz')).toBe(false); // replaced in this brew
    expect(matchesQuery(text, 'warm')).toBe(true);
    expect(matchesQuery(text, '2026-10')).toBe(true);
  });

  it('finds a library item by its descriptive fields', () => {
    expect(matchesQuery(ingredientSearchText({ id: 'x', name: 'Belgian Dubbel', type: 'style', category: 'Trappist Ale' }), 'trappist')).toBe(true);
  });
});

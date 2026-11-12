import { describe, it, expect } from 'vitest';
import { addIngredient, fromLibraryItem, ingredientsDiffer, newIngredient, removeIngredient, replaceIngredient } from '../../services/ingredientEdit';
import { Hop, LibraryIngredient, Recipe } from '../../types';

const ings = (): Recipe['ingredients'] => ({
  fermentables: [{ name: 'Pils', type: 'grain', amount: { unit: 'kilograms', value: 5 } }],
  hops: [{ name: 'Saaz', use: 'boil', amount: { unit: 'grams', value: 40 }, alpha_acid: { value: 3.5 }, time: { unit: 'minutes', value: 60 } }],
  cultures: [],
});

describe('ingredients of a brew (#166)', () => {
  it('replace, remove and add leave the original alone', () => {
    const base = ings();
    const more = replaceIngredient(base, 'fermentable', 0, { ...base.fermentables[0], amount: { unit: 'kilograms', value: 5.5 } });
    expect(more.fermentables[0].amount.value).toBe(5.5);
    expect(base.fermentables[0].amount.value).toBe(5);
    expect(removeIngredient(base, 'hop', 0).hops).toEqual([]);
    expect(addIngredient(base, 'misc', newIngredient('misc', false)).miscellaneous).toHaveLength(1);
    expect(base.hops).toHaveLength(1);
  });

  it('choosing another hop from the library keeps amount and timing', () => {
    const hop = ings().hops[0];
    const citra = { id: 'l-citra', name: 'Citra', type: 'hop', alpha: 12.5, form: 'pellet' } as LibraryIngredient;
    const next: Hop = fromLibraryItem('hop', hop, citra);
    expect(next).toMatchObject({ name: 'Citra', libraryId: 'l-citra', alpha_acid: { value: 12.5 }, amount: { value: 40 }, time: { value: 60 }, use: 'boil' });
  });

  it('a new ingredient uses the preferred units', () => {
    expect((newIngredient('fermentable', true) as { amount: { unit: string } }).amount.unit).toBe('pounds');
    expect((newIngredient('hop', false) as { amount: { unit: string } }).amount.unit).toBe('grams');
  });

  it('knows when the brew differs from the recipe', () => {
    const a = ings();
    expect(ingredientsDiffer(a, ings())).toBe(false);
    expect(ingredientsDiffer({ ...a, miscellaneous: [] }, ings())).toBe(false); // empty list = none
    expect(ingredientsDiffer(replaceIngredient(a, 'hop', 0, { ...a.hops[0], time: { unit: 'minutes', value: 45 } }), ings())).toBe(true);
  });
});

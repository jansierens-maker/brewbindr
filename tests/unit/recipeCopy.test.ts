import { describe, it, expect } from 'vitest';
import { copyRecipe } from '../../services/recipeCopy';
import { Recipe } from '../../types';

const original = {
  id: 'r1', name: 'Tripel', status: 'approved', user_id: 'u0', brewery_id: 'b1', type: 'all_grain', author: 'Jan',
  batch_size: { unit: 'liters', value: 20 },
  ingredients: { fermentables: [{ name: 'Pils', amount: { unit: 'kilograms', value: 6 } }], hops: [], cultures: [] },
} as unknown as Recipe;

describe('copyRecipe', () => {
  it('is a new, private recipe with "(copy)" in the name', () => {
    const c = copyRecipe(original, { suffix: 'kopie', takenNames: ['Tripel'], userId: 'u1', breweryId: 'b1' });
    expect(c.id).not.toBe('r1');
    expect(c.name).toBe('Tripel (kopie)');
    expect(c.status).toBe('private');
    expect(c).toMatchObject({ user_id: 'u1', brewery_id: 'b1', batch_size: { value: 20 } });
  });
  it('gets a unique name when the copy name is taken', () => {
    const c = copyRecipe(original, { suffix: 'kopie', takenNames: ['Tripel', 'Tripel (kopie)'] });
    expect(c.name).toBe('Tripel (kopie) (2)');
  });
  it('shares nothing with the original', () => {
    const c = copyRecipe(original, { suffix: 'copy', takenNames: [] });
    c.ingredients.fermentables[0].amount.value = 5;
    expect(original.ingredients.fermentables[0].amount.value).toBe(6);
  });
});

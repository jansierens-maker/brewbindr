import { describe, it, expect } from 'vitest';
import { defaultWaterProfile, initialBrewWaterChem } from '../../services/calculations';
import { scaleWaterChem } from '../../services/scaling';
import { LibraryIngredient } from '../../types';

const water = (id: string, extra: Partial<LibraryIngredient> = {}) => ({ id, name: id, type: 'water', ...extra }) as LibraryIngredient;

describe('water per brew (#165)', () => {
  it('default profile: the starred one, else the only one, never a public one', () => {
    expect(defaultWaterProfile([water('tap')])?.id).toBe('tap');
    expect(defaultWaterProfile([water('a'), water('b')])).toBeUndefined();
    expect(defaultWaterProfile([water('a'), water('b', { is_default: true })])?.id).toBe('b');
    expect(defaultWaterProfile([water('pub', { status: 'approved' })])).toBeUndefined();
  });

  it('a brew starts with the recipe water, or the default profile as source', () => {
    const lib = [water('a'), water('b', { is_default: true })];
    expect(initialBrewWaterChem({ water_chem: { source: 'a', salts: { gypsum: 4 } } }, lib)).toEqual({ source: 'a', salts: { gypsum: 4 } });
    expect(initialBrewWaterChem({ water_chem: { salts: { gypsum: 4 } } }, lib)).toEqual({ source: 'b', salts: { gypsum: 4 } });
    expect(initialBrewWaterChem({}, lib)).toEqual({ source: 'b' });
    expect(initialBrewWaterChem({}, [water('a'), water('b')])).toBeUndefined();
  });

  it('the copy does not share anything with the recipe', () => {
    const recipe = { water_chem: { source: 'a', salts: { gypsum: 4 } } };
    const chem = initialBrewWaterChem(recipe, [])!;
    chem.salts!.gypsum = 9;
    expect(recipe.water_chem.salts.gypsum).toBe(4);
  });

  it('scaling the brew scales salts and acid, and back again', () => {
    const chem = { source: 'a', salts: { gypsum: 4, cacl2_33: 3 }, lactic_ml: 2 };
    const half = scaleWaterChem(chem, 0.5);
    expect(half).toEqual({ source: 'a', salts: { gypsum: 2, cacl2_33: 1.5 }, lactic_ml: 1 });
    expect(scaleWaterChem(half, 2)).toEqual(chem);
  });
});

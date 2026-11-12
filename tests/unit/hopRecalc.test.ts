import { describe, it, expect } from 'vitest';
import { recalcHopsForIbu } from '../../services/hopRecalc';
import { calculateRecipeStats } from '../../services/calculations';
import { Recipe } from '../../types';

const recipe = (): Recipe => ({
  id: 'r', name: 'Pale', type: 'all_grain', author: 'J',
  batch_size: { unit: 'liters', value: 20 }, boil_time: { unit: 'minutes', value: 60 }, efficiency: { brewhouse: 72 },
  ingredients: {
    fermentables: [{ name: 'Pale', type: 'grain', amount: { unit: 'kilograms', value: 4.5 }, yield: { potential: { value: 1.037 } }, color: { value: 3 } }],
    hops: [
      { name: 'Magnum', use: 'boil', amount: { unit: 'grams', value: 20 }, alpha_acid: { value: 12 }, time: { unit: 'minutes', value: 60 } },
      { name: 'Saaz', use: 'boil', amount: { unit: 'grams', value: 30 }, alpha_acid: { value: 3.5 }, time: { unit: 'minutes', value: 15 } },
      { name: 'Citra', use: 'whirlpool', amount: { unit: 'grams', value: 50 }, alpha_acid: { value: 13 }, time: { unit: 'minutes', value: 20 } },
      { name: 'Mosaic', use: 'dry_hop', amount: { unit: 'grams', value: 60 }, alpha_acid: { value: 12 }, time: { unit: 'days', value: 4 } },
    ],
    cultures: [],
  },
} as unknown as Recipe);

const ibu = (r: Recipe, alpha?: Record<string, number>) => calculateRecipeStats(r, alpha).ibuExact;

describe('recalculate hops for the recipe bitterness (#167)', () => {
  it('higher alpha: less bittering hops, back to the recipe IBU; aroma hops untouched', () => {
    const r = recipe();
    const target = ibu(r);
    const measured = { Magnum: 15, Saaz: 4.5 };
    const res = recalcHopsForIbu(r, target, measured, undefined)!;
    expect(res.currentIbu).toBeGreaterThan(target);
    expect(res.factor).toBeLessThan(1);
    expect(res.ingredients.hops[0].amount.value).toBeLessThan(20);
    expect(res.ingredients.hops[2].amount.value).toBe(50); // whirlpool
    expect(res.ingredients.hops[3].amount.value).toBe(60); // dry hop
    expect(Math.abs(res.resultIbu - target)).toBeLessThan(1);
    expect(Number.isInteger(res.ingredients.hops[0].amount.value)).toBe(true);
    expect(res.changes.map(c => c.name)).toEqual(['Magnum', 'Saaz']);
  });

  it('lower alpha: more hops', () => {
    const r = recipe();
    const res = recalcHopsForIbu(r, ibu(r), { Magnum: 9 }, undefined)!;
    expect(res.ingredients.hops[0].amount.value).toBeGreaterThan(20);
    expect(Math.abs(res.resultIbu - ibu(r))).toBeLessThan(1);
  });

  it('optionally includes whirlpool and dry hops', () => {
    const r = recipe();
    const res = recalcHopsForIbu(r, ibu(r), { Magnum: 15, Citra: 16 }, undefined, true)!;
    expect(res.ingredients.hops[2].amount.value).not.toBe(50);
    expect(res.ingredients.hops[3].amount.value).not.toBe(60);
  });

  it('no result when nothing can be adjusted or the target is below the other hops', () => {
    const r = recipe();
    r.ingredients.hops = r.ingredients.hops.filter(h => h.use === 'dry_hop');
    expect(recalcHopsForIbu(r, 30, undefined, undefined)).toBeNull();
    const only = recipe();
    expect(recalcHopsForIbu(only, 1, undefined, undefined)).toBeNull(); // whirlpool alone gives more than 1 IBU
  });

  it('ounces round to 0.05 oz', () => {
    const r = recipe();
    r.ingredients.hops[0] = { ...r.ingredients.hops[0], amount: { unit: 'ounces', value: 0.7 } };
    const res = recalcHopsForIbu(r, ibu(r), { Magnum: 14 }, undefined)!;
    const v = res.ingredients.hops[0].amount.value;
    expect(Math.round(v / 0.05) * 0.05).toBeCloseTo(v, 6);
  });
});

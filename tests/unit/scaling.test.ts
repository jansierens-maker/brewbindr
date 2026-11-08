import { describe, it, expect } from 'vitest';
import { scaleRecipe, fitProblems, suggestScale } from '../../services/scaling';
import { waterPlan } from '../../services/calculations';
import { LibraryIngredient, Recipe } from '../../types';

const brewie = {
  id: 'e1', name: 'Brewie', type: 'equipment', preset: 'Brewie', equipment_type: 'two_vessel',
  batch_size: 23, boil_time: 60, evap_rate: 2, trub_chiller_loss: 2, top_up_water: 0,
} as unknown as LibraryIngredient;

const recipe = (batch: number, maltKg: number): Recipe => ({
  id: 'r1', name: 'Tripel', type: 'all_grain', author: 'Jan',
  batch_size: { unit: 'liters', value: batch },
  boil_time: { unit: 'minutes', value: 60 },
  efficiency: { brewhouse: 70 },
  ingredients: {
    fermentables: [
      { name: 'Pils', type: 'grain', amount: { unit: 'kilograms', value: maltKg }, yield: { potential: { value: 1.037 } }, color: { value: 3 } },
      { name: 'Kandij', type: 'sugar', amount: { unit: 'kilograms', value: 0.75 }, yield: { potential: { value: 1.046 } }, color: { value: 1 } },
    ],
    hops: [{ name: 'Saaz', use: 'boil', amount: { unit: 'grams', value: 45 }, alpha_acid: { value: 3.5 }, time: { unit: 'minutes', value: 60 } }],
    cultures: [{ name: 'Belgian', type: 'ale', form: 'dry', attenuation: 80, amount: { unit: 'grams', value: 11 } }],
    miscellaneous: [{ name: 'Koriander', use: 'boil', amount: { unit: 'grams', value: 15 }, time: { unit: 'minutes', value: 5 } }],
  },
  mash: { name: 'Single', steps: [{ name: 'Rest', type: 'infusion', step_temp: 66, temperature: 66, step_time: 60, infuse_amount: 15 }] },
  water_chem: { salts: { gypsum: 4, cacl2_33: 3 }, lactic_ml: 2 },
} as unknown as Recipe);

describe('scaleRecipe', () => {
  it('scales every amount and rounds per kind', () => {
    const s = scaleRecipe(recipe(23, 6), 0.87);
    expect(s.batch_size.value).toBe(20);
    expect(s.ingredients.fermentables.map(f => f.amount.value)).toEqual([5.22, 0.65]);
    expect(s.ingredients.hops[0].amount.value).toBe(39);
    expect(s.ingredients.cultures[0].amount?.value).toBe(9.5);
    expect(s.ingredients.miscellaneous?.[0].amount.value).toBe(13.1);
    expect(s.mash?.steps[0].infuse_amount).toBe(13.1);
    expect(s.water_chem?.salts).toEqual({ gypsum: 3.5, cacl2_33: 2.6 });
    expect(s.water_chem?.lactic_ml).toBe(1.7);
  });
  it('keeps times, temperatures and the original recipe', () => {
    const r = recipe(23, 6);
    const s = scaleRecipe(r, 0.5);
    expect(s.ingredients.hops[0].time.value).toBe(60);
    expect(s.mash?.steps[0].step_temp).toBe(66);
    expect(r.ingredients.fermentables[0].amount.value).toBe(6);
  });
  it('never rounds a small amount away', () => {
    const r = recipe(23, 6);
    r.ingredients.hops[0].amount.value = 1;
    expect(scaleRecipe(r, 0.3).ingredients.hops[0].amount.value).toBe(1);
  });
});

describe('fit on the Brewie (22 L mash, 1 L/kg grain, 23 L kettle, 23 L batch)', () => {
  it('a recipe that fits needs no change', () => {
    // 18.5 L + 2 L trub + 2 L evaporation = 22.5 L before the boil: fits the 23 L kettle
    expect(fitProblems(recipe(18.5, 4.5), brewie)).toEqual([]);
    expect(suggestScale(recipe(18.5, 4.5), brewie)).toBeNull();
    // 20 L needs 24 L before the boil
    expect(fitProblems(recipe(20, 5), brewie)).toEqual(['boil']);
  });
  it('too much wort for the kettle: scale down until it fits', () => {
    const r = recipe(23, 6);
    expect(fitProblems(r, brewie)).toContain('boil');
    const s = suggestScale(r, brewie)!;
    expect(s.direction).toBe('down');
    expect(s.toL).toBeLessThan(23);
    expect(s.toL % 0.5).toBeCloseTo(0, 6);
    const scaled = scaleRecipe(r, s.factor);
    expect(fitProblems(scaled, brewie)).toEqual([]);
    expect(waterPlan(scaled, brewie).preBoilL).toBeLessThanOrEqual(23.05);
    // half a litre more would not fit
    expect(fitProblems(scaleRecipe(r, (s.toL + 0.5) / 23), brewie).length).toBeGreaterThan(0);
  });
  it('too much grain for the mash tun', () => {
    const r = recipe(20, 9);
    expect(fitProblems(r, brewie)).toContain('grain');
    const s = suggestScale(r, brewie)!;
    expect(s.problems).toContain('grain');
    expect(fitProblems(scaleRecipe(r, s.factor), brewie)).toEqual([]);
  });
  it('larger than the installation batch size', () => {
    const big = { ...brewie, boil_capacity: 60, mash_capacity: 60 } as LibraryIngredient;
    expect(fitProblems(recipe(30, 6), big)).toEqual(['batch']);
    expect(suggestScale(recipe(30, 6), big)!.toL).toBe(23);
  });
  it('a small recipe is scaled up to what the installation brews', () => {
    const s = suggestScale(recipe(10, 2.5), brewie)!;
    expect(s.direction).toBe('up');
    expect(s.toL).toBeGreaterThanOrEqual(11);
    expect(s.toL).toBeLessThanOrEqual(23);
    expect(fitProblems(scaleRecipe(recipe(10, 2.5), s.factor), brewie)).toEqual([]);
  });
  it('no suggestion without an installation', () => {
    expect(suggestScale(recipe(23, 6), undefined)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  calculateABV, calculatePrimingSugar, calculateRecipeStats,
  hopTemperatureFactor, normalizeFermentableType, guessFermentableType, mainMashTemperature,
  roundTo, roundByUnit, normalizeRecipe, formatBrewNumber, formatStockAmount, srmToEbc,
} from '../../services/calculations';
import type { Recipe } from '../../types';

// Reference recipe: 5 kg pale malt (potential 1.037, 3 SRM), 20 L, 75 % efficiency,
// 30 g hops at 5 % alpha boiled 60 min, yeast with 75 % attenuation.
// Expected values were computed independently (Tinseth IBU, Morey colour).
const reference = (overrides: Partial<Recipe> = {}): Recipe => ({
  name: 'Reference Pale',
  type: 'all_grain',
  author: 'test',
  batch_size: { unit: 'liters', value: 20 },
  efficiency: { brewhouse: 75 },
  boil_time: { unit: 'minutes', value: 60 },
  ingredients: {
    fermentables: [{ name: 'Pale Malt', type: 'grain', amount: { unit: 'kilograms', value: 5 }, yield: { potential: { value: 1.037 } }, color: { value: 3 } }],
    hops: [{ name: 'EKG', amount: { unit: 'grams', value: 30 }, alpha_acid: { value: 5 }, use: 'boil', time: { unit: 'minutes', value: 60 } }],
    cultures: [{ name: 'Ale yeast', type: 'ale', form: 'dry', attenuation: 75 }],
  },
  ...overrides,
});

describe('calculateRecipeStats', () => {
  it('computes OG, FG, ABV, colour and IBU for the reference recipe', () => {
    const s = calculateRecipeStats(reference());
    expect(s.og).toBeCloseTo(1.0579, 4);
    expect(s.fg).toBeCloseTo(1.0145, 4);
    expect(s.abv).toBeCloseTo(5.70, 2);
    expect(s.color).toBeCloseTo(5.25, 2);
    expect(s.ibu).toBe(16);
  });

  it('gives the same result in imperial units', () => {
    const metric = calculateRecipeStats(reference());
    const imperial = calculateRecipeStats(reference({
      batch_size: { unit: 'gallons', value: 20 / 3.78541 },
      ingredients: {
        ...reference().ingredients,
        fermentables: [{ ...reference().ingredients.fermentables[0], amount: { unit: 'pounds', value: 5 / 0.453592 } }],
        hops: [{ ...reference().ingredients.hops[0], amount: { unit: 'ounces', value: 30 / 28.3495 } }],
      },
    }));
    expect(imperial.og).toBeCloseTo(metric.og, 4);
    expect(imperial.color).toBeCloseTo(metric.color, 2);
    expect(imperial.ibu).toBe(metric.ibu);
  });

  it('ignores dry hops for bitterness', () => {
    const r = reference();
    r.ingredients.hops = [{ ...r.ingredients.hops[0], use: 'dry_hop', time: { unit: 'days', value: 3 } }];
    expect(calculateRecipeStats(r).ibu).toBe(0);
  });

  it('uses alpha overrides when given', () => {
    expect(calculateRecipeStats(reference(), { EKG: 10 }).ibu).toBe(32);
  });

  it('copes with an empty recipe', () => {
    const s = calculateRecipeStats(reference({ ingredients: { fermentables: [], hops: [], cultures: [] } }));
    expect(s.og).toBe(1);
    expect(s.abv).toBe(0);
    expect(s.ibu).toBe(0);
  });
});

const hop = (extra: Partial<Recipe['ingredients']['hops'][number]>) => {
  const r = reference();
  r.ingredients.hops = [{ ...r.ingredients.hops[0], ...extra }];
  return calculateRecipeStats(r).ibu;
};

describe('calculateRecipeStats: sugars and mash', () => {
  // Tripel-like: the reference malt plus 1 kg candi sugar (potential 1.046)
  const withSugar = () => {
    const r = reference();
    r.ingredients.fermentables.push({ name: 'Candi sugar', type: 'sugar', amount: { unit: 'kilograms', value: 1 }, yield: { potential: { value: 1.046 } }, color: { value: 1 } });
    return r;
  };

  it('gives sugar its full extract, not the brewhouse efficiency', () => {
    expect(calculateRecipeStats(withSugar()).og).toBeCloseTo(1.0771, 4);
  });

  it('lets sugar ferment completely', () => {
    const s = calculateRecipeStats(withSugar());
    expect(s.fg).toBeCloseTo(1.0145, 4); // same FG as without the sugar
    expect(s.abv).toBeCloseTo(8.22, 2);
  });

  it('treats lactose as unfermentable', () => {
    const r = withSugar();
    r.ingredients.fermentables[1].name = 'Lactose';
    expect(calculateRecipeStats(r).fg).toBeCloseTo(1.0145 + 0.0192, 4); // all 19.2 points stay
  });

  it('adjusts attenuation to the main mash rest', () => {
    const mashAt = (temp: number) => calculateRecipeStats(reference({
      mash: { name: 'test', steps: [
        { name: 'Protein', type: 'infusion', temperature: 52, duration: 15 },
        { name: 'Sacch', type: 'infusion', temperature: temp, duration: 60 },
        { name: 'Mash out', type: 'temperature', temperature: 78, duration: 10 },
      ] },
    })).fg;
    expect(mashAt(66)).toBeCloseTo(1.0145, 4);
    expect(mashAt(68)).toBeCloseTo(1.0156, 4); // 2 points less attenuation
    expect(mashAt(60)).toBeCloseTo(1.0116, 4); // capped at 5 points more
  });

  it('finds the main rest, also in legacy step fields', () => {
    expect(mainMashTemperature(reference({ mash: { name: 'x', steps: [{ name: 'a', type: 'infusion', step_temp: 67, step_time: 60 }] } }))).toBe(67);
    expect(mainMashTemperature(reference())).toBeUndefined();
  });
});

describe('calculateRecipeStats: hops', () => {
  it('uses pellets as the default and 10 % less for leaf hops', () => {
    expect(hop({})).toBe(16);
    expect(hop({ form: 'pellet' })).toBe(16);
    expect(hop({ form: 'leaf' })).toBe(15); // 14.5
  });

  it('gives first wort hops 10 % extra and mash hops 20 % of a full boil', () => {
    expect(hop({ use: 'first_wort' })).toBe(18);                        // 17.7
    expect(hop({ use: 'first_wort', time: { unit: 'minutes', value: 0 } })).toBe(18); // falls back to the boil time
    expect(hop({ use: 'mash', time: { unit: 'minutes', value: 45 } })).toBe(3); // 3.2
  });

  it('scales whirlpool bitterness with temperature', () => {
    expect(hopTemperatureFactor(100)).toBeCloseTo(1, 5);
    expect(hopTemperatureFactor(80)).toBeCloseTo(0.227, 3);
    expect(hop({ use: 'whirlpool', time: { unit: 'minutes', value: 20 } })).toBe(3);                   // 80 °C default: 2.9
    expect(hop({ use: 'whirlpool', time: { unit: 'minutes', value: 20 }, temperature: 95 })).toBe(8);  // 7.6
    expect(hop({ use: 'aroma' as any, time: { unit: 'minutes', value: 20 } })).toBe(3);               // BeerXML "Aroma"
    expect(hop({ use: 'whirlpool', time: { unit: 'minutes', value: 0 } })).toBe(0);
  });
});

describe('fermentable types', () => {
  it('normalizes BeerXML spellings', () => {
    expect(normalizeFermentableType('Dry Extract')).toBe('dry_extract');
    expect(normalizeFermentableType('Sugar')).toBe('sugar');
    expect(normalizeFermentableType('Liquid Extract')).toBe('extract');
    expect(normalizeFermentableType(undefined)).toBe('grain');
    expect(normalizeFermentableType('unknown')).toBe('grain');
  });

  it('guesses the type from a name', () => {
    expect(guessFermentableType('Kandijsuiker donker')).toBe('sugar');
    expect(guessFermentableType('Honing')).toBe('sugar');
    expect(guessFermentableType('Extra Light DME')).toBe('dry_extract');
    expect(guessFermentableType('Pilsner LME')).toBe('extract');
    expect(guessFermentableType('Pale Ale Malt')).toBe('grain');
    expect(guessFermentableType('Extra Pale Malt')).toBe('grain');
  });
});

describe('calculateABV', () => {
  it('uses (OG - FG) x 131.25', () => expect(calculateABV(1.050, 1.010, false)).toBeCloseTo(5.25, 5));
  it('returns 0 when FG is not below OG', () => expect(calculateABV(1.010, 1.010, false)).toBe(0));
  it('adds priming sugar after bottling (0.065 % per g/L)', () =>
    expect(calculateABV(1.050, 1.010, true, 120, 20)).toBeCloseTo(5.25 + 6 * 0.065, 5));
});

describe('calculatePrimingSugar', () => {
  it('matches the reference for 20 L at 20 °C, 2.4 vol', () => {
    expect(calculatePrimingSugar(2.4, 20, 20, 'table_sugar')).toBe(124);
    expect(calculatePrimingSugar(2.4, 20, 20, 'glucose')).toBe(142);
    expect(calculatePrimingSugar(2.4, 20, 20, 'dme')).toBe(173);
  });
  it('returns 0 for no volume', () => expect(calculatePrimingSugar(2.4, 0, 20, 'table_sugar')).toBe(0));
});

describe('rounding', () => {
  it('roundTo removes floating-point noise', () => {
    expect(roundTo(63.785999999999994, 0)).toBe(64);
    expect(roundTo(1.0531356220799766, 3)).toBe(1.053);
    expect(roundTo(1.005, 2)).toBe(1.01);
  });

  it('roundByUnit follows the agreed decimals per unit', () => {
    expect(roundByUnit(2.041164, 'kilograms')).toBe(2.041);
    expect(roundByUnit(63.786, 'grams')).toBe(64);
    expect(roundByUnit(19.684255, 'liters')).toBe(19.7);
    expect(roundByUnit(4.4999999, 'pounds')).toBe(4.5);
    expect(roundByUnit(0.2499999, 'oz')).toBe(0.25);
    expect(roundByUnit(5.21234, 'gallons')).toBe(5.21);
    expect(roundByUnit(1.23456, 'ml')).toBe(1.23); // unknown unit: 2 decimals
  });

  it('normalizeRecipe rounds a BeerXML-converted recipe', () => {
    const r = normalizeRecipe(reference({
      batch_size: { unit: 'liters', value: 19.684255 },
      specifications: { og: { value: 1.0531356220799766 }, fg: { value: 1.0148779741823934 }, abv: { value: 5.021316286557785 }, ibu: { value: 34.6 }, color: { value: 7.039866443455376 } },
    }));
    expect(r.batch_size.value).toBe(19.7);
    expect(r.specifications).toEqual({ og: { value: 1.053 }, fg: { value: 1.015 }, abv: { value: 5 }, ibu: { value: 35 }, color: { value: 7 } });
  });

  it('normalizeRecipe leaves the input untouched', () => {
    const input = reference({ batch_size: { unit: 'liters', value: 19.684255 } });
    normalizeRecipe(input);
    expect(input.batch_size.value).toBe(19.684255);
  });
});

describe('formatting', () => {
  it('uses a decimal comma in Dutch and a point in English', () => {
    expect(formatBrewNumber(2.041164, 'kg', 'nl', { units: 'metric' } as any)).toBe('2,041');
    expect(formatBrewNumber(2.041164, 'kg', 'en', { units: 'metric' } as any)).toBe('2.041');
  });

  it('converts and rounds for imperial display', () => {
    const imp = { units: 'imperial' } as any;
    expect(formatBrewNumber(20, 'vol', 'en', imp, 'liters')).toBe('5.28');
    expect(formatBrewNumber(66.6, 'temp', 'en', imp)).toBe('152');
  });

  it('shows EBC when chosen', () => {
    expect(srmToEbc(10)).toBeCloseTo(19.7, 5);
    expect(formatBrewNumber(10, 'color', 'nl', { colorScale: 'ebc' } as any)).toBe('19,7');
  });

  it('formats stock in its own unit', () => {
    expect(formatStockAmount(1.2345678, 'kg', 'nl')).toBe('1,235');
    expect(formatStockAmount(250.4, 'g', 'nl')).toBe('250');
  });

  it('shows a dash for missing values', () => expect(formatBrewNumber(undefined, 'og', 'nl')).toBe('-'));
});

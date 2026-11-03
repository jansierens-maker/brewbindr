import { describe, it, expect } from 'vitest';
import {
  calculateABV, calculatePrimingSugar, calculateRecipeStats,
  hopTemperatureFactor, normalizeFermentableType, guessFermentableType, mainMashTemperature,
  sgToPlato, platoToSg, formatGravity, correctHydrometer, buGuRatio,
  brixToSg, sgToBrix, refractometerFg, kegPressure,
  pitchRate, cellsNeeded, liquidViability, starterGrowth, starterFor, DRY_CELLS_PER_GRAM,
  waterPlan, resolveEquipment,
  roundTo, roundByUnit, normalizeRecipe, normalizeLibraryItem, formatBrewNumber, formatStockAmount, srmToEbc,
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
    expect(s.abv).toBeCloseTo(5.89, 2);
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
    expect(s.abv).toBeCloseTo(8.72, 2);
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
  it('uses the precise (alternate) formula', () => {
    expect(calculateABV(1.050, 1.010, false)).toBeCloseTo(5.34, 2);
    expect(calculateABV(1.080, 1.012, false)).toBeCloseTo(9.49, 2);
    expect(calculateABV(1.100, 1.020, false)).toBeCloseTo(11.58, 2);
  });
  it('returns 0 when FG is not below OG', () => expect(calculateABV(1.010, 1.010, false)).toBe(0));
  it('adds priming sugar after bottling (0.065 % per g/L)', () =>
    expect(calculateABV(1.050, 1.010, true, 120, 20)).toBeCloseTo(5.3394 + 6 * 0.065, 3));
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

describe('gravity units', () => {
  it('converts SG to Plato and back', () => {
    expect(sgToPlato(1.050)).toBeCloseTo(12.39, 2);
    expect(sgToPlato(1.000)).toBeCloseTo(0, 1);
    expect(sgToPlato(1.080)).toBeCloseTo(19.32, 1);
    for (const sg of [1.010, 1.050, 1.080, 1.110]) expect(platoToSg(sgToPlato(sg))).toBeCloseTo(sg, 3);
  });

  it('formats in the chosen unit', () => {
    expect(formatGravity(1.050, 'nl')).toBe('1,050');
    expect(formatGravity(1.050, 'nl', 'plato')).toBe('12,4 °P');
    expect(formatGravity(1.050, 'en', 'both')).toBe('1.050 (12.4 °P)');
    expect(formatGravity(undefined, 'nl', 'plato')).toBe('-');
  });
});

describe('hydrometer correction', () => {
  it('leaves a reading at the calibration temperature unchanged', () =>
    expect(correctHydrometer(1.050, 20)).toBeCloseTo(1.050, 5));
  it('corrects warm and cold readings', () => {
    expect(correctHydrometer(1.050, 30)).toBeCloseTo(1.0526, 4); // warm wort reads low
    expect(correctHydrometer(1.050, 60)).toBeCloseTo(1.0659, 4);
    expect(correctHydrometer(1.050, 10)).toBeCloseTo(1.0485, 4); // cold wort reads high
  });
  it('matches the common table (1.050 at 100 °F, calibrated at 60 °F: 1.0561)', () =>
    expect(correctHydrometer(1.050, (100 - 32) * 5 / 9, (60 - 32) * 5 / 9)).toBeCloseTo(1.0561, 4));
  it('supports another calibration temperature', () =>
    expect(correctHydrometer(1.050, 15.56, 15.56)).toBeCloseTo(1.050, 5));
});

describe('BU:GU', () => {
  it('divides IBU by gravity points', () => {
    expect(buGuRatio(30, 1.060)).toBeCloseTo(0.5, 5);
    expect(buGuRatio(30, 1.000)).toBe(0);
  });
});

describe('refractometer', () => {
  it('converts Brix to SG with the wort correction factor', () => {
    expect(brixToSg(12.39, 1)).toBeCloseTo(1.050, 3);
    expect(brixToSg(12.89)).toBeCloseTo(1.050, 3); // 12.89 / 1.04 = 12.39 °P
    expect(sgToBrix(brixToSg(15))).toBeCloseTo(15, 1);
  });

  it('corrects a fermenting reading for alcohol (Terrill)', () => {
    expect(refractometerFg(12, 6, 1)).toBeCloseTo(1.0117, 4);
    expect(refractometerFg(12, 12, 1)).toBeGreaterThan(1.040); // nothing fermented yet
    expect(refractometerFg(12.48, 6.24)).toBeCloseTo(1.0117, 4); // same reading with WCF 1.04
  });
});

describe('keg carbonation', () => {
  it('matches the usual carbonation chart', () => {
    expect(kegPressure(2.5, (38 - 32) * 5 / 9).psi).toBeCloseTo(11.2, 1); // chart: 2.5 vol at 38 °F ≈ 11 psi
    expect(kegPressure(2.5, (40 - 32) * 5 / 9).psi).toBeCloseTo(12.3, 1); // chart: 2.5 vol at 40 °F ≈ 12 psi
    expect(kegPressure(2.5, 4).bar).toBeCloseTo(0.82, 2);
    expect(kegPressure(2.5, 10).bar).toBeGreaterThan(kegPressure(2.5, 4).bar); // warmer needs more pressure
  });
  it('never returns a negative pressure', () => expect(kegPressure(1, 0).psi).toBe(0));
});

describe('yeast pitching', () => {
  it('uses the usual pitch rates', () => {
    expect(pitchRate('ale', 1.050)).toBe(0.75);
    expect(pitchRate('ale', 1.075)).toBe(1.0);
    expect(pitchRate('lager', 1.048)).toBe(1.5);
    expect(pitchRate('lager', 1.070)).toBe(2.0);
  });

  it('computes the cells needed', () => {
    // 20 L at 12 °P, 0.75 M/ml/°P = 180 billion
    expect(cellsNeeded(platoToSg(12), 20, 0.75)).toBeCloseTo(180, 0);
    expect(cellsNeeded(1, 20, 0.75)).toBe(0);
  });

  it('lowers liquid yeast viability with age', () => {
    const today = new Date('2026-11-01');
    expect(liquidViability('2026-11-01', today)).toBe(1);
    expect(liquidViability('2026-10-02', today)).toBeCloseTo(0.79, 2); // 30 days
    expect(liquidViability('2026-01-01', today)).toBe(0);
    expect(liquidViability(undefined, today)).toBe(1);
  });

  it('grows cells in a stir-plate starter (Troester)', () => {
    // 100 B in 1 L of 1.036: 93 g extract, 1.07 B/g < 1.4, so +1.4 B per gram
    expect(starterGrowth(100, 1)).toBeCloseTo(100 + 1.4 * 93.2, 0);
    // crowded: 300 B in 0.5 L (6.4 B/g) does not grow
    expect(starterGrowth(300, 0.5)).toBe(300);
  });

  it('picks the smallest starter that is enough', () => {
    expect(starterFor(100, 178)).toBe(1);   // one fresh pack for a 20 L ale of 1.048
    expect(starterFor(100, 90)).toBe(0.5);
    expect(starterFor(10, 2000)).toBeUndefined(); // needs a step starter
  });
});

describe('dry yeast dose', () => {
  it('one 11.5 g sachet is enough for 20 L of 1.050 ale, as the makers advise', () =>
    expect(11.5 * DRY_CELLS_PER_GRAM).toBeGreaterThanOrEqual(cellsNeeded(1.050, 20, pitchRate('ale', 1.050))));
});

describe('mash rounding', () => {
  it('rounds BeerXML Fahrenheit leftovers in a recipe mash', () => {
    const r = normalizeRecipe(reference({
      mash: { name: 'Single infusion', grain_temp: 22.222222, sparge_temp: 75.555556, steps: [
        { name: 'Sacch', type: 'infusion', step_temp: 65.555556, step_time: 60.000001, infuse_amount: 14.195294 },
        { name: 'Out', type: 'temperature', temperature: 75.555556, duration: 9.9999, end_temp: 76.111111 },
      ] },
    }));
    expect(r.mash).toMatchObject({ grain_temp: 22.2, sparge_temp: 75.6, steps: [
      { step_temp: 65.6, step_time: 60, infuse_amount: 14.2 },
      { temperature: 75.6, duration: 10, end_temp: 76.1 },
    ] });
  });

  it('rounds library mash profiles and leaves other items alone', () => {
    const profile: any = { id: 'm', name: 'Step', type: 'mash_profile', steps: [{ name: 'a', type: 'infusion', step_temp: 64.444444, step_time: 45 }] };
    expect(normalizeLibraryItem(profile).steps?.[0].step_temp).toBe(64.4);
    const hop: any = { id: 'h', name: 'Saaz', type: 'hop', alpha: 3.333333 };
    expect(normalizeLibraryItem(hop)).toBe(hop);
  });

  it('leaves a recipe without mash untouched', () => expect(normalizeRecipe(reference()).mash).toBeUndefined());
});

describe('water plan', () => {
  // Like the Brewie in production: two vessels, 2 L trub/chiller loss, 2 L/h evaporation
  const brewie: any = { id: 'eq1', name: 'Brewie', type: 'equipment', equipment_type: 'two_vessel', trub_chiller_loss: 2, evap_rate: 2, top_up_water: 0 };
  const withMash = () => reference({ mash: { name: 'Single', steps: [{ name: 'Sacch', type: 'infusion', step_temp: 66, step_time: 60, infuse_amount: 15 }] } });

  it('adds the installation losses to the batch', () => {
    const w = waterPlan(reference(), brewie, 1.0579);
    expect(w.postBoilL).toBe(22);           // 20 L + 2 L trub
    expect(w.preBoilL).toBe(24);            // + 2 L/h × 60 min
    expect(w.totalWaterL).toBe(29);         // + 5 kg × 1 L/kg absorption
    expect(w.mashWaterL).toBe(15);          // no mash given: 3 L/kg
    expect(w.spargeWaterL).toBe(14);
    expect(w.preBoilSg).toBeCloseTo(1.0531, 4);
  });

  it('uses the recipe infusion and computes the strike temperature', () => {
    const w = waterPlan(withMash(), brewie, 1.0579);
    expect(w.mashWaterL).toBe(15);
    expect(w.strikeTempC).toBeCloseTo(66 + 0.41 / 3 * (66 - 20), 5); // 72.3 °C
  });

  it('mashes with all water in a BIAB kettle', () => {
    const w = waterPlan(withMash(), { ...brewie, equipment_type: 'biab' }, 1.0579);
    expect(w.totalWaterL).toBeCloseTo(24 + 5 * 0.7, 5);
    expect(w.mashWaterL).toBe(w.totalWaterL);
    expect(w.spargeWaterL).toBe(0);
    expect(w.strikeTempC).toBeLessThan(70); // thin mash needs less overheating
  });

  it('counts only mashed fermentables as grain', () => {
    const r = reference();
    r.ingredients.fermentables.push({ name: 'Sugar', type: 'sugar', amount: { unit: 'kilograms', value: 1 } });
    expect(waterPlan(r, brewie).grainKg).toBe(5);
  });

  it('subtracts top-up water and adds lauter dead space', () => {
    const w = waterPlan(reference(), { ...brewie, top_up_water: 4, lauter_deadspace: 1 });
    expect(w.postBoilL).toBe(18);
    expect(w.totalWaterL).toBe(18 + 2 + 5 + 1);
  });

  it('picks the named installation, or the only one', () => {
    const lib: any[] = [brewie, { id: 'h', type: 'hop', name: 'Saaz' }];
    expect(resolveEquipment({}, lib)?.id).toBe('eq1');
    expect(resolveEquipment({ equipmentId: 'eq1' }, lib)?.id).toBe('eq1');
    expect(resolveEquipment({}, [...lib, { ...brewie, id: 'eq2' }])).toBeUndefined();
    expect(resolveEquipment({}, [])).toBeUndefined();
  });

  it('uses the average boil gravity for IBU when the installation is known', () => {
    const plain = calculateRecipeStats(reference());
    const withEquipment = calculateRecipeStats(reference(), undefined, { ...brewie, evap_rate: 6 });
    expect(withEquipment.og).toBe(plain.og);
    expect(withEquipment.ibu).toBeGreaterThan(plain.ibu); // thinner wort while boiling: more bitterness
  });
});

describe('water plan: capacity, own values and drain all', () => {
  // Stored before the capacity fields existed: capacity comes from the Brewie preset
  const brewie: any = { id: 'eq1', name: 'Brewie', type: 'equipment', preset: 'Brewie', equipment_type: 'two_vessel', trub_chiller_loss: 2, evap_rate: 2 };
  const withGrain = (kg: number) => {
    const r = reference();
    r.ingredients.fermentables[0] = { ...r.ingredients.fermentables[0], amount: { unit: 'kilograms', value: kg } };
    return r;
  };

  it('limits the mash water to what fits next to the grain and sparges the rest', () => {
    const w = waterPlan(withGrain(6), brewie, 1.06);
    expect(w.maxMashL).toBe(16);               // 22 L − 6 kg × 1 L/kg
    expect(w.mashWaterL).toBe(16);             // 18 L wanted (3 L/kg)
    expect(w.spargeWaterL).toBe(14);           // 30 L total
    expect(w.warnings).toContain('mash_capped');
    expect(w.warnings).toContain('boil_over_capacity'); // 24 L before the boil, the tank takes 23
  });

  it('warns when the grain leaves too little room for water', () => {
    expect(waterPlan(withGrain(9), brewie).warnings).toContain('too_much_grain'); // 13 L for 9 kg
  });

  it('follows water set by hand (as entered in Brewie Studio)', () => {
    const r = { ...withGrain(4), water: { mash_l: 17.8, sparge_l: 8.2 } };
    const w = waterPlan(r, brewie, 1.05);
    expect(w.manual).toBe(true);
    expect(w.totalWaterL).toBeCloseTo(26, 5);
    expect(w.preBoilL).toBeCloseTo(22, 5);     // − 4 kg × 1 L/kg absorbed
    expect(w.postBoilL).toBeCloseTo(20, 5);    // − 2 L evaporation
    expect(w.intoFermenterL).toBeCloseTo(18, 5); // − 2 L trub
    expect(w.expectedOg).toBeCloseTo(1 + 0.05 * 22 / 20, 5); // recipe planned 22 L after the boil
    expect(w.warnings).toEqual([]);
  });

  it('flags own mash water that does not fit', () => {
    expect(waterPlan({ ...withGrain(4), water: { mash_l: 20 } }, brewie).warnings).toContain('mash_over_capacity');
  });

  it('drains everything into the fermenter when asked', () => {
    const normal = waterPlan(withGrain(4), brewie);
    const drained = waterPlan({ ...withGrain(4), water: { drain_all: true } }, brewie);
    expect(drained.trubLossL).toBe(0);
    expect(drained.totalWaterL).toBeCloseTo(normal.totalWaterL - 2, 5);
  });

  it('uses the installation fields over the preset, and 0.7 L/kg by default', () => {
    const own = { ...brewie, preset: undefined, mash_capacity: 30 };
    expect(waterPlan(withGrain(5), own).maxMashL).toBeCloseTo(30 - 5 * 0.7, 5);
    expect(waterPlan(withGrain(5), { ...brewie, preset: undefined }).maxMashL).toBeUndefined(); // no limit known
  });
});

describe('recipe stats follow water set by hand', () => {
  const brewie: any = { id: 'eq1', name: 'Brewie', type: 'equipment', preset: 'Brewie', equipment_type: 'two_vessel', trub_chiller_loss: 2, evap_rate: 2 };

  it('makes stronger, darker and more bitter wort with less water', () => {
    const planned = calculateRecipeStats(reference(), undefined, brewie);
    // Calculated: 29 L water, 22 L after the boil. Own: 24 L → 17 L after the boil
    const less = calculateRecipeStats({ ...reference(), water: { mash_l: 14, sparge_l: 10 } }, undefined, brewie);
    expect(less.plannedOg).toBeCloseTo(planned.og, 6);
    expect(less.og - 1).toBeCloseTo((planned.og - 1) * 22 / 17, 4);
    expect(less.abv).toBeGreaterThan(planned.abv);
    expect(less.color).toBeGreaterThan(planned.color);
    expect(less.ibu).toBeGreaterThan(planned.ibu);
  });

  it('matches the water card', () => {
    const r = { ...reference(), water: { mash_l: 14, sparge_l: 10 } };
    const s = calculateRecipeStats(r, undefined, brewie);
    expect(waterPlan(r, brewie, s.plannedOg).expectedOg).toBeCloseTo(s.og, 6);
  });

  it('changes nothing without water set by hand or without an installation', () => {
    expect(calculateRecipeStats(reference(), undefined, brewie).og).toBeCloseTo(calculateRecipeStats(reference()).og, 6);
    expect(calculateRecipeStats({ ...reference(), water: { mash_l: 14 } }).og).toBeCloseTo(calculateRecipeStats(reference()).og, 6);
  });
});

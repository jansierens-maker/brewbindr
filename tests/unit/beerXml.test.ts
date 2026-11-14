// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseBeerXml } from '../../services/beerXmlService';
import { exportToBeerXml } from '../../services/beerXmlExportService';
import { calculateRecipeStats } from '../../services/calculations';
import { isSameWater, waterAgentEntry, withWaterLinks } from '../../services/beerXmlWater';
import { LibraryIngredient } from '../../types';

// BeerXML stores kg, kg (hops) and litres; typical exports carry conversion noise.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>Test Bitter</NAME>
    <TYPE>All Grain</TYPE>
    <BREWER>Tester</BREWER>
    <BATCH_SIZE>19.684255</BATCH_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>72</EFFICIENCY>
    <EST_OG>1.0531356220799766</EST_OG>
    <EST_FG>1.0148779741823934</EST_FG>
    <IBU>34.6</IBU>
    <FERMENTABLES>
      <FERMENTABLE><NAME>Pale Malt (2 Row) UK</NAME><TYPE>Grain</TYPE><AMOUNT>4.082328</AMOUNT><YIELD>78</YIELD><COLOR>3</COLOR></FERMENTABLE>
      <FERMENTABLE><NAME>Light DME</NAME><TYPE>Dry Extract</TYPE><AMOUNT>0.5</AMOUNT><COLOR>4</COLOR></FERMENTABLE>
    </FERMENTABLES>
    <HOPS>
      <HOP><NAME>Goldings, East Kent</NAME><ALPHA>5</ALPHA><AMOUNT>0.063786</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP>
      <HOP><NAME>Fuggle</NAME><ALPHA>4.5</ALPHA><AMOUNT>0.02</AMOUNT><USE>Aroma</USE><TIME>15</TIME><FORM>Leaf</FORM></HOP>
      <HOP><NAME>Northern Brewer</NAME><ALPHA>8</ALPHA><AMOUNT>0.01</AMOUNT><USE>First Wort</USE><TIME>60</TIME><FORM>Pellet</FORM></HOP>
    </HOPS>
    <YEASTS>
      <YEAST><NAME>London Ale</NAME><TYPE>Ale</TYPE><FORM>Liquid</FORM><ATTENUATION>73</ATTENUATION></YEAST>
    </YEASTS>
  </RECIPE>
</RECIPES>`;

describe('parseBeerXml', () => {
  const result = parseBeerXml(xml);
  const recipe = result.recipes[0];

  it('reads the recipe and its ingredients', () => {
    expect(result.recipes).toHaveLength(1);
    expect(recipe.name).toBe('Test Bitter');
    expect(recipe.ingredients.fermentables[0].name).toBe('Pale Malt (2 Row) UK');
    expect(recipe.ingredients.hops[0].name).toBe('Goldings, East Kent');
    expect(recipe.ingredients.cultures[0].name).toBe('London Ale');
  });

  it('rounds imported values to the agreed decimals', () => {
    expect(recipe.batch_size.value).toBe(19.7);
    expect(recipe.ingredients.fermentables[0].amount).toEqual({ unit: 'kilograms', value: 4.082 });
    expect(recipe.ingredients.hops[0].amount).toEqual({ unit: 'grams', value: 64 });
    expect(recipe.specifications?.og?.value).toBe(1.053);
    expect(recipe.specifications?.ibu?.value).toBe(35);
  });

  it('reads fermentable types, hop use and hop form', () => {
    expect(recipe.ingredients.fermentables.map(f => f.type)).toEqual(['grain', 'dry_extract']);
    expect(recipe.ingredients.hops.map(h => [h.use, h.form])).toEqual([
      ['boil', undefined], ['whirlpool', 'leaf'], ['first_wort', 'pellet'],
    ]);
  });

  it('returns an empty result for XML without recipes', () => {
    expect(parseBeerXml('<RECIPES></RECIPES>').recipes).toHaveLength(0);
  });
});

describe('exportToBeerXml', () => {
  it('keeps types, hop use and form, and converts imperial amounts to kg', () => {
    const original = parseBeerXml(xml).recipes[0];
    original.ingredients.fermentables[1] = { ...original.ingredients.fermentables[1], amount: { unit: 'pounds', value: 1 } };
    const again = parseBeerXml(exportToBeerXml(original)).recipes[0];
    expect(again.ingredients.fermentables.map(f => f.type)).toEqual(['grain', 'dry_extract']);
    expect(again.ingredients.fermentables[1].amount).toEqual({ unit: 'kilograms', value: 0.454 });
    expect(again.ingredients.hops.map(h => [h.use, h.form])).toEqual([
      ['boil', 'pellet'], ['whirlpool', 'leaf'], ['first_wort', 'pellet'],
    ]);
  });
});

describe('exportToBeerXml: a complete recipe', () => {
  const original = parseBeerXml(xml).recipes[0];
  original.notes = 'Brew notes & "quotes"';
  original.ingredients.cultures = [
    { name: 'London Ale', type: 'ale', form: 'liquid', attenuation: 73 },
    { name: 'SafLager W-34/70', type: 'lager', form: 'dry', attenuation: 83, amount: { unit: 'grams', value: 11.5 } },
  ];
  original.ingredients.miscellaneous = [{ name: 'Irish Moss', type: 'fining', use: 'boil', amount: { unit: 'grams', value: 5 }, time: { unit: 'minutes', value: 15 } }];
  original.mash = {
    name: 'Step mash', grain_temp: 18, sparge_temp: 78, ph: 5.4, notes: 'Stir well',
    steps: [
      { name: 'Eiwitrust', type: 'infusion', temperature: 52, duration: 10, infuse_amount: 15 },
      { name: 'Versuikering', type: 'temperature', step_temp: 66.5, step_time: 60, ramp_time: 10 },
      { name: 'Uitmaischen', type: 'temperature', temperature: 78, duration: 10, end_temp: 78 },
    ],
  };
  const out = exportToBeerXml(original);
  const again = parseBeerXml(out).recipes[0];

  it('keeps the yeasts', () => {
    expect(again.ingredients.cultures.map(c => [c.name, c.type, c.form, c.attenuation])).toEqual([
      ['London Ale', 'ale', 'liquid', 73],
      ['SafLager W-34/70', 'lager', 'dry', 83],
    ]);
  });

  it('keeps the mash schedule', () => {
    const steps = again.mash!.steps.map(st => [st.name, st.type, st.temperature ?? st.step_temp, st.duration ?? st.step_time, st.infuse_amount, st.ramp_time, st.end_temp]);
    expect(steps).toEqual([
      ['Eiwitrust', 'infusion', 52, 10, 15, undefined, undefined],
      ['Versuikering', 'temperature', 66.5, 60, undefined, 10, undefined],
      ['Uitmaischen', 'temperature', 78, 10, undefined, undefined, 78],
    ]);
    expect(again.mash).toMatchObject({ name: 'Step mash', grain_temp: 18, sparge_temp: 78, ph: 5.4, notes: 'Stir well' });
  });

  it('keeps the notes and the misc, in the standard MISCS container', () => {
    expect(again.notes).toBe('Brew notes & "quotes"');
    expect(out).toContain('<MISCS>');
    expect(out).not.toContain('MISCELLANEOUS');
    expect(again.ingredients.miscellaneous?.map(m => m.name)).toEqual(['Irish Moss']);
  });

  it('writes the calculated values (OG, FG, ABV, IBU, colour in SRM)', () => {
    const stats = calculateRecipeStats(original);
    expect(again.specifications).toEqual({
      og: { value: Number(stats.og.toFixed(3)) },
      fg: { value: Number(stats.fg.toFixed(3)) },
      abv: { value: Number(stats.abv.toFixed(1)) },
      ibu: { value: stats.ibu },
      color: { value: Number(stats.color.toFixed(1)) },
    });
    expect(again.specifications?.og?.value).toBeGreaterThan(1.03);
    expect(again.specifications?.ibu?.value).toBeGreaterThan(0);
  });
});

// A recipe with its water inside the RECIPE (BrewBindr's WATER_KIND tag) and water agents
const recipeWithWater = (waters: string, miscs = '') => `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>Tripel Water</NAME>
    <TYPE>All Grain</TYPE>
    <BATCH_SIZE>20</BATCH_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>75</EFFICIENCY>
    <FERMENTABLES><FERMENTABLE><NAME>Pilsner</NAME><TYPE>Grain</TYPE><AMOUNT>6</AMOUNT><COLOR>2</COLOR></FERMENTABLE></FERMENTABLES>
    <HOPS/>
    <MISCELLANEOUS>${miscs}</MISCELLANEOUS>
    <WATERS>${waters}</WATERS>
    <NOTES>Recipe notes</NOTES>
  </RECIPE>
  <WATER><NAME>Global water</NAME><CALCIUM>10</CALCIUM></WATER>
</RECIPES>`;

const tap = '<WATER><NAME>Leidingwater Aalst</NAME><AMOUNT>30</AMOUNT><CALCIUM>60</CALCIUM><MAGNESIUM>6.8</MAGNESIUM><SODIUM>24.6</SODIUM><CHLORIDE>34</CHLORIDE><SULFATE>45</SULFATE><BICARBONATE>157</BICARBONATE><NOTES>Water notes</NOTES>__KIND__</WATER>';
const tripel = '<WATER><NAME>Tripel</NAME><CALCIUM>65</CALCIUM><MAGNESIUM>10</MAGNESIUM><SODIUM>10</SODIUM><CHLORIDE>60</CHLORIDE><SULFATE>60</SULFATE><BICARBONATE>25</BICARBONATE><WATER_KIND>target</WATER_KIND></WATER>';

describe('BeerXML water inside a recipe', () => {
  it('reads base water and target profile and links them to the recipe', () => {
    const result = parseBeerXml(recipeWithWater(tap.replace('__KIND__', '<WATER_KIND>base</WATER_KIND>') + tripel));
    const recipe = result.recipes[0];
    expect(result.recipeWaters.map(w => [w.recipeId === recipe.id, w.role, w.water.name, w.water.water_kind])).toEqual([
      [true, 'source', 'Leidingwater Aalst', 'base'],
      [true, 'target', 'Tripel', 'target'],
    ]);
    expect(result.recipeWaters[0].water).toMatchObject({ type: 'water', calcium: 60, magnesium: 6.8, bicarbonate: 157, notes: 'Water notes' });
    // Water outside the recipe stays a plain library item, as before
    expect(result.waters.map(w => w.name)).toEqual(['Global water']);
    // The recipe's own NOTES, not the water's
    expect(recipe.notes).toBe('Recipe notes');
  });

  it('treats a water without WATER_KIND as base water', () => {
    const result = parseBeerXml(recipeWithWater(tap.replace('__KIND__', '')));
    expect(result.recipeWaters).toHaveLength(1);
    expect(result.recipeWaters[0]).toMatchObject({ role: 'source', water: { water_kind: 'base' } });
  });

  it('imports a second base water as a plain library item', () => {
    const second = tap.replace('Leidingwater Aalst', 'Osmose').replace('__KIND__', '');
    const result = parseBeerXml(recipeWithWater(tap.replace('__KIND__', '') + second));
    expect(result.recipeWaters.map(w => w.water.name)).toEqual(['Leidingwater Aalst']);
    expect(result.waters.map(w => w.name)).toEqual(['Global water', 'Osmose']);
  });

  it('links the saved water ids into the water treatment', () => {
    const recipe = parseBeerXml(recipeWithWater(tap.replace('__KIND__', ''))).recipes[0];
    expect(withWaterLinks(recipe, { source: 'w1', target: 'w2' }).water_chem).toMatchObject({ source: 'w1', target: 'w2' });
    expect(withWaterLinks(recipe, undefined)).toBe(recipe);
  });

  it('recognises an identical water profile (name, kind and minerals)', () => {
    const w = parseBeerXml(recipeWithWater(tap.replace('__KIND__', ''))).recipeWaters[0].water;
    const existing = { ...w, id: 'x', name: ' leidingwater aalst ', status: 'private' } as LibraryIngredient;
    expect(isSameWater(existing, w)).toBe(true);
    expect(isSameWater({ ...existing, calcium: 61 }, w)).toBe(false);
    expect(isSameWater({ ...existing, water_kind: 'target' }, w)).toBe(false);
    expect(isSameWater({ ...existing, water_kind: undefined }, w)).toBe(true);
  });
});

const misc = (name: string, amount: number, type = 'Water Agent', isWeight = '') =>
  `<MISC><NAME>${name}</NAME><TYPE>${type}</TYPE><USE>Mash</USE><TIME>0</TIME><AMOUNT>${amount}</AMOUNT>${isWeight ? `<AMOUNT_IS_WEIGHT>${isWeight}</AMOUNT_IS_WEIGHT>` : ''}</MISC>`;

describe('BeerXML water agents', () => {
  it('moves recognised salts and lactic acid into the water treatment, once', () => {
    const recipe = parseBeerXml(recipeWithWater('', [
      misc('Gips (CaSO4)', 0.004, 'Water Agent', 'TRUE'),
      misc('Calcium Chloride', 0.002),
      misc('Gypsum', 0.001),
      misc('Epsom zout', 0.0015),
      misc('Keukenzout', 0.0005),
      misc('Baking soda', 0.001),
      misc('Melkzuur 80%', 0.003, 'Water Agent', 'FALSE'),
      misc('Irish Moss', 0.005, 'Fining'),
      misc('Calcium carbonate', 0.002),
    ].join(''))).recipes[0];
    expect(recipe.water_chem).toEqual({
      salts: { gypsum: 5, cacl2: 2, epsom: 1.5, nacl: 0.5, nahco3: 1 },
      cacl2_form: 'cacl2',
      lactic_ml: 3,
    });
    // Only what the water treatment does not hold stays a misc
    expect(recipe.ingredients.miscellaneous?.map(m => m.name)).toEqual(['Irish Moss', 'Calcium carbonate']);
  });

  it('recognises a calcium chloride solution and names in three languages', () => {
    expect(waterAgentEntry('CaCl2 33% oplossing')).toEqual({ salt: 'cacl2_33' });
    expect(waterAgentEntry('Calcium chloride', false)).toEqual({ salt: 'cacl2_33' });
    expect(waterAgentEntry('Calcium Chloride 36% solution')).toEqual({ salt: 'cacl2_36' });
    expect(waterAgentEntry('Chlorure de calcium')).toEqual({ salt: 'cacl2' });
    expect(waterAgentEntry('Sulfate de magnésium')).toEqual({ salt: 'epsom' });
    expect(waterAgentEntry('Natriumbicarbonaat')).toEqual({ salt: 'nahco3' });
    expect(waterAgentEntry('Acide lactique')).toEqual({ lactic: true });
    expect(waterAgentEntry('Sodium chloride')).toEqual({ salt: 'nacl' });
    expect(waterAgentEntry('Whirlfloc')).toBeUndefined();
  });
});

describe('BeerXML water round trip', () => {
  it('export then import gives the same water profiles and water treatment', () => {
    const library = [
      { id: 'w-tap', name: 'Leidingwater Aalst', type: 'water', status: 'private', calcium: 60, magnesium: 6.8, sodium: 24.6, chloride: 34, sulfate: 45, bicarbonate: 157, notes: 'Farys' },
      { id: 'w-target', name: 'Mijn tripel', type: 'water', status: 'private', water_kind: 'target', calcium: 65, magnesium: 10, sodium: 10, chloride: 60, sulfate: 60, bicarbonate: 25 },
    ] as LibraryIngredient[];
    const original = parseBeerXml(xml).recipes[0];
    original.ingredients.miscellaneous = [{ name: 'Irish Moss', type: 'fining', use: 'boil', amount: { unit: 'grams', value: 5 }, time: { unit: 'minutes', value: 15 } }];
    original.water_chem = {
      source: 'w-tap', target: 'w-target', dilution_pct: 30, target_ph: 5.3, cacl2_form: 'cacl2_33',
      salts: { gypsum: 4, cacl2_33: 2.5, epsom: 1 }, lactic_ml: 1.5,
    };

    const back = parseBeerXml(exportToBeerXml(original, library));
    const recipe = back.recipes[0];
    expect(back.recipeWaters.map(w => [w.role, w.water.name])).toEqual([['source', 'Leidingwater Aalst'], ['target', 'Mijn tripel']]);
    back.recipeWaters.forEach((w, i) => expect(isSameWater(library[i], w.water)).toBe(true));
    expect(back.recipeWaters[0].water.notes).toBe('Farys');

    // With the ids the import saved or reused, the water treatment is the original
    const linked = withWaterLinks(recipe, { source: 'w-tap', target: 'w-target' });
    expect(linked.water_chem).toEqual(original.water_chem);
    expect(recipe.ingredients.miscellaneous?.map(m => m.name)).toEqual(['Irish Moss']);
  });

  it('writes a water agent once when the treatment already holds it', () => {
    const recipe = parseBeerXml(xml).recipes[0];
    recipe.ingredients.miscellaneous = [{ name: 'Gypsum', type: 'water agent', use: 'mash', amount: { unit: 'grams', value: 2 }, time: { unit: 'minutes', value: 0 } }];
    recipe.water_chem = { salts: { gypsum: 4 } };
    const out = exportToBeerXml(recipe);
    expect(out.match(/<TYPE>Water Agent<\/TYPE>|<TYPE>water agent<\/TYPE>/g)).toHaveLength(1);
    expect(parseBeerXml(out).recipes[0].water_chem).toEqual({ salts: { gypsum: 4 } });
  });

  it('exports a preset reference with its minerals', () => {
    const recipe = { ...parseBeerXml(xml).recipes[0], water_chem: { target: 'preset:style_tripel' } };
    const back = parseBeerXml(exportToBeerXml(recipe));
    expect(back.recipeWaters).toHaveLength(1);
    expect(back.recipeWaters[0]).toMatchObject({ role: 'target', water: { name: 'Tripel', water_kind: 'target', calcium: 65 } });
  });
});

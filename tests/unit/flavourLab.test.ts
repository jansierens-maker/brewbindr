import { describe, expect, it } from 'vitest';
import kbJson from '../../data/flavour-lab.json';
import {
  FlavourKb, FlavourIngredient, nameKey, matchName, hopStage, miscStage, recipeProfile, recipeSuggestions,
  familyBars, ingredientContributions, kbIngredient, candidateGrams, addToRecipe, suggest, ingredientProfile,
  FAMILY_KEY,
} from '../../services/flavourLab';
import type { Recipe } from '../../types';

const kb = kbJson as unknown as FlavourKb;

type HopRow = [name: string, grams: number, use: string, minutes: number];
const recipe = (name: string, malts: [string, number][], hops: HopRow[], yeast: string, miscs: [string, number, string, number][] = []): Recipe => ({
  name, type: 'all_grain', author: '', batch_size: { unit: 'liters', value: 20 }, efficiency: { brewhouse: 72 },
  boil_time: { unit: 'minutes', value: 60 },
  ingredients: {
    fermentables: malts.map(([n, kg]) => ({ name: n, type: 'grain', amount: { unit: 'kilograms', value: kg } })),
    hops: hops.map(([n, g, use, t]) => ({ name: n, amount: { unit: 'grams', value: g }, use: use as never, time: { unit: 'minutes', value: t } })),
    cultures: [{ name: yeast, type: 'ale', form: 'dry' }],
    miscellaneous: miscs.map(([n, g, use, t]) => ({ name: n, type: 'spice', use, amount: { unit: 'grams', value: g }, time: { unit: 'minutes', value: t } })),
  },
});

// Reference recipes (spec §10): the expected top 3 is fixed here
// AC-01: Hallertau at the end of the boil (flame-out)
const witbier = recipe('Witbier', [['Pilsner Malt', 2.5], ['Wheat Malt', 2]],
  [['Magnum', 12, 'boil', 60], ['Hallertauer MF', 25, 'boil', 0]], 'LalBrew Wit');
const saison = recipe('Saison', [['Pilsner Malt', 4], ['Munich Malt', 0.5]],
  [['East Kent Goldings', 30, 'boil', 60], ['Saaz', 30, 'boil', 5]], 'LalBrew Belle Saison');
const stout = recipe('Stout', [['Maris Otter', 4], ['Roasted Barley', 0.4], ['Chocolate Malt', 0.3], ['Crystal 60', 0.3]],
  [['East Kent Goldings', 40, 'boil', 60]], 'SafAle US-05');
const weizen = recipe('Weizen', [['Pilsner Malt', 2], ['Wheat Malt', 2.5]],
  [['Magnum', 12, 'boil', 60], ['Hallertauer MF', 25, 'boil', 5]], 'SafAle WB-06');

const top = (r: Recipe, tab: 'spice' | 'yeast' | 'hop', n = 3) =>
  recipeSuggestions(kb, recipeProfile(r, kb), { lang: 'nl' })[tab].slice(0, n).map(s => s.ingredient.id);

describe('knowledge base', () => {
  it('every link has an existing source, ingredient and compound (AC-11)', () => {
    const sources = new Set(kb.sources.map(s => s.id));
    const ings = new Set(kb.ingredients.map(i => i.id));
    const compounds = new Set(kb.compounds.map(c => c.id));
    for (const l of kb.links) {
      expect(sources.has(l.source_id), `${l.ingredient_id}/${l.compound_id}`).toBe(true);
      expect(ings.has(l.ingredient_id)).toBe(true);
      expect(compounds.has(l.compound_id)).toBe(true);
      expect(l.intensity).toBeGreaterThanOrEqual(1);
      expect(l.intensity).toBeLessThanOrEqual(5);
    }
  });

  it('has names and descriptors in the three languages (AC-13)', () => {
    for (const f of kb.families) for (const k of ['name_nl', 'name_fr', 'name_en'] as const) expect(f[k]).toBeTruthy();
    for (const c of kb.compounds) for (const k of ['descriptor_nl', 'descriptor_fr', 'descriptor_en'] as const) expect(c[k]).toBeTruthy();
    for (const i of kb.ingredients) for (const k of ['name_nl', 'name_fr', 'name_en'] as const) expect(i[k]).toBeTruthy();
    for (const i of kb.ingredients) {
      const notes = [i.notes_nl, i.notes_fr, i.notes_en].filter(Boolean);
      expect(notes.length === 0 || notes.length === 3, i.id).toBe(true);
    }
  });

  it('gives spices a dose, a stage and a form', () => {
    for (const i of kb.ingredients.filter(x => x.category === 'spice')) {
      expect(i.dose_min_g_per_l, i.id).toBeGreaterThan(0);
      expect(i.dose_max_g_per_l!, i.id).toBeGreaterThanOrEqual(i.dose_min_g_per_l!);
      expect(i.preferred_stage, i.id).toBeTruthy();
      expect(['whole', 'crushed', 'zest', 'tincture']).toContain(i.form);
    }
  });
});

describe('matching recipe names', () => {
  it('ignores case, accents and punctuation', () => {
    expect(nameKey('Hallertau Mittelfrüh')).toBe('hallertau mittelfruh');
    expect(nameKey('  SafAle US-05 ')).toBe('safale us 05');
  });

  it('finds names, aliases and names inside longer names', () => {
    expect(matchName('Hallertauer MF', 'hop', kb)).toBe('hallertau_mittelfrueh');
    expect(matchName('Fermentis SafAle US-05', 'yeast', kb)).toBe('us05');
    expect(matchName('Hallertauer Magnum', 'hop', kb)).toBe('hallertau_magnum');
    expect(matchName('Koriander', 'spice', kb)).toBe('coriander');
    expect(matchName('Crystal 60', 'malt', kb)).toBe('malt_crystal');
    expect(matchName('Saaz', 'yeast', kb)).toBeUndefined(); // only within its category
    expect(matchName('Mystery hop', 'hop', kb)).toBeUndefined();
  });

  it('uses a manual link first, and null leaves the ingredient out (AC-12)', () => {
    const mappings = [
      { category: 'hop' as const, name_key: nameKey('Huisteelt Hallertau'), ingredient_id: 'hallertau_mittelfrueh' },
      { category: 'spice' as const, name_key: nameKey('Koriander'), ingredient_id: null },
    ];
    expect(matchName('Huisteelt Hallertau', 'hop', kb, mappings)).toBe('hallertau_mittelfrueh');
    expect(matchName('Koriander', 'spice', kb, mappings)).toBeNull();
    const r = recipe('X', [], [['Huisteelt Hallertau', 20, 'dry_hop', 3]], 'Onbekende gist');
    const p = recipeProfile(r, kb, mappings);
    expect(p.ingredientIds.has('hallertau_mittelfrueh')).toBe(true);
    expect(p.unmatched.map(u => u.name)).toEqual(['Onbekende gist']);
  });
});

describe('process stages (spec §7)', () => {
  it('maps hop use and time', () => {
    expect(hopStage({ use: 'boil', time: { unit: 'minutes', value: 60 } })).toBe('boil_long');
    expect(hopStage({ use: 'boil', time: { unit: 'minutes', value: 10 } })).toBe('boil_short');
    expect(hopStage({ use: 'boil', time: { unit: 'minutes', value: 0 } })).toBe('whirlpool');
    expect(hopStage({ use: 'whirlpool', time: { unit: 'minutes', value: 20 } })).toBe('whirlpool');
    expect(hopStage({ use: 'dry_hop', time: { unit: 'days', value: 4 } })).toBe('secondary');
    expect(hopStage({ use: 'first_wort', time: { unit: 'minutes', value: 60 } })).toBe('boil_long');
  });

  it('maps BeerXML misc use and time', () => {
    expect(miscStage({ use: 'Boil', time: { unit: 'minutes', value: 45 } })).toBe('boil_long');
    expect(miscStage({ use: 'boil', time: { unit: 'minutes', value: 5 } })).toBe('boil_short');
    expect(miscStage({ use: 'boil', time: { unit: 'minutes', value: 2 } })).toBe('whirlpool');
    expect(miscStage({ use: 'Primary', time: { unit: 'days', value: 0 } })).toBe('primary');
    expect(miscStage({ use: 'Secondary', time: { unit: 'days', value: 7 } })).toBe('secondary');
    expect(miscStage({ use: 'Bottling', time: { unit: 'days', value: 0 } })).toBe('bottling');
  });

  it('keeps under 10 % of a 60-minute hop’s floral terpenes compared with a dry hop (AC-03)', () => {
    const hop = kbIngredient(kb, 'citra')!;
    const floral = (stage: 'boil_long' | 'secondary') => familyBars(kb, ingredientContributions(kb, hop, stage, 1))
      .find(b => b.family.id === 'floral_terpene')!.total;
    expect(floral('boil_long') / floral('secondary')).toBeLessThan(0.1);
  });
});

describe('suggestions', () => {
  it('puts coriander in the witbier’s top 3 spices, with linalool as bridge (AC-01)', () => {
    const s = recipeSuggestions(kb, recipeProfile(witbier, kb), { lang: 'nl' }).spice;
    const coriander = s.slice(0, 3).find(x => x.ingredient.id === 'coriander');
    expect(coriander).toBeDefined();
    expect(coriander!.bridges.map(b => b.compound_id)).toContain('linalool');
  });

  it('shows clove phenols and suggests clove with a POF+ yeast (AC-02)', () => {
    const p = recipeProfile(weizen, kb);
    expect(familyBars(kb, p.contributions).some(b => b.family.id === 'clove_phenol' && b.total > 0)).toBe(true);
    const s = recipeSuggestions(kb, p, { lang: 'nl' }).spice;
    const clove = s.find(x => x.ingredient.id === 'clove');
    expect(clove).toBeDefined();
    expect(clove!.bridges.map(b => b.compound_id)).toContain(FAMILY_KEY + 'clove_phenol');
  });

  it('gives the expected top 3 for the reference recipes', () => {
    expect(top(witbier, 'spice')).toEqual(['grains_of_paradise', 'thyme', 'coriander']);
    expect(top(saison, 'spice')).toEqual(['allspice', 'thyme', 'clove']);
    expect(top(stout, 'spice', 3)).toEqual(['cacao_nibs', 'coffee']);
  });

  it('shows the dose for the batch, rounded (AC-04)', () => {
    const spice = { ...kbIngredient(kb, 'coriander')!, dose_min_g_per_l: 0.5, dose_max_g_per_l: 1 } as FlavourIngredient;
    expect(candidateGrams(spice, 20)).toBe(15);
    expect(candidateGrams({ ...spice, dose_min_g_per_l: 0.05, dose_max_g_per_l: 0.3 }, 20)).toBe(3.5);
    expect(candidateGrams({ ...spice, dose_min_g_per_l: 0.5, dose_max_g_per_l: 2 }, 23)).toBe(29);
  });

  it('leaves unknown ingredients out of the profile and lists them (AC-07)', () => {
    const r = recipe('X', [['Pilsner Malt', 4]], [['Mystery hop', 30, 'dry_hop', 4]], 'SafAle US-05');
    const p = recipeProfile(r, kb);
    expect(p.unmatched).toEqual([{ category: 'hop', name: 'Mystery hop', key: 'mystery hop' }]);
    expect(p.contributions.every(c => c.addition !== 1)).toBe(true);
  });

  it('never suggests what is already in the recipe, and leaves out POF+ yeasts on request (AC-08)', () => {
    const p = recipeProfile(witbier, kb);
    const all = recipeSuggestions(kb, p, { lang: 'nl', limit: 99 });
    for (const tab of Object.values(all)) for (const s of tab) expect(p.ingredientIds.has(s.ingredient.id)).toBe(false);
    const noPof = recipeSuggestions(kb, p, { lang: 'nl', noPof: true, limit: 99 }).yeast;
    expect(noPof.length).toBeGreaterThan(0);
    expect(noPof.every(s => !s.ingredient.yeast_pof)).toBe(true);
  });

  it('always fills the yeast tab, also with weak matches', () => {
    expect(top(saison, 'yeast', 5)).toHaveLength(5);
  });

  it('starts from a spice: yeasts and hops with bridges (AC-09)', () => {
    const p = ingredientProfile(kb, kbIngredient(kb, 'cardamom')!);
    const hops = suggest(kb, p.vector, 'hop', p.ingredientIds);
    const yeasts = suggest(kb, p.vector, 'yeast', p.ingredientIds, { minScore: 0 });
    expect(hops.length).toBeGreaterThan(0);
    expect(hops[0].bridges.length).toBeGreaterThan(0);
    expect(yeasts.length).toBe(5);
    expect(yeasts[0].bridges.length).toBeGreaterThan(0);
  });

  it('gives exactly the same result twice (AC-10)', () => {
    const a = recipeSuggestions(kb, recipeProfile(saison, kb), { lang: 'fr' });
    const b = recipeSuggestions(kb, recipeProfile(saison, kb), { lang: 'fr' });
    const plain = (x: typeof a) => JSON.stringify(Object.values(x).map(t => t.map(s => [s.ingredient.id, s.score, s.bridges])));
    expect(plain(a)).toBe(plain(b));
  });
});

describe('adding to a recipe (spec §8)', () => {
  it('adds a spice as MISC type spice with the use of its stage (AC-05)', () => {
    const r = addToRecipe(witbier, kbIngredient(kb, 'coriander')!, 'nl');
    const m = r.ingredients.miscellaneous!.at(-1)!;
    expect(m).toMatchObject({ name: 'Koriander', type: 'spice', use: 'boil', time: { unit: 'minutes', value: 5 }, amount: { unit: 'grams', value: 18 } });
    expect(miscStage(m)).toBe('boil_short');
    // The profile now counts it, and it is no longer suggested
    const p = recipeProfile(r, kb);
    expect(p.ingredientIds.has('coriander')).toBe(true);
    expect(recipeSuggestions(kb, p).spice.some(s => s.ingredient.id === 'coriander')).toBe(false);
  });

  it('adds a hop as whirlpool aroma hop and a dry spice in secondary', () => {
    const withHop = addToRecipe(witbier, kbIngredient(kb, 'citra')!, 'en');
    expect(withHop.ingredients.hops.at(-1)).toMatchObject({ name: 'Citra', use: 'whirlpool', amount: { value: 40 } });
    const withVanilla = addToRecipe(stout, kbIngredient(kb, 'vanilla')!, 'fr');
    expect(withVanilla.ingredients.miscellaneous!.at(-1)).toMatchObject({ name: 'Vanille', use: 'secondary', time: { unit: 'days' } });
  });

  it('replaces the yeast (AC-06)', () => {
    const r = addToRecipe(witbier, kbIngredient(kb, 'wb06')!, 'nl');
    expect(r.ingredients.cultures.map(c => c.name)).toEqual(['SafAle WB-06']);
  });
});

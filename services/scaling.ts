import { LibraryIngredient, Recipe } from '../types';
import { waterPlan } from './calculations';

/** Why a batch does not fit an installation. */
export type FitProblem = 'boil' | 'grain' | 'batch';

export interface ScaleSuggestion {
  direction: 'down' | 'up';
  factor: number;      // multiply every amount by this
  fromL: number;       // current batch size in litres
  toL: number;         // proposed batch size in litres
  problems: FitProblem[]; // what is wrong now (empty when scaling up)
}

const round = (value: number, step: number) => Math.round(value / step) * step;
const roundAtLeast = (value: number, step: number) => (value > 0 ? Math.max(step, round(value, step)) : value);
/** Rounds away float noise, e.g. 2.0300000000000002 → 2.03 */
const clean = (value: number) => Math.round(value * 1e6) / 1e6;

const toLiters = (recipe: Recipe) =>
  recipe.batch_size?.unit === 'gallons' ? (recipe.batch_size.value || 0) * 3.78541 : (recipe.batch_size?.value || 0);

/** A unit that counts pieces (tablets, packs) rather than weight or volume. */
const isCountUnit = (unit?: string) => !!unit && /item|unit|each|stuk|tablet|pack/i.test(unit);

/**
 * The recipe with every amount multiplied by `factor`: batch size, fermentables (10 g),
 * hops (1 g), other ingredients (0.1 of their unit, whole pieces), dry yeast in grams
 * (0.5 g), salts and lactic acid (0.1 g/ml), mash infusion volumes and own mash/sparge
 * water (0.1 L). Gravity, colour and bitterness stay the same; times and temperatures too.
 */
export const scaleRecipe = (recipe: Recipe, factor: number): Recipe => {
  if (!(factor > 0) || factor === 1) return recipe;
  const f = factor;
  const batchUnit = recipe.batch_size?.unit;
  const salts = recipe.water_chem?.salts;
  return {
    ...recipe,
    batch_size: { ...recipe.batch_size, value: clean(round((recipe.batch_size?.value || 0) * f, batchUnit === 'gallons' ? 0.01 : 0.1)) },
    ingredients: {
      ...recipe.ingredients,
      fermentables: (recipe.ingredients?.fermentables ?? []).map(x => ({
        ...x,
        amount: { ...x.amount, value: clean(roundAtLeast(x.amount.value * f, x.amount.unit === 'pounds' ? 0.01 : 0.01)) },
      })),
      hops: (recipe.ingredients?.hops ?? []).map(x => ({
        ...x,
        amount: { ...x.amount, value: clean(roundAtLeast(x.amount.value * f, x.amount.unit === 'ounces' ? 0.05 : 1)) },
      })),
      cultures: (recipe.ingredients?.cultures ?? []).map(x =>
        x.amount?.unit === 'grams' ? { ...x, amount: { ...x.amount, value: clean(roundAtLeast(x.amount.value * f, 0.5)) } } : x),
      ...(recipe.ingredients?.miscellaneous ? {
        miscellaneous: recipe.ingredients.miscellaneous.map(x => ({
          ...x,
          amount: { ...x.amount, value: clean(roundAtLeast(x.amount.value * f, isCountUnit(x.amount.unit) ? 1 : 0.1)) },
        })),
      } : {}),
    },
    ...(recipe.mash ? {
      mash: {
        ...recipe.mash,
        steps: recipe.mash.steps.map(s => (s.infuse_amount ? { ...s, infuse_amount: clean(round(s.infuse_amount * f, 0.1)) } : s)),
      },
    } : {}),
    ...(recipe.water ? {
      water: {
        ...recipe.water,
        ...(recipe.water.mash_l !== undefined ? { mash_l: clean(round(recipe.water.mash_l * f, 0.1)) } : {}),
        ...(recipe.water.sparge_l !== undefined ? { sparge_l: clean(round(recipe.water.sparge_l * f, 0.1)) } : {}),
      },
    } : {}),
    ...(recipe.water_chem ? {
      water_chem: {
        ...recipe.water_chem,
        ...(salts ? { salts: Object.fromEntries(Object.entries(salts).map(([k, v]) => [k, clean(round((v || 0) * f, 0.1))])) } : {}),
        ...(recipe.water_chem.lactic_ml !== undefined ? { lactic_ml: clean(round(recipe.water_chem.lactic_ml * f, 0.1)) } : {}),
      },
    } : {}),
  };
};

/** What keeps this recipe from being brewed on the installation (empty: it fits). */
export const fitProblems = (recipe: Recipe, equipment: LibraryIngredient): FitProblem[] => {
  const plan = waterPlan(recipe, equipment);
  const problems: FitProblem[] = [];
  if (plan.warnings.includes('boil_over_capacity')) problems.push('boil');
  if (plan.warnings.includes('too_much_grain')) problems.push('grain');
  if (equipment.batch_size && toLiters(recipe) > equipment.batch_size + 0.05) problems.push('batch');
  return problems;
};

/** Largest factor in [lo, hi] for which the scaled recipe fits (problems only grow with the factor). */
const largestFit = (recipe: Recipe, equipment: LibraryIngredient, lo: number, hi: number): number => {
  for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (fitProblems(scaleRecipe(recipe, mid), equipment).length === 0) lo = mid; else hi = mid;
  }
  return lo;
};

/**
 * Suggests a batch size for the installation: smaller when the recipe does not fit
 * (boil kettle, grain in the mash tun, batch size of the installation), larger when the
 * installation's batch size is at least 10 % more and the larger batch fits. The new
 * batch is rounded down to 0.5 L (0.1 gal). Returns null when no change is needed.
 */
export const suggestScale = (recipe: Recipe, equipment: LibraryIngredient | undefined): ScaleSuggestion | null => {
  const fromL = toLiters(recipe);
  if (!equipment || !(fromL > 0)) return null;
  const step = recipe.batch_size?.unit === 'gallons' ? 0.1 * 3.78541 : 0.5;
  const toFactor = (factor: number) => Math.floor((fromL * factor) / step + 1e-9) * step / fromL;

  const problems = fitProblems(recipe, equipment);
  if (problems.length > 0) {
    const factor = toFactor(largestFit(recipe, equipment, 0.05, 1));
    if (!(factor > 0.05)) return null; // even a tiny batch does not fit: nothing sensible to suggest
    return { direction: 'down', factor, fromL, toL: fromL * factor, problems };
  }

  if (equipment.batch_size && equipment.batch_size >= fromL * 1.1) {
    const factor = toFactor(largestFit(recipe, equipment, 1, equipment.batch_size / fromL));
    if (factor >= 1.1) return { direction: 'up', factor, fromL, toL: fromL * factor, problems: [] };
  }
  return null;
};

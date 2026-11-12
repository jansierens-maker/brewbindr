import { Hop, LibraryIngredient, Recipe } from '../types';
import { calculateRecipeStats } from './calculations';

export interface HopChange {
  index: number;
  name: string;
  from: number;
  to: number;
  unit: string;
}

export interface HopRecalc {
  targetIbu: number;
  currentIbu: number;
  resultIbu: number;
  factor: number;
  changes: HopChange[];
  ingredients: Recipe['ingredients'];
}

/** Hop additions that mainly give bitterness; whirlpool and dry hops are dosed for aroma. */
export const isBitteringHop = (h: Hop) => h.use === 'boil' || h.use === 'first_wort' || h.use === 'mash';

const isWeightUnit = (unit: string | undefined) => ['grams', 'ounces', 'kilograms', 'pounds', 'g', 'oz', 'kg', 'lb'].includes(unit ?? '');
const roundAmount = (value: number, unit: string) => {
  const step = unit === 'ounces' || unit === 'oz' ? 0.05 : unit === 'kilograms' || unit === 'kg' ? 0.001 : unit === 'pounds' || unit === 'lb' ? 0.01 : 1;
  return Math.max(step, Math.round(value / step) * step);
};
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * New hop amounts so the brew reaches the bitterness (IBU) of the recipe with the alpha acids
 * actually used (#167). IBU is linear in each hop's weight, so the adjustable hops (bittering
 * additions; with `includeAroma` also whirlpool and dry hops) are all multiplied by the same
 * factor. Amounts are rounded to whole grams (0.05 oz). Returns null when nothing can be
 * adjusted or the target cannot be reached (e.g. the other hops alone already exceed it).
 */
export const recalcHopsForIbu = (
  brew: Recipe,
  targetIbu: number,
  alphaOverrides: Record<string, number> | undefined,
  equipment: LibraryIngredient | undefined,
  includeAroma = false,
): HopRecalc | null => {
  const hops = brew.ingredients.hops ?? [];
  const adjustable = (h: Hop) => isWeightUnit(h.amount?.unit) && (h.amount?.value || 0) > 0 && (includeAroma || isBitteringHop(h));
  if (!hops.some(adjustable)) return null;

  const ibuOf = (list: Hop[]) => calculateRecipeStats({ ...brew, ingredients: { ...brew.ingredients, hops: list } }, alphaOverrides, equipment).ibuExact;
  const currentIbu = ibuOf(hops);
  const fixedIbu = ibuOf(hops.map(h => (adjustable(h) ? { ...h, amount: { ...h.amount, value: 0 } } : h)));
  const adjustableIbu = currentIbu - fixedIbu;
  if (!(adjustableIbu > 0.01)) return null;
  const factor = (targetIbu - fixedIbu) / adjustableIbu;
  if (!(factor > 0)) return null;

  const changes: HopChange[] = [];
  const newHops = hops.map((h, index) => {
    if (!adjustable(h)) return h;
    const to = clean(roundAmount(h.amount.value * factor, h.amount.unit));
    if (to !== h.amount.value) changes.push({ index, name: h.name, from: h.amount.value, to, unit: h.amount.unit });
    return { ...h, amount: { ...h.amount, value: to } };
  });
  const ingredients = { ...brew.ingredients, hops: newHops };
  return { targetIbu, currentIbu, resultIbu: ibuOf(newHops), factor, changes, ingredients };
};

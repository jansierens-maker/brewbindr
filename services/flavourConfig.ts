/**
 * Flavour Lab settings: starting values, to be calibrated later with test brews (spec §7).
 */

export type Volatility = 'high' | 'medium' | 'low';

/** Process stage of an addition; 'yeast' and 'malt' are what the yeast or malt itself brings. */
export type FlavourStage =
  | 'boil_long'   // boil ≥ 30 min (also first wort and mash)
  | 'boil_short'  // boil 5–29 min
  | 'whirlpool'   // flame-out / whirlpool (< 80 °C), boil < 5 min
  | 'primary'
  | 'secondary'   // secondary, dry hop, dry spice
  | 'bottling'    // tincture at bottling
  | 'yeast'
  | 'malt';

/** Share of an aroma compound that is left after the stage, per volatility. */
export const RETENTION: Record<FlavourStage, Record<Volatility, number>> = {
  boil_long: { high: 0.05, medium: 0.1, low: 0.6 }, // spec: medium 0.2; 0.1 so AC-03 holds for geraniol (issue #193)
  boil_short: { high: 0.3, medium: 0.5, low: 0.8 },
  whirlpool: { high: 0.6, medium: 0.8, low: 0.9 },
  primary: { high: 0.5, medium: 0.7, low: 0.9 },
  secondary: { high: 0.9, medium: 0.95, low: 1 },
  bottling: { high: 1, medium: 1, low: 1 },
  yeast: { high: 1, medium: 1, low: 1 },
  malt: { high: 1, medium: 1, low: 1 },
};

/** Spice and hop weight: dose ÷ upper typical dose, at most this. */
export const MAX_WEIGHT = 2;
/** Weight of the aroma-family dimensions in the score vector (0 = compounds only). */
export const FAMILY_WEIGHT = 1;
/** Aroma-active compounds (low odour threshold) count this many times in the score vector. */
export const POTENCY_WEIGHT = 2;
/** Weight of a yeast in the recipe vector (spec: 1; lower so hop and spices weigh in more, issue #193). */
export const YEAST_WEIGHT = 0.3;
/** Candidates below this score are not shown. */
export const MIN_SCORE = 20;
/** Suggestions per tab. */
export const TOP_N = 5;
/** Bridge compounds: at most this many, each at least this share of the dot product. */
export const MAX_BRIDGES = 3;
export const MIN_BRIDGE_SHARE = 0.1;
/** A shared aroma family is shown as bridge from this share of the whole dot product. */
export const MIN_FAMILY_BRIDGE_SHARE = 0.25;
/** Boil minutes that count as a long or short boil. */
export const LONG_BOIL_MIN = 30;
export const SHORT_BOIL_MIN = 5;
/** When a stage is added to a recipe: BeerXML use and time (minutes for the boil, days after). */
export const STAGE_TO_MISC: Record<'boil_long' | 'boil_short' | 'whirlpool' | 'primary' | 'secondary' | 'bottling', { use: string; time: number; unit: 'minutes' | 'days' }> = {
  boil_long: { use: 'boil', time: 60, unit: 'minutes' },
  boil_short: { use: 'boil', time: 5, unit: 'minutes' },
  whirlpool: { use: 'boil', time: 0, unit: 'minutes' },
  primary: { use: 'primary', time: 0, unit: 'days' },
  secondary: { use: 'secondary', time: 5, unit: 'days' },
  bottling: { use: 'bottling', time: 0, unit: 'days' },
};

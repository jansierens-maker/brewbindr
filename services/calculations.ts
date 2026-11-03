
import { Recipe, UserPreferences, LibraryIngredient } from "../types";

export const srmToEbc = (srm: number) => srm * 1.97;
export const ebcToSrm = (ebc: number) => ebc / 1.97;

export const getSRMColor = (srm: number): string => {
  if (srm < 2) return '#FFE699';
  if (srm < 4) return '#FFD878';
  if (srm < 6) return '#FFCA5A';
  if (srm < 8) return '#FFBF42';
  if (srm < 10) return '#FBB123';
  if (srm < 13) return '#F8A600';
  if (srm < 17) return '#F39C00';
  if (srm < 20) return '#EA8F00';
  if (srm < 24) return '#E58500';
  if (srm < 29) return '#D37200';
  if (srm < 35) return '#C16100';
  if (srm < 40) return '#AF5000';
  if (srm < 45) return '#9A4000';
  if (srm < 50) return '#823000';
  return '#241000';
};

/**
 * Formats a number based on language and specific brewing rules.
 */
export const formatBrewNumber = (
  val: number | undefined,
  type: 'g' | 'kg' | 'abv' | 'og' | 'default' | 'temp' | 'vol' | 'color',
  lang: string,
  prefs?: UserPreferences,
  sourceUnit?: string
): string => {
  if (val === undefined || isNaN(val)) return '-';
  
  const locale = lang === 'en' ? 'en-US' : 'nl-NL';
  let options: Intl.NumberFormatOptions = {};
  let displayValue = val;

  // Handle color conversion
  if (type === 'color' && prefs?.colorScale === 'ebc') {
    displayValue = srmToEbc(val);
  }

  // Handle unit conversions for display if needed
  // Note: Most internal values are stored in Metric (L, kg, C) unless sourceUnit is specified
  if (prefs?.units === 'imperial') {
    // Only convert if it's not already imperial
    const isAlreadyImperial = sourceUnit === 'gallons' || sourceUnit === 'pounds' || sourceUnit === 'ounces' || sourceUnit === 'imperial';
    if (!isAlreadyImperial) {
      if (type === 'vol') displayValue = val / 3.78541; // L to Gal
      if (type === 'kg') displayValue = val * 2.20462; // kg to lb
      if (type === 'g') displayValue = val / 28.3495; // g to oz
      if (type === 'temp') displayValue = (val * 9/5) + 32; // C to F
    }
  } else if (prefs?.units === 'metric') {
    // Only convert if it IS imperial
    const isImperial = sourceUnit === 'gallons' || sourceUnit === 'pounds' || sourceUnit === 'ounces' || sourceUnit === 'imperial';
    if (isImperial) {
      if (type === 'vol') displayValue = val * 3.78541; // Gal to L
      if (type === 'kg') displayValue = val / 2.20462; // lb to kg
      if (type === 'g') displayValue = val * 28.3495; // oz to g
      if (type === 'temp') displayValue = (val - 32) * 5/9; // F to C
    }
  }

  switch (type) {
    case 'g':
      // grams whole; ounces to 2 decimals
      options = { minimumFractionDigits: 0, maximumFractionDigits: prefs?.units === 'imperial' ? 2 : 0 };
      break;
    case 'kg':
      // kg to the gram (3 decimals); lb to 2 decimals
      options = { minimumFractionDigits: 0, maximumFractionDigits: prefs?.units === 'imperial' ? 2 : 3 };
      break;
    case 'abv':
      options = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
      break;
    case 'og':
      options = { minimumFractionDigits: 3, maximumFractionDigits: 3 };
      break;
    case 'temp':
      // °C to 1 decimal; °F whole degrees
      options = { minimumFractionDigits: 0, maximumFractionDigits: prefs?.units === 'imperial' ? 0 : 1 };
      break;
    case 'vol':
      // liters to 1 decimal; gallons to 2 decimals
      options = prefs?.units === 'imperial'
        ? { minimumFractionDigits: 1, maximumFractionDigits: 2 }
        : { minimumFractionDigits: 1, maximumFractionDigits: 1 };
      break;
    case 'color':
      options = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
      break;
    default:
      options = { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  }

  return new Intl.NumberFormat(locale, options).format(displayValue);
};

const normalizeUnit = (unit: string | undefined): string => {
  if (!unit) return '';
  const u = unit.toLowerCase().trim();
  if (u.startsWith('kg') || u.startsWith('kilo')) return 'kilograms';
  if (u.startsWith('lb') || u.startsWith('pound')) return 'pounds';
  if (u === 'g' || u === 'gram' || u === 'grams') return 'grams';
  if (u === 'gr' || u === 'grain' || u === 'grains') return 'grains';
  if (u.startsWith('oz') || u.startsWith('ounce')) return 'ounces';
  if (u.startsWith('l') && !u.startsWith('lb')) return 'liters';
  if (u.startsWith('gal')) return 'gallons';
  if (u.startsWith('min')) return 'minutes';
  return u;
};

/**
 * Decimal places for stored amounts, per unit (see also formatBrewNumber).
 * Metric: kg 3, g 0, L 1. Imperial: lb 2, oz 2, gal 2. Times: whole minutes/days.
 */
const DECIMALS_BY_UNIT: Record<string, number> = {
  kilograms: 3,
  grams: 0,
  liters: 1,
  pounds: 2,
  ounces: 2,
  gallons: 2,
  minutes: 0,
  days: 0,
};

export const roundTo = (value: number, decimals: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/** Rounds a value by its unit; unknown units (e.g. ml, items) keep 2 decimals. */
export const roundByUnit = (value: number, unit: string | undefined): number =>
  roundTo(value, DECIMALS_BY_UNIT[normalizeUnit(unit)] ?? 2);

const roundAmount = <T extends { value: number; unit?: string } | undefined>(amount: T): T =>
  amount && typeof amount.value === 'number'
    ? ({ ...amount, value: roundByUnit(amount.value, amount.unit) } as T)
    : amount;

const roundValue = <T extends { value?: number } | undefined>(field: T, decimals: number): T =>
  field && typeof field.value === 'number'
    ? ({ ...field, value: roundTo(field.value, decimals) } as T)
    : field;

/**
 * Removes floating-point noise and unit-conversion leftovers (e.g. 2.041164 kg,
 * 1.0531356220799766 OG) from a recipe. Applied when recipes are loaded, saved
 * and imported, so stored and displayed values stay clean.
 */
export const normalizeRecipe = (recipe: Recipe): Recipe => {
  if (!recipe) return recipe;
  const ing = recipe.ingredients;
  const specs = recipe.specifications;
  return {
    ...recipe,
    batch_size: roundAmount(recipe.batch_size),
    boil_time: roundAmount(recipe.boil_time),
    ingredients: ing && {
      ...ing,
      fermentables: (ing.fermentables || []).map(f => ({ ...f, amount: roundAmount(f.amount), color: roundValue(f.color, 1) })),
      hops: (ing.hops || []).map(h => ({ ...h, amount: roundAmount(h.amount), alpha_acid: roundValue(h.alpha_acid, 1), time: roundAmount(h.time) })),
      cultures: (ing.cultures || []).map(c => ({ ...c, amount: roundAmount(c.amount) })),
      miscellaneous: ing.miscellaneous?.map(m => ({ ...m, amount: roundAmount(m.amount), time: roundAmount(m.time) })),
      water: ing.water?.map(w => ({ ...w, amount: roundAmount(w.amount) })),
    },
    specifications: specs && {
      ...specs,
      og: roundValue(specs.og, 3),
      fg: roundValue(specs.fg, 3),
      abv: roundValue(specs.abv, 1),
      ibu: roundValue(specs.ibu, 0),
      color: roundValue(specs.color, 1),
    },
  };
};

/** Formats a stock amount in its own unit (no unit conversion). */
export const formatStockAmount = (amount: number | undefined, unit: string | undefined, lang: string): string => {
  const u = normalizeUnit(unit);
  return formatBrewNumber(amount, u === 'kilograms' ? 'kg' : u === 'grams' ? 'g' : 'default', lang);
};

/** ABV added per g/L of priming sugar (sucrose): about 0.51 g ethanol per g sugar, 0.789 g/ml. */
export const PRIMING_ABV_PER_G_PER_L = 0.065;

export const calculateABV = (og: number | undefined, fg: number | undefined, isBottled: boolean, sugarG: number = 0, volumeL: number = 1): number => {
  if (!og || !fg || og <= fg) return 0;
  // "Alternate" formula (Hall): accurate over the whole range. The simple
  // (OG - FG) x 131.25 underestimates more and more as beers get stronger.
  let abv = (76.08 * (og - fg) / (1.775 - og)) * (fg / 0.794);
  if (isBottled && sugarG > 0 && volumeL > 0) {
    const sugarPerLiter = sugarG / volumeL;
    abv += (sugarPerLiter * PRIMING_ABV_PER_G_PER_L);
  }
  return abv;
};

export const calculatePrimingSugar = (targetCO2: number, liters: number, tempC: number, sugarType: string): number => {
  if (!liters || liters <= 0) return 0;
  const residualCO2 = 1.57 * Math.pow(0.97, tempC);
  const neededCO2 = Math.max(0, targetCO2 - residualCO2);
  let sugarG = neededCO2 * 4 * liters;
  if (sugarType === 'glucose') sugarG *= 1.15;
  if (sugarType === 'dme') sugarG *= 1.4;
  return Math.round(sugarG);
};

/** SG to degrees Plato (ASBC polynomial). */
export const sgToPlato = (sg: number): number =>
  -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;

/** Degrees Plato to SG (inverse used by most brewing software). */
export const platoToSg = (plato: number): number =>
  1 + plato / (258.6 - (plato / 258.2) * 227.1);

/** Hydrometer calibration temperature most hydrometers use. */
export const HYDROMETER_CALIBRATION_C = 20;

/**
 * Corrects a hydrometer reading taken at another temperature than the calibration
 * temperature (standard correction, as used by BeerSmith and Brewer's Friend).
 */
export const correctHydrometer = (sg: number, readingTempC: number, calibrationTempC: number = HYDROMETER_CALIBRATION_C): number => {
  const density = (c: number) => {
    const f = c * 9 / 5 + 32;
    return 1.00130346 - 0.000134722124 * f + 0.00000204052596 * f ** 2 - 0.00000000232820948 * f ** 3;
  };
  return sg * (density(readingTempC) / density(calibrationTempC));
};

/** Bitterness to gravity ratio: IBU per gravity point (0.5 = balanced). */
export const buGuRatio = (ibu: number, og: number): number =>
  og > 1 ? ibu / ((og - 1) * 1000) : 0;

export type GravityUnit = 'sg' | 'plato' | 'both';

/** A gravity in the unit the user chose: "1.054", "13,3 °P" or "1.054 (13,3 °P)". */
export const formatGravity = (sg: number | undefined, lang: string, unit: GravityUnit = 'sg'): string => {
  if (sg === undefined || sg === null || isNaN(sg)) return '-';
  const sgText = formatBrewNumber(sg, 'og', lang);
  const platoText = `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(sgToPlato(sg))} °P`;
  if (unit === 'plato') return platoText;
  if (unit === 'both') return `${sgText} (${platoText})`;
  return sgText;
};

/** Fermentable types: grain and adjunct are mashed; sugar and extract are not. */
export const FERMENTABLE_TYPES = ['grain', 'adjunct', 'sugar', 'extract', 'dry_extract'] as const;

/** Normalizes a fermentable type, including BeerXML spellings ("Dry Extract"). */
export const normalizeFermentableType = (type: string | undefined): string => {
  const t = (type || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (t === 'liquid_extract') return 'extract';
  return (FERMENTABLE_TYPES as readonly string[]).includes(t) ? t : 'grain';
};

/** Guesses the type from a name, for library items that have no type. */
export const guessFermentableType = (name: string | undefined): string => {
  const n = (name || '').toLowerCase();
  if (/\b(dme|lme)\b|extra(c)?t/.test(n)) return /\bdme\b|dry|droog|sec/.test(n) ? 'dry_extract' : 'extract';
  if (/suiker|sugar|sucre|kandij|candi|dextrose|glucose|honing|honey|miel|lactose|maple|ahorn|siroop|syrup|sirop|melasse|molasses|treacle/.test(n)) return 'sugar';
  return 'grain';
};

/** Brewhouse efficiency only applies to what is mashed; sugars and extracts give all their extract. */
const isMashed = (type: string | undefined) => {
  const t = normalizeFermentableType(type);
  return t === 'grain' || t === 'adjunct';
};

/** How yeast treats a fermentable: sugars ferment completely, lactose not at all, the rest as the yeast allows. */
const fermentability = (f: { type: string; name: string }): 'full' | 'none' | 'yeast' =>
  /lactose|melksuiker|lactosa/i.test(f.name || '') ? 'none'
    : normalizeFermentableType(f.type) === 'sugar' ? 'full' : 'yeast';

/** Hop utilization relative to 100 °C, from the isomerization rate (Malowicki, as used in mIBU). */
export const hopTemperatureFactor = (tempC: number): number => {
  const t = Math.min(100, tempC);
  return Math.exp(9773 / 373.15 - 9773 / (t + 273.15));
};

/** Default whirlpool temperature when a recipe does not give one. */
export const DEFAULT_WHIRLPOOL_TEMP_C = 80;

/** Expected attenuation shifts with mash temperature: about 1 percentage point per °C away from 66 °C. */
const MASH_REFERENCE_TEMP_C = 66;
const ATTENUATION_PER_DEGREE = 1;
const MAX_MASH_ADJUSTMENT = 5;

/** Temperature of the main (longest) saccharification rest, if the recipe has a mash. */
export const mainMashTemperature = (recipe: Recipe): number | undefined => {
  const steps = (recipe.mash?.steps || [])
    .map(st => ({ temp: st.temperature ?? st.step_temp, time: st.duration ?? st.step_time ?? 0 }))
    .filter(st => typeof st.temp === 'number' && st.temp >= 60 && st.temp <= 80);
  if (steps.length === 0) return undefined;
  return steps.reduce((best, st) => (st.time > best.time ? st : best)).temp;
};

export const calculateRecipeStats = (recipe: Recipe, alphaOverrides?: Record<string, number>) => {
  const batchUnit = normalizeUnit(recipe.batch_size?.unit);
  const batchSizeL = batchUnit === 'liters' ? (recipe.batch_size?.value || 0) : (recipe.batch_size?.value || 0) * 3.78541;
  const efficiency = (recipe.efficiency?.brewhouse || 75) / 100;
  const boilTime = recipe.boil_time?.value || 60;

  const fermentables = recipe.ingredients?.fermentables ?? [];
  const hops = recipe.ingredients?.hops ?? [];
  const cultures = recipe.ingredients?.cultures ?? [];

  // Gravity points, split by how far yeast ferments them
  let maltPoints = 0;          // malt and extract: as far as the yeast attenuates
  let sugarPoints = 0;         // sugar: completely
  let unfermentablePoints = 0; // lactose: not at all
  fermentables.forEach(f => {
    if (!f.amount) return;
    const unit = normalizeUnit(f.amount.unit);
    let weightKg = f.amount.value;
    if (unit === 'pounds') weightKg = f.amount.value * 0.453592;
    else if (unit === 'grams') weightKg = f.amount.value / 1000;
    else if (unit === 'ounces') weightKg = f.amount.value * 0.0283495;

    const potential = f.yield?.potential?.value || 1.037;
    const ppg = (potential - 1) * 1000;
    const pkl = ppg * 8.3454;
    const points = (weightKg * pkl * (isMashed(f.type) ? efficiency : 1)) / (batchSizeL || 1);
    const kind = fermentability(f);
    if (kind === 'full') sugarPoints += points;
    else if (kind === 'none') unfermentablePoints += points;
    else maltPoints += points;
  });

  const og = 1 + ((maltPoints + sugarPoints + unfermentablePoints) / 1000);
  const yeastAttenuation = cultures.length > 0
    ? cultures.reduce((acc, c) => acc + (c.attenuation || 75), 0) / cultures.length
    : 75;
  // A lower mash temperature gives a more fermentable wort, a higher one a fuller beer
  const mashTemp = recipe.type === 'extract' ? undefined : mainMashTemperature(recipe);
  const mashAdjustment = mashTemp === undefined ? 0
    : Math.max(-MAX_MASH_ADJUSTMENT, Math.min(MAX_MASH_ADJUSTMENT, (MASH_REFERENCE_TEMP_C - mashTemp) * ATTENUATION_PER_DEGREE));
  const attenuation = Math.max(0, Math.min(100, yeastAttenuation + mashAdjustment)) / 100;

  const fg = 1 + ((maltPoints * (1 - attenuation) + unfermentablePoints) / 1000);
  const abv = calculateABV(og, fg, false);

  let mcu = 0;
  fermentables.forEach(f => {
    if (!f.amount) return;
    const unit = normalizeUnit(f.amount.unit);
    let weightLbs = f.amount.value;
    if (unit === 'kilograms') weightLbs = f.amount.value * 2.20462;
    else if (unit === 'grams') weightLbs = f.amount.value / 453.592;
    else if (unit === 'ounces') weightLbs = f.amount.value / 16;

    const colorSRM = f.color?.value || 2;
    const volumeGal = batchSizeL / 3.78541;
    mcu += (weightLbs * colorSRM) / (volumeGal || 1);
  });
  const colorSRM = mcu > 0 ? 1.4922 * Math.pow(mcu, 0.6859) : 0;

  // Tinseth, with the usual corrections for hop form and use
  const bignessFactor = 1.65 * Math.pow(0.000125, (og - 1));
  const boilUtilization = (minutes: number) => bignessFactor * (1 - Math.exp(-0.04 * minutes)) / 4.15;
  let ibu = 0;
  hops.forEach(h => {
    if (!h.amount) return;
    const use = (h.use as string) === 'aroma' ? 'whirlpool' : h.use;
    const time = h.time?.value || 0;
    let utilization = 0;
    if (use === 'boil') utilization = boilUtilization(time);
    else if (use === 'first_wort') utilization = boilUtilization(time || boilTime) * 1.1; // FWH: about 10 % more
    else if (use === 'mash') utilization = boilUtilization(boilTime) * 0.2;               // mash hops: about 20 % of a full boil
    else if (use === 'whirlpool') utilization = boilUtilization(time * hopTemperatureFactor(h.temperature ?? DEFAULT_WHIRLPOOL_TEMP_C));
    if (utilization <= 0) return;

    if (h.form === 'leaf' || h.form === 'plug') utilization *= 0.9; // whole hops: about 10 % less than pellets

    const alpha = alphaOverrides?.[h.name] !== undefined ? alphaOverrides[h.name] : (h.alpha_acid?.value || 5);
    const unit = normalizeUnit(h.amount.unit);
    let weightG = h.amount.value;
    if (unit === 'ounces') weightG = h.amount.value * 28.3495;
    else if (unit === 'kilograms') weightG = h.amount.value * 1000;
    else if (unit === 'pounds') weightG = h.amount.value * 453.592;

    ibu += (alpha * weightG * utilization * 10) / (batchSizeL || 1);
  });

  return {
    og,
    fg,
    abv,
    color: colorSRM,
    ibu: Math.round(ibu)
  };
};

export const checkRecipeStock = (recipe: Recipe, library: LibraryIngredient[]) => {
  const missing: string[] = [];
  const insufficient: string[] = [];

  const check = (name: string, requiredAmount: number, requiredUnit: string, libraryId?: string) => {
    // Prioritize private items for stock checks to ensure accuracy when items are cloned for submission
    const item = library.find(l => (l.id === libraryId || l.name.toLowerCase() === name.toLowerCase()) && l.status === 'private')
              || library.find(l => l.id === libraryId || l.name.toLowerCase() === name.toLowerCase());

    if (!item || !item.stock) {
      missing.push(name);
      return;
    }

    // Convert stock to required unit for comparison
    let stockAmount = item.stock.amount;
    const stockUnit = normalizeUnit(item.stock.unit);
    const targetUnit = normalizeUnit(requiredUnit);

    if (stockUnit !== targetUnit) {
      if (stockUnit === 'kilograms' && targetUnit === 'grams') stockAmount *= 1000;
      else if (stockUnit === 'grams' && targetUnit === 'kilograms') stockAmount /= 1000;
      else if (stockUnit === 'pounds' && targetUnit === 'ounces') stockAmount *= 16;
      else if (stockUnit === 'ounces' && targetUnit === 'pounds') stockAmount /= 16;
      else if (stockUnit === 'kilograms' && targetUnit === 'pounds') stockAmount *= 2.20462;
      else if (stockUnit === 'pounds' && targetUnit === 'kilograms') stockAmount /= 2.20462;
      // Add more conversions if needed
    }

    if (stockAmount < requiredAmount) {
      insufficient.push(name);
    }
  };

  recipe.ingredients.fermentables.forEach(f => check(f.name, f.amount.value, f.amount.unit, f.libraryId));
  recipe.ingredients.hops.forEach(h => check(h.name, h.amount.value, h.amount.unit, h.libraryId));
  recipe.ingredients.cultures.forEach(c => check(c.name, 1, 'items', c.libraryId)); // Yeast is usually counted as 1 unit if amount is missing
  recipe.ingredients.miscellaneous?.forEach(m => check(m.name, m.amount.value, m.amount.unit, m.libraryId));

  return {
    isBrewable: missing.length === 0 && insufficient.length === 0,
    missing,
    insufficient
  };
};

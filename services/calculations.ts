
import { Recipe, UserPreferences, LibraryIngredient, MashStep, MashProfile } from "../types";

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

const roundNum = (v: number | undefined, decimals: number) =>
  typeof v === 'number' && Number.isFinite(v) ? roundTo(v, decimals) : v;

/** Mash step: temperatures to 0.1 °C, times to whole minutes, water to 0.1 L. */
export const normalizeMashStep = (step: MashStep): MashStep => ({
  ...step,
  step_temp: roundNum(step.step_temp, 1),
  temperature: roundNum(step.temperature, 1),
  end_temp: roundNum(step.end_temp, 1),
  step_time: roundNum(step.step_time, 0),
  duration: roundNum(step.duration, 0),
  ramp_time: roundNum(step.ramp_time, 0),
  infuse_amount: roundNum(step.infuse_amount, 1),
});

/** Mash profile (in a recipe or the library): BeerXML stores °F converted to °C, e.g. 65.555556. */
export const normalizeMash = <T extends Partial<Pick<MashProfile, 'steps' | 'grain_temp' | 'sparge_temp'>>>(mash: T): T => ({
  ...mash,
  grain_temp: roundNum(mash.grain_temp, 1),
  sparge_temp: roundNum(mash.sparge_temp, 1),
  steps: mash.steps?.map(normalizeMashStep),
});

/** Library items: mash profiles get the same rounding as recipe mashes. */
export const normalizeLibraryItem = (item: LibraryIngredient): LibraryIngredient =>
  item && item.type === 'mash_profile' ? normalizeMash(item as any) : item;

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
    mash: recipe.mash && normalizeMash(recipe.mash),
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

/** Default wort correction factor of a refractometer (Brix of wort vs. sugar solution). */
export const DEFAULT_WCF = 1.04;

/** Refractometer reading (°Brix) of unfermented wort to SG. */
export const brixToSg = (brix: number, wcf: number = DEFAULT_WCF): number => platoToSg(brix / (wcf || 1));

/**
 * Gravity during or after fermentation from a refractometer, corrected for alcohol
 * (Sean Terrill's cubic formula). originalBrix is the wort before fermentation.
 */
export const refractometerFg = (originalBrix: number, finalBrix: number, wcf: number = DEFAULT_WCF): number => {
  const ob = originalBrix / (wcf || 1);
  const fb = finalBrix / (wcf || 1);
  return 1 - 0.0044993 * ob + 0.011774 * fb + 0.00027581 * ob ** 2 - 0.0012717 * fb ** 2
    - 0.0000072800 * ob ** 3 + 0.000063293 * fb ** 3;
};

/** The Brix a refractometer shows for a wort of this SG (inverse of brixToSg). */
export const sgToBrix = (sg: number, wcf: number = DEFAULT_WCF): number => sgToPlato(sg) * (wcf || 1);

/**
 * Regulator pressure for force carbonation in a keg: CO2 volumes at a beer temperature.
 * Standard carbonation-chart fit; result in bar and psi above atmospheric pressure.
 */
export const kegPressure = (volumes: number, tempC: number): { bar: number; psi: number } => {
  const f = tempC * 9 / 5 + 32;
  const psi = Math.max(0, -16.6999 - 0.0101059 * f + 0.00116512 * f ** 2 + 0.173354 * f * volumes
    + 4.24267 * volumes - 0.0684226 * volumes ** 2);
  return { psi, bar: psi * 0.0689476 };
};

/**
 * Yeast pitching. Cell counts are in billions; pitch rates in million cells per ml per °P.
 * Ale 0.75, lager 1.5, each a third higher above 1.060 (the usual Mr Malty/Fix rates).
 */
export const pitchRate = (yeastType: 'ale' | 'lager', og: number): number =>
  yeastType === 'lager' ? (og > 1.060 ? 2.0 : 1.5) : (og > 1.060 ? 1.0 : 0.75);

export const cellsNeeded = (og: number, volumeL: number, rate: number): number =>
  og > 1 && volumeL > 0 ? rate * volumeL * sgToPlato(og) : 0;

/**
 * Dry yeast: cells per gram. Manufacturers guarantee 6+ billion, measured counts are
 * usually 15–20; 20 (as Mr Malty uses) matches the dose makers advise (one 11.5 g
 * sachet for about 20 L of normal-strength ale).
 */
export const DRY_CELLS_PER_GRAM = 20;
/** Liquid yeast: cells per fresh pack or vial. */
export const LIQUID_CELLS_PER_PACK = 100;

/** Share of living cells in a liquid pack, losing about 0.7 % per day after production. */
export const liquidViability = (productionDate: string | undefined, today: Date = new Date()): number => {
  if (!productionDate) return 1;
  const days = (today.getTime() - new Date(productionDate).getTime()) / 86_400_000;
  if (isNaN(days)) return 1;
  return Math.max(0, Math.min(1, 1 - 0.007 * Math.max(0, days)));
};

/** Starter wort strength and the dry malt extract that gives it (about 100 g per litre). */
export const STARTER_SG = 1.036;
export const STARTER_DME_G_PER_L = 100;

/** Cells after a starter on a stir plate (Kai Troester's growth model). */
export const starterGrowth = (cells: number, starterL: number, sg: number = STARTER_SG): number => {
  if (starterL <= 0) return cells;
  const extractG = starterL * 1000 * sg * sgToPlato(sg) / 100;
  const rate = cells / extractG; // billion cells per gram extract
  const growthPerGram = rate < 1.4 ? 1.4 : rate <= 3.5 ? 2.33 - 0.67 * rate : 0;
  return cells + extractG * Math.max(0, growthPerGram);
};

/** Smallest common starter size that reaches the target, or undefined when one step is not enough. */
export const STARTER_SIZES_L = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
export const starterFor = (cells: number, needed: number): number | undefined =>
  STARTER_SIZES_L.find(l => starterGrowth(cells, l) >= needed);

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

/** Water absorbed by spent grain (L per kg); typical for a mash tun, BIAB squeezes out more. */
export const GRAIN_ABSORPTION_L_PER_KG = 1.0;
export const BIAB_GRAIN_ABSORPTION_L_PER_KG = 0.7;
/** Mash thickness used when the recipe gives no infusion volume. */
export const DEFAULT_MASH_RATIO_L_PER_KG = 3.0;
export const DEFAULT_GRAIN_TEMP_C = 20;

const fermentableKg = (f: Recipe['ingredients']['fermentables'][number]): number => {
  const unit = normalizeUnit(f.amount?.unit);
  const v = f.amount?.value || 0;
  return unit === 'pounds' ? v * 0.453592 : unit === 'grams' ? v / 1000 : unit === 'ounces' ? v * 0.0283495 : v;
};

const batchLiters = (recipe: Recipe): number => {
  const v = recipe.batch_size?.value || 0;
  return normalizeUnit(recipe.batch_size?.unit) === 'gallons' ? v * 3.78541 : v;
};

/** A brewery's own item, not a copy in (or on its way to) the public library. */
export const isPrivateItem = (item: Pick<LibraryIngredient, 'status'>) => !item.status || item.status === 'private';

/** The brewery's own brewing installations. */
export const ownInstallations = (library: LibraryIngredient[]) =>
  library.filter(l => l.type === 'equipment' && isPrivateItem(l));

/** The brewery's own water profiles. */
export const ownWaterProfiles = (library: LibraryIngredient[]) =>
  library.filter(l => l.type === 'water' && isPrivateItem(l));

/** The brewery's default installation: the one marked as default, otherwise its only one. */
export const defaultEquipment = (library: LibraryIngredient[]): LibraryIngredient | undefined => {
  const all = ownInstallations(library);
  return all.find(e => e.is_default) ?? (all.length === 1 ? all[0] : undefined);
};

/**
 * The brewing installation: the one chosen for the brew, otherwise the one the recipe
 * names, otherwise the brewery default. Undefined when there is none or the choice is
 * ambiguous (several installations, none marked as default).
 */
export const resolveEquipment = (
  recipe: Pick<Recipe, 'equipmentId'>,
  library: LibraryIngredient[],
  brewEquipmentId?: string,
): LibraryIngredient | undefined => {
  const all = ownInstallations(library);
  for (const id of [brewEquipmentId, recipe.equipmentId]) {
    const found = id ? all.find(e => e.id === id) : undefined;
    if (found) return found;
  }
  return defaultEquipment(library);
};

/**
 * Capacity of installations whose stored settings predate the capacity fields, by preset.
 * Brewie: 22 L water + grain in the mash tank (27 L), about 1 L per kg for grain and bag,
 * 23 L boil tank (Brewie's own guidance, as published by Brewie distributors).
 * Brew Monk: 40/50/70 L kettle with malt pipe, at most 8/12/18 kg of malt (Brouwland).
 * Grainfather G40: at most 13 kg of grain, 46 L boil volume (Grainfather).
 */
type PresetCapacity = Pick<LibraryIngredient, 'mash_capacity' | 'grain_displacement' | 'boil_capacity' | 'max_grain_kg'>;
const PRESET_CAPACITY: Record<string, PresetCapacity> = {
  Brewie: { mash_capacity: 22, grain_displacement: 1.0, boil_capacity: 23 },
  'Brew Monk B40': { mash_capacity: 40, boil_capacity: 40, max_grain_kg: 8 },
  'Brew Monk B50': { mash_capacity: 50, boil_capacity: 50, max_grain_kg: 12 },
  'Brew Monk B70': { mash_capacity: 70, boil_capacity: 70, max_grain_kg: 18 },
  'Grainfather G40': { mash_capacity: 46, boil_capacity: 46, max_grain_kg: 13 },
};
export const DEFAULT_GRAIN_DISPLACEMENT_L_PER_KG = 0.7;
/** Below this the mash is too thick to stir or pump. */
export const MIN_MASH_RATIO_L_PER_KG = 2.0;

/** The installation's capacity settings, falling back to its preset. */
export const equipmentCapacity = (equipment: LibraryIngredient) => {
  const preset: PresetCapacity = (equipment.preset && PRESET_CAPACITY[equipment.preset]) || {};
  const biab = equipment.equipment_type === 'biab';
  return {
    mashCapacity: equipment.mash_capacity ?? preset.mash_capacity,
    grainDisplacement: equipment.grain_displacement ?? preset.grain_displacement ?? DEFAULT_GRAIN_DISPLACEMENT_L_PER_KG,
    grainAbsorption: equipment.grain_absorption ?? (biab ? BIAB_GRAIN_ABSORPTION_L_PER_KG : GRAIN_ABSORPTION_L_PER_KG),
    boilCapacity: equipment.boil_capacity ?? preset.boil_capacity,
    maxGrainKg: equipment.max_grain_kg ?? preset.max_grain_kg,
  };
};

export type WaterWarning = 'mash_capped' | 'too_much_grain' | 'grain_over_capacity' | 'mash_over_capacity' | 'boil_over_capacity';

export interface WaterPlan {
  grainKg: number;
  mashWaterL: number;
  spargeWaterL: number;
  totalWaterL: number;
  preBoilL: number;
  postBoilL: number;
  intoFermenterL: number;  // differs from the batch when the water is set by hand
  expectedOg?: number;     // OG for that volume
  mashTempC?: number;
  grainTempC: number;
  strikeTempC?: number;
  preBoilSg?: number;
  suggestedMashL: number;  // what the app would use (shown as placeholder)
  suggestedSpargeL: number;
  manual: boolean;
  /** planned ÷ actual volume after the boil: >1 when less water than the recipe needs makes stronger wort */
  volumeFactor: number;
  maxMashL?: number;
  trubLossL: number;
  warnings: WaterWarning[];
}

/**
 * Water for brew day from the recipe and the installation.
 * Needed: into fermenter (batch) − top-up + trub/chiller loss (0 with "drain all") = after boil;
 * + evaporation = before boil; + grain absorption + lauter dead space = total water.
 * Mash water: BIAB all of it; otherwise the recipe's first infusion or 3 L/kg, but never more than
 * fits next to the grain (mash capacity − grain × displacement); the rest is sparge water.
 * Mash and sparge water can be set by hand per recipe; the volumes and OG then follow from them.
 * Strike temperature: T + 0.41 / ratio × (T − grain temperature) (Palmer, metric).
 */
export const waterPlan = (recipe: Recipe, equipment: LibraryIngredient, og?: number): WaterPlan => {
  const mashed = (recipe.ingredients?.fermentables ?? []).filter(f => isMashed(f.type));
  const grainKg = mashed.reduce((sum, f) => sum + fermentableKg(f), 0);
  const biab = equipment.equipment_type === 'biab';
  const cap = equipmentCapacity(equipment);
  const warnings: WaterWarning[] = [];

  const topUp = equipment.top_up_water || 0;
  const trubLossL = recipe.water?.drain_all ? 0 : (equipment.trub_chiller_loss || 0);
  const evapL = (equipment.evap_rate || 0) * (recipe.boil_time?.value ?? equipment.boil_time ?? 60) / 60;
  const absorptionL = grainKg * cap.grainAbsorption;
  const deadspaceL = equipment.lauter_deadspace || 0;

  // What the recipe needs
  const batchL = batchLiters(recipe);
  const neededPostBoil = Math.max(0, batchL - topUp) + trubLossL;
  const neededTotal = neededPostBoil + evapL + absorptionL + deadspaceL;

  const maxMashL = cap.mashCapacity !== undefined ? Math.max(0, cap.mashCapacity - grainKg * cap.grainDisplacement) : undefined;
  const firstStep = recipe.mash?.steps?.[0];
  const infusion = firstStep?.infuse_amount && firstStep.infuse_amount > 0 ? firstStep.infuse_amount : undefined;
  let suggestedMashL = biab ? neededTotal : Math.min(neededTotal, infusion ?? grainKg * DEFAULT_MASH_RATIO_L_PER_KG);
  if (maxMashL !== undefined && suggestedMashL > maxMashL) {
    suggestedMashL = maxMashL;
    warnings.push('mash_capped');
  }
  if (grainKg > 0 && maxMashL !== undefined && maxMashL / grainKg < MIN_MASH_RATIO_L_PER_KG) warnings.push('too_much_grain');
  if (cap.maxGrainKg !== undefined && grainKg > cap.maxGrainKg + 0.005) warnings.push('grain_over_capacity');
  const suggestedSpargeL = Math.max(0, neededTotal - suggestedMashL);

  // What will be used: own values where given
  const manual = recipe.water?.mash_l !== undefined || recipe.water?.sparge_l !== undefined;
  const mashWaterL = recipe.water?.mash_l ?? suggestedMashL;
  const spargeWaterL = recipe.water?.sparge_l ?? (recipe.water?.mash_l !== undefined ? Math.max(0, neededTotal - mashWaterL) : suggestedSpargeL);
  const totalWaterL = mashWaterL + spargeWaterL;
  if (manual && maxMashL !== undefined && mashWaterL > maxMashL + 0.05) warnings.push('mash_over_capacity');

  const preBoilL = Math.max(0, totalWaterL - absorptionL - deadspaceL);
  const postBoilL = Math.max(0, preBoilL - evapL);
  const intoFermenterL = Math.max(0, postBoilL - trubLossL + topUp);
  if (cap.boilCapacity !== undefined && preBoilL > cap.boilCapacity + 0.05) warnings.push('boil_over_capacity');

  // The recipe's OG is for the planned volume; other volumes dilute or concentrate it
  const expectedOg = og && og > 1 && postBoilL > 0 ? 1 + (og - 1) * neededPostBoil / postBoilL : undefined;
  const preBoilSg = expectedOg && preBoilL > 0 ? 1 + (expectedOg - 1) * postBoilL / preBoilL : undefined;

  const mashTempC = firstStep ? (firstStep.temperature ?? firstStep.step_temp) : undefined;
  const grainTempC = recipe.mash?.grain_temp || equipment.grain_temp || DEFAULT_GRAIN_TEMP_C;
  const ratio = grainKg > 0 ? mashWaterL / grainKg : 0;
  const strikeTempC = mashTempC !== undefined && ratio > 0
    ? mashTempC + (0.41 / ratio) * (mashTempC - grainTempC)
    : undefined;

  return {
    grainKg, mashWaterL, spargeWaterL, totalWaterL, preBoilL, postBoilL, intoFermenterL, expectedOg,
    mashTempC, grainTempC, strikeTempC, preBoilSg, suggestedMashL, suggestedSpargeL, manual, maxMashL, trubLossL, warnings,
    volumeFactor: postBoilL > 0 ? neededPostBoil / postBoilL : 1,
  };
};

export const calculateRecipeStats = (recipe: Recipe, alphaOverrides?: Record<string, number>, equipment?: LibraryIngredient) => {
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

  // The recipe is designed for its batch volume. With water set by hand, the wort after the boil
  // has another volume: the same extract, colour and bitterness in more or less wort.
  const plannedOg = 1 + ((maltPoints + sugarPoints + unfermentablePoints) / 1000);
  const plan = equipment && recipe.water && (recipe.water.mash_l !== undefined || recipe.water.sparge_l !== undefined)
    ? waterPlan(recipe, equipment) : undefined;
  const volumeFactor = plan?.volumeFactor ?? 1;
  maltPoints *= volumeFactor;
  sugarPoints *= volumeFactor;
  unfermentablePoints *= volumeFactor;
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
  mcu *= volumeFactor;
  const colorSRM = mcu > 0 ? 1.4922 * Math.pow(mcu, 0.6859) : 0;

  // Tinseth, with the usual corrections for hop form and use. Tinseth's gravity is that of the
  // boiling wort: with an installation (known evaporation) the average of pre-boil and OG.
  const preBoilSg = equipment ? waterPlan(recipe, equipment, plannedOg).preBoilSg : undefined;
  const boilGravity = preBoilSg ? (preBoilSg + og) / 2 : og;
  const bignessFactor = 1.65 * Math.pow(0.000125, (boilGravity - 1));
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

    ibu += (alpha * weightG * utilization * 10) / (batchSizeL || 1) * volumeFactor;
  });

  return {
    og,
    fg,
    abv,
    color: colorSRM,
    ibu: Math.round(ibu),
    /** OG for the recipe's batch volume, before any water set by hand (input for waterPlan) */
    plannedOg,
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

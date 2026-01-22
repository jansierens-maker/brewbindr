
import { Recipe } from "../types";

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
 * Formatteert een getal op basis van taal en specifieke brouw-regels:
 * - Gram: Geen decimalen
 * - Kilogram: Max 3 decimalen
 * - ABV: 1 decimaal
 */
export const formatBrewNumber = (val: number | undefined, type: 'g' | 'kg' | 'abv' | 'og' | 'default', lang: string): string => {
  if (val === undefined || isNaN(val)) return '-';
  
  const locale = lang === 'en' ? 'en-US' : 'nl-NL';
  let options: Intl.NumberFormatOptions = {};

  switch (type) {
    case 'g':
      options = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
      break;
    case 'kg':
      options = { minimumFractionDigits: 0, maximumFractionDigits: 3 };
      break;
    case 'abv':
      options = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
      break;
    case 'og':
      options = { minimumFractionDigits: 3, maximumFractionDigits: 3 };
      break;
    default:
      options = { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  }

  return new Intl.NumberFormat(locale, options).format(val);
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

export const calculateABV = (og: number | undefined, fg: number | undefined, isBottled: boolean, sugarG: number = 0, volumeL: number = 1): number => {
  if (!og || !fg || og <= fg) return 0;
  let abv = (og - fg) * 131.25;
  if (isBottled && sugarG > 0 && volumeL > 0) {
    const sugarPerLiter = sugarG / volumeL;
    abv += (sugarPerLiter * 0.05);
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

export const calculateRecipeStats = (recipe: Recipe, alphaOverrides?: Record<string, number>) => {
  const batchUnit = normalizeUnit(recipe.batch_size?.unit);
  const batchSizeL = batchUnit === 'liters' ? (recipe.batch_size?.value || 0) : (recipe.batch_size?.value || 0) * 3.78541;
  const efficiency = (recipe.efficiency?.brewhouse || 75) / 100;

  const fermentables = recipe.ingredients?.fermentables ?? [];
  const hops = recipe.ingredients?.hops ?? [];
  const cultures = recipe.ingredients?.cultures ?? [];

  let totalPoints = 0;
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
    totalPoints += (weightKg * pkl * efficiency) / (batchSizeL || 1);
  });

  const og = 1 + (totalPoints / 1000);
  const avgAttenuation = cultures.length > 0 
    ? cultures.reduce((acc, c) => acc + (c.attenuation || 75), 0) / cultures.length
    : 75;
    
  const fg = 1 + ((og - 1) * (1 - (avgAttenuation / 100)));
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

  let ibu = 0;
  hops.forEach(h => {
    if (!h.amount || !h.time) return;
    if (h.use === 'boil' || h.use === 'first_wort' || h.use === 'whirlpool') {
      const alpha = alphaOverrides?.[h.name] !== undefined ? alphaOverrides[h.name] : (h.alpha_acid?.value || 5);
      const unit = normalizeUnit(h.amount.unit);
      let weightG = h.amount.value;
      if (unit === 'ounces') weightG = h.amount.value * 28.3495;
      else if (unit === 'kilograms') weightG = h.amount.value * 1000;
      else if (unit === 'pounds') weightG = h.amount.value * 453.592;

      const time = h.time.value;
      const bignessFactor = 1.65 * Math.pow(0.000125, (og - 1));
      const timeFactor = (1 - Math.exp(-0.04 * time)) / 4.15;
      let utilization = bignessFactor * timeFactor;
      if (h.use === 'whirlpool') utilization = bignessFactor * ((1 - Math.exp(-0.04 * 10)) / 4.15) * 0.5;
      ibu += (alpha * weightG * utilization * 10) / (batchSizeL || 1);
    }
  });

  return {
    og,
    fg,
    abv,
    color: colorSRM,
    ibu: Math.round(ibu)
  };
};

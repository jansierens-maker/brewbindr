import { LibraryIngredient } from '../types';

/** Brewing ions in mg/L (ppm). */
export interface Ions {
  ca: number;   // calcium
  mg: number;   // magnesium
  na: number;   // sodium
  cl: number;   // chloride
  so4: number;  // sulfate
  hco3: number; // bicarbonate
}

export const ION_KEYS: (keyof Ions)[] = ['ca', 'mg', 'na', 'cl', 'so4', 'hco3'];
export const ZERO_IONS: Ions = { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 0 };

export interface WaterProfilePreset extends Ions {
  key: string;
  name: string;
  kind: 'source' | 'target' | 'style';
}

/**
 * Classic city waters (Palmer, How to Brew) and target profiles for styles, with the usual
 * guideline values for calcium, sulfate/chloride balance and alkalinity by beer colour.
 */
export const WATER_PRESETS: WaterProfilePreset[] = [
  { key: 'ro', kind: 'source', name: 'Osmose / gedemineraliseerd', ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 0 },
  { key: 'pilsen', kind: 'source', name: 'Pilsen', ca: 7, mg: 2, na: 2, cl: 5, so4: 5, hco3: 15 },
  { key: 'munich', kind: 'source', name: 'München', ca: 77, mg: 17, na: 4, cl: 8, so4: 18, hco3: 295 },
  { key: 'vienna', kind: 'source', name: 'Wenen', ca: 200, mg: 60, na: 8, cl: 12, so4: 125, hco3: 120 },
  { key: 'dortmund', kind: 'source', name: 'Dortmund', ca: 225, mg: 40, na: 60, cl: 60, so4: 120, hco3: 220 },
  { key: 'dublin', kind: 'source', name: 'Dublin', ca: 118, mg: 4, na: 12, cl: 19, so4: 54, hco3: 319 },
  { key: 'edinburgh', kind: 'source', name: 'Edinburgh', ca: 120, mg: 25, na: 55, cl: 65, so4: 140, hco3: 225 },
  { key: 'london', kind: 'source', name: 'Londen', ca: 52, mg: 32, na: 86, cl: 34, so4: 32, hco3: 104 },
  { key: 'burton', kind: 'source', name: 'Burton-on-Trent', ca: 352, mg: 24, na: 44, cl: 16, so4: 820, hco3: 320 },
  { key: 'light_balanced', kind: 'target', name: 'Licht – gebalanceerd', ca: 50, mg: 7, na: 5, cl: 60, so4: 75, hco3: 0 },
  { key: 'light_hoppy', kind: 'target', name: 'Licht – hoppig', ca: 75, mg: 7, na: 5, cl: 50, so4: 150, hco3: 0 },
  { key: 'light_malty', kind: 'target', name: 'Licht – moutig', ca: 50, mg: 7, na: 5, cl: 90, so4: 50, hco3: 0 },
  { key: 'amber_balanced', kind: 'target', name: 'Amber – gebalanceerd', ca: 50, mg: 10, na: 15, cl: 60, so4: 80, hco3: 40 },
  { key: 'dark_balanced', kind: 'target', name: 'Donker – gebalanceerd', ca: 50, mg: 10, na: 15, cl: 65, so4: 70, hco3: 120 },

  // Beer styles: middle of the published ranges (Commercial Water Lab, Brewing Water Chemistry
  // by style, 2026), tripel per BYO (Ca 50–75, carbonates < 50), NEIPA per Brülosophy
  // (Ca 111, SO4 100, Cl 150). Dubbel, quadrupel, witbier and blond are derived from the
  // amber/Belgian and wheat ranges.
  { key: 'style_west_coast_ipa', kind: 'style', name: 'West Coast IPA / DIPA', ca: 160, mg: 8, na: 20, cl: 60, so4: 300, hco3: 25 },
  { key: 'style_american_ipa', kind: 'style', name: 'American IPA', ca: 125, mg: 8, na: 25, cl: 75, so4: 225, hco3: 25 },
  { key: 'style_neipa', kind: 'style', name: 'New England IPA', ca: 110, mg: 5, na: 10, cl: 150, so4: 100, hco3: 0 },
  { key: 'style_english_ipa', kind: 'style', name: 'English IPA (Burton)', ca: 300, mg: 30, na: 40, cl: 30, so4: 600, hco3: 140 },
  { key: 'style_pale_ale', kind: 'style', name: 'Pale ale', ca: 100, mg: 8, na: 20, cl: 60, so4: 150, hco3: 25 },
  { key: 'style_czech_pils', kind: 'style', name: 'Tsjechische pils', ca: 15, mg: 3, na: 5, cl: 10, so4: 10, hco3: 10 },
  { key: 'style_german_pils', kind: 'style', name: 'Duitse pils / lichte lager', ca: 60, mg: 10, na: 15, cl: 40, so4: 50, hco3: 15 },
  { key: 'style_belgian_blond', kind: 'style', name: 'Belgisch blond', ca: 75, mg: 10, na: 15, cl: 70, so4: 60, hco3: 40 },
  { key: 'style_tripel', kind: 'style', name: 'Tripel', ca: 65, mg: 10, na: 10, cl: 60, so4: 60, hco3: 25 },
  { key: 'style_saison', kind: 'style', name: 'Saison', ca: 100, mg: 10, na: 30, cl: 75, so4: 60, hco3: 75 },
  { key: 'style_witbier', kind: 'style', name: 'Witbier', ca: 60, mg: 5, na: 15, cl: 60, so4: 40, hco3: 30 },
  { key: 'style_weizen', kind: 'style', name: 'Weizen', ca: 75, mg: 10, na: 15, cl: 50, so4: 50, hco3: 75 },
  { key: 'style_dubbel', kind: 'style', name: 'Dubbel', ca: 75, mg: 10, na: 15, cl: 75, so4: 50, hco3: 100 },
  { key: 'style_quadrupel', kind: 'style', name: 'Quadrupel', ca: 75, mg: 10, na: 15, cl: 80, so4: 50, hco3: 125 },
  { key: 'style_amber', kind: 'style', name: 'Amber / Weense lager', ca: 100, mg: 12, na: 20, cl: 75, so4: 75, hco3: 75 },
  { key: 'style_marzen', kind: 'style', name: 'Märzen / Dunkel', ca: 80, mg: 18, na: 20, cl: 15, so4: 20, hco3: 175 },
  { key: 'style_irish_stout', kind: 'style', name: 'Irish stout', ca: 100, mg: 15, na: 30, cl: 75, so4: 50, hco3: 150 },
  { key: 'style_stout_porter', kind: 'style', name: 'Stout / porter', ca: 100, mg: 10, na: 20, cl: 110, so4: 75, hco3: 75 },
  { key: 'style_imperial_stout', kind: 'style', name: 'Imperial stout / Baltic porter', ca: 125, mg: 15, na: 30, cl: 110, so4: 75, hco3: 110 },
];

/** Library water profiles store their ions as calcium … bicarbonate (mg/L). */
export const ionsOf = (w: Partial<LibraryIngredient> | WaterProfilePreset | undefined): Ions => {
  if (!w) return { ...ZERO_IONS };
  if ('ca' in w) return { ca: w.ca, mg: w.mg, na: w.na, cl: w.cl, so4: w.so4, hco3: w.hco3 };
  const l = w as Partial<LibraryIngredient>;
  return {
    ca: l.calcium || 0, mg: l.magnesium || 0, na: l.sodium || 0,
    cl: l.chloride || 0, so4: l.sulfate || 0, hco3: l.bicarbonate || 0,
  };
};

export type SaltId = 'gypsum' | 'cacl2' | 'cacl2_33' | 'cacl2_36' | 'epsom' | 'nacl' | 'nahco3';
export type CaCl2Form = 'cacl2' | 'cacl2_33' | 'cacl2_36';

/**
 * mg of each ion per g of salt (per ml for the solutions): molar mass ratios.
 * Calcium chloride flakes are the dihydrate. The solutions are % anhydrous CaCl2 by weight;
 * densities 1.32 (33 %) and 1.35 g/ml (36 %).
 */
export const SALTS: Record<SaltId, { unit: 'g' | 'ml'; ions: Partial<Ions> }> = {
  gypsum: { unit: 'g', ions: { ca: 232.8, so4: 557.9 } },          // CaSO4·2H2O
  cacl2: { unit: 'g', ions: { ca: 272.6, cl: 482.3 } },            // CaCl2·2H2O
  cacl2_33: { unit: 'ml', ions: { ca: 0.33 * 1.32 * 361.1, cl: 0.33 * 1.32 * 638.9 } },
  cacl2_36: { unit: 'ml', ions: { ca: 0.36 * 1.35 * 361.1, cl: 0.36 * 1.35 * 638.9 } },
  epsom: { unit: 'g', ions: { mg: 98.6, so4: 389.6 } },            // MgSO4·7H2O
  nacl: { unit: 'g', ions: { na: 393.4, cl: 606.6 } },             // table salt
  nahco3: { unit: 'g', ions: { na: 273.7, hco3: 726.3 } },         // baking soda
};

export type SaltAmounts = Partial<Record<SaltId, number>>;

/** Source water, diluted with osmosis water, plus salts dissolved in the given volume. */
export const treatedWater = (source: Ions, dilutionPct: number, salts: SaltAmounts, volumeL: number): Ions => {
  const keep = 1 - Math.min(100, Math.max(0, dilutionPct || 0)) / 100;
  const result = { ...ZERO_IONS };
  ION_KEYS.forEach(k => { result[k] = source[k] * keep; });
  if (volumeL > 0) {
    (Object.keys(salts) as SaltId[]).forEach(id => {
      const amount = salts[id] || 0;
      const ions = SALTS[id]?.ions || {};
      (Object.keys(ions) as (keyof Ions)[]).forEach(k => { result[k] += (ions[k]! * amount) / volumeL; });
    });
  }
  return result;
};

/** Alkalinity as CaCO3 (ppm) from bicarbonate. */
export const alkalinity = (ions: Ions): number => ions.hco3 * 50 / 61;

/** Residual alkalinity as CaCO3 (Kolbach): alkalinity − Ca/1.4 − Mg/1.7 (ions in mg/L). */
export const residualAlkalinity = (ions: Ions): number => alkalinity(ions) - ions.ca / 1.4 - ions.mg / 1.7;

/** Sulfate to chloride ratio; above 2 bitter, 0.8–2 balanced, below 0.8 malty. */
export const sulfateChlorideRatio = (ions: Ions): number | undefined =>
  ions.cl > 0 ? ions.so4 / ions.cl : ions.so4 > 0 ? Infinity : undefined;

export const ratioCharacter = (ratio: number | undefined): 'bitter' | 'balanced' | 'malty' | undefined =>
  ratio === undefined ? undefined : ratio > 2 ? 'bitter' : ratio >= 0.8 ? 'balanced' : 'malty';

/**
 * Salt additions that bring the water closest to the target (least squares on the six ions,
 * salts can only be added). Coordinate descent with non-negative amounts; rounded to 0.1 g/ml.
 */
export const suggestSalts = (
  start: Ions,
  target: Ions,
  volumeL: number,
  cacl2Form: CaCl2Form = 'cacl2_33',
): SaltAmounts => {
  if (volumeL <= 0) return {};
  const ids: SaltId[] = ['gypsum', cacl2Form, 'epsom', 'nacl'];
  if (target.hco3 > start.hco3) ids.push('nahco3');
  // Bicarbonate matters less for flavour than the others (it is mostly a pH lever)
  const weight: Ions = { ca: 1, mg: 1, na: 1, cl: 1, so4: 1, hco3: 0.5 };
  // Effect of 1 unit of each salt on each ion, in mg/L
  const effect = ids.map(id => ION_KEYS.map(k => (SALTS[id].ions[k] || 0) / volumeL));
  const x = ids.map(() => 0);
  const current = () => ION_KEYS.map((k, i) => start[k] + ids.reduce((s, _, j) => s + effect[j][i] * x[j], 0));

  for (let iter = 0; iter < 500; iter++) {
    let changed = false;
    for (let j = 0; j < ids.length; j++) {
      const now = current();
      let num = 0;
      let den = 0;
      ION_KEYS.forEach((k, i) => {
        const w = weight[k];
        num += w * effect[j][i] * (target[k] - now[i]);
        den += w * effect[j][i] ** 2;
      });
      if (den === 0) continue;
      const next = Math.max(0, x[j] + num / den);
      if (Math.abs(next - x[j]) > 1e-9) { x[j] = next; changed = true; }
    }
    if (!changed) break;
  }

  const result: SaltAmounts = {};
  ids.forEach((id, j) => {
    const rounded = Math.round(x[j] * 10) / 10;
    if (rounded > 0) result[id] = rounded;
  });
  return result;
};

// ---------------------------------------------------------------------------------------------
// Mash pH
// ---------------------------------------------------------------------------------------------

export type MaltClass = 'base' | 'crystal' | 'roast' | 'acid';

/** Kind of malt for the pH model, from the name (and colour in SRM for unnamed dark malts). */
export const maltClass = (name: string | undefined, colorSrm: number): MaltClass => {
  const n = (name || '').toLowerCase();
  if (/acid|sauer|zuur|acidul/.test(n)) return 'acid';
  if (/roast|black|chocolate|choc|carafa|geroost|zwart|torréfié|noir|chocolat|patent/.test(n)) return 'roast';
  if (/crystal|caramel|cara|kristal|karamel|special b|crystal/.test(n)) return 'crystal';
  if (colorSrm > 200) return 'roast';
  if (colorSrm > 15) return 'crystal';
  return 'base';
};

/**
 * pH of a malt mashed in distilled water (Kai Troester's measurements, simplified):
 * pale base malt 5.72, darker base malts down to about 5.5 (Munich), crystal malts
 * 5.22 − 0.00504 × colour (°L), roasted malts 4.71.
 */
export const maltDistilledPh = (cls: MaltClass, colorSrm: number): number => {
  switch (cls) {
    case 'roast': return 4.71;
    case 'crystal': return 5.22 - 0.00504 * colorSrm;
    case 'acid': return 5.72; // its acid is counted separately
    default: return Math.max(5.4, 5.72 - 0.0275 * Math.max(0, colorSrm - 2));
  }
};

/** How strongly a kilo of malt resists a pH change (mEq per kg per pH unit). */
export const MALT_BUFFER_MEQ_PER_KG = 40;
/** Acidulated malt: about 0.1 pH lower per 1 % of the grist (rule of thumb) → mEq of acid per kg. */
export const ACID_MALT_MEQ_PER_KG = 400;
/** Lactic acid 80 % (1.18 g/ml): mEq per ml at mash pH. */
export const LACTIC_80_MEQ_PER_ML = 10.2;
export const DEFAULT_TARGET_MASH_PH = 5.4;

export interface MashMalt { name: string; kg: number; colorSrm: number }

/**
 * Estimated mash pH: the malts' own pH weighted by their buffering, shifted by the
 * mash water's residual alkalinity and lowered by acid (charge balance):
 * pH = (Σ kg·B·pH_malt + RA_mEq − acid_mEq) / Σ kg·B.
 */
export const estimateMashPh = (malts: MashMalt[], mashIons: Ions, mashWaterL: number, lacticMl = 0): number | undefined => {
  let buffer = 0;
  let weighted = 0;
  let acidMeq = lacticMl * LACTIC_80_MEQ_PER_ML;
  malts.forEach(m => {
    if (!(m.kg > 0)) return;
    const cls = maltClass(m.name, m.colorSrm);
    buffer += m.kg * MALT_BUFFER_MEQ_PER_KG;
    weighted += m.kg * MALT_BUFFER_MEQ_PER_KG * maltDistilledPh(cls, m.colorSrm);
    if (cls === 'acid') acidMeq += m.kg * ACID_MALT_MEQ_PER_KG;
  });
  if (buffer === 0) return undefined;
  const raMeq = (residualAlkalinity(mashIons) / 50) * mashWaterL;
  return (weighted + raMeq - acidMeq) / buffer;
};

/** Lactic acid 80 % (ml) that brings the estimated mash pH to the target; 0 when already at or below. */
export const lacticAcidFor = (malts: MashMalt[], mashIons: Ions, mashWaterL: number, targetPh = DEFAULT_TARGET_MASH_PH): number => {
  const ph = estimateMashPh(malts, mashIons, mashWaterL);
  if (ph === undefined || ph <= targetPh) return 0;
  const buffer = malts.reduce((s, m) => s + (m.kg > 0 ? m.kg * MALT_BUFFER_MEQ_PER_KG : 0), 0);
  return Math.round(((ph - targetPh) * buffer / LACTIC_80_MEQ_PER_ML) * 10) / 10;
};

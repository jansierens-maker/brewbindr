import { LibraryIngredient, Misc, Recipe } from '../types';
import { nameKey } from './duplicates';

/**
 * Water in BeerXML (#water-import):
 * - <WATERS><WATER> inside a RECIPE are the recipe's water profiles. The non-standard tag
 *   <WATER_KIND>base|target</WATER_KIND> says which is the base water and which the target
 *   profile (without it: base). Other programs ignore unknown tags, so files stay BeerXML 1.0.
 * - Water salts and lactic acid come as MISC with TYPE "Water Agent". A recognised one becomes
 *   part of the water treatment (water_chem.salts in g, lactic_ml) and leaves the misc list,
 *   so it is shown and counted once: the water calculation only uses water_chem.
 */

export type WaterChem = NonNullable<Recipe['water_chem']>;
export type SaltId = keyof NonNullable<WaterChem['salts']>;
export type WaterRole = 'source' | 'target';

/** A recipe's water profile from BeerXML, to be saved in the library and linked to the recipe. */
export interface RecipeWater {
  recipeId: string;
  role: WaterRole;
  water: Partial<LibraryIngredient> & { name: string; type: 'water' };
}

const WATER_AGENT_TYPES = new Set(['water agent', 'water_agent', 'wateragent']);
export const isWaterAgent = (type: string | undefined) => WATER_AGENT_TYPES.has((type || '').trim().toLowerCase());

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recognised names (NL, EN, FR, formulas), checked in this order. */
const RULES: { match: RegExp; to: 'gypsum' | 'cacl2' | 'epsom' | 'nacl' | 'nahco3' | 'lactic' }[] = [
  { match: /lactic|melkzuur|acide lactique/, to: 'lactic' },
  { match: /gyps|gips|caso4|calcium ?sul(f|ph)aa?t|sulfate de calcium/, to: 'gypsum' },
  { match: /calcium ?chlori|cacl2|chlorure de calcium/, to: 'cacl2' },
  { match: /epsom|mgso4|magnesium ?sul(f|ph)aa?t|bitterzout|sulfate de magnesium/, to: 'epsom' },
  { match: /bicarbonaa?t|nahco3|baking soda|zuiveringszout/, to: 'nahco3' },
  { match: /keukenzout|nacl|table salt|sodium chloride|natriumchloride|sel de table|^salt$|^zout$|^sel$/, to: 'nacl' },
];

/**
 * The water treatment entry for a water agent: a salt (g; a calcium chloride solution in ml)
 * or lactic acid (ml), or undefined when the name is not recognised.
 */
export const waterAgentEntry = (name: string, isWeight?: boolean): { salt: SaltId } | { lactic: true } | undefined => {
  const n = norm(name);
  const rule = RULES.find(r => r.match.test(n));
  if (!rule) return undefined;
  if (rule.to === 'lactic') return { lactic: true };
  if (rule.to === 'cacl2') {
    if (/36\s*%/.test(n)) return { salt: 'cacl2_36' };
    if (/33\s*%/.test(n) || /oplossing|solution|liquid|vloeibaar/.test(n) || isWeight === false) return { salt: 'cacl2_33' };
    return { salt: 'cacl2' };
  }
  return { salt: rule.to };
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Moves recognised water agents (amount in g, or ml for liquids) from the misc list into the
 * water treatment. Several entries of the same salt add up.
 */
export const waterAgentsToChem = (
  miscs: (Misc & { isWeight?: boolean })[],
  chem: WaterChem | undefined,
): { miscs: Misc[]; chem: WaterChem | undefined } => {
  const next: WaterChem = { ...(chem ?? {}) };
  const salts: NonNullable<WaterChem['salts']> = { ...(next.salts ?? {}) };
  const rest: Misc[] = [];
  for (const m of miscs) {
    const { isWeight, ...misc } = m;
    const entry = isWaterAgent(m.type) ? waterAgentEntry(m.name, isWeight) : undefined;
    const amount = m.amount?.value || 0;
    if (!entry || amount <= 0) { rest.push(misc); continue; }
    if ('lactic' in entry) next.lactic_ml = round1((next.lactic_ml ?? 0) + amount);
    else {
      salts[entry.salt] = round1((salts[entry.salt] ?? 0) + amount);
      if (entry.salt.startsWith('cacl2')) next.cacl2_form = entry.salt as WaterChem['cacl2_form'];
    }
  }
  if (Object.keys(salts).length) next.salts = salts;
  return { miscs: rest, chem: Object.keys(next).length ? next : undefined };
};

const SALT_EXPORT: Record<SaltId, { name: string; isWeight: boolean }> = {
  gypsum: { name: 'Gypsum (CaSO4)', isWeight: true },
  cacl2: { name: 'Calcium Chloride (CaCl2)', isWeight: true },
  cacl2_33: { name: 'Calcium Chloride 33% solution (CaCl2)', isWeight: false },
  cacl2_36: { name: 'Calcium Chloride 36% solution (CaCl2)', isWeight: false },
  epsom: { name: 'Epsom Salt (MgSO4)', isWeight: true },
  nacl: { name: 'Table Salt (NaCl)', isWeight: true },
  nahco3: { name: 'Baking Soda (NaHCO3)', isWeight: true },
};

/** The water treatment's salts and lactic acid as BeerXML water agents (amount in g or ml). */
export const chemToWaterAgents = (chem: WaterChem | undefined): { name: string; amount: number; isWeight: boolean }[] => {
  const out: { name: string; amount: number; isWeight: boolean }[] = [];
  (Object.entries(chem?.salts ?? {}) as [SaltId, number][]).forEach(([id, g]) => {
    if (g > 0 && SALT_EXPORT[id]) out.push({ ...SALT_EXPORT[id], amount: g });
  });
  if ((chem?.lactic_ml ?? 0) > 0) out.push({ name: 'Lactic Acid 80%', amount: chem!.lactic_ml!, isWeight: false });
  return out;
};

/** True when a misc is a water agent that the water treatment already holds (export would count it twice). */
export const coveredByChem = (m: Misc, chem: WaterChem | undefined): boolean => {
  if (!chem || !isWaterAgent(m.type)) return false;
  const entry = waterAgentEntry(m.name);
  if (!entry) return false;
  if ('lactic' in entry) return (chem.lactic_ml ?? 0) > 0;
  const salts = chem.salts ?? {};
  return entry.salt.startsWith('cacl2')
    ? (['cacl2', 'cacl2_33', 'cacl2_36'] as SaltId[]).some(s => (salts[s] ?? 0) > 0)
    : (salts[entry.salt] ?? 0) > 0;
};

const ION_FIELDS = ['calcium', 'magnesium', 'sodium', 'chloride', 'sulfate', 'bicarbonate'] as const;

/** Same water profile: same name, kind and minerals (to 0.1 mg/L). */
export const isSameWater = (a: Partial<LibraryIngredient>, b: Partial<LibraryIngredient>): boolean =>
  nameKey(a.name) === nameKey(b.name) &&
  (a.water_kind ?? 'base') === (b.water_kind ?? 'base') &&
  ION_FIELDS.every(k => round1(Number(a[k]) || 0) === round1(Number(b[k]) || 0));

/** Links the water profiles saved during an import to the recipe's water treatment. */
export const withWaterLinks = (recipe: Recipe, links: Partial<Record<WaterRole, string>> | undefined): Recipe => {
  if (!links || (!links.source && !links.target)) return recipe;
  return { ...recipe, water_chem: { ...(recipe.water_chem ?? {}), ...links } };
};

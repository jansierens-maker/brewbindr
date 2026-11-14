/**
 * Flavour Lab calculation (spec §6–§8): pure functions, no React or Supabase.
 *
 * A recipe becomes an aroma vector: for each aroma compound the sum over the recognised
 * ingredients of weight × intensity × retention. A candidate ingredient gets the same kind of
 * vector, and its score is the cosine similarity with the recipe, 0–100. The bridge compounds
 * are the compounds that make up most of the dot product.
 */
import type { Culture, Hop, Misc, Recipe } from '../types';
import {
  FlavourStage, Volatility, RETENTION, MAX_WEIGHT, MIN_SCORE, TOP_N, MAX_BRIDGES, MIN_BRIDGE_SHARE, MIN_FAMILY_BRIDGE_SHARE,
  LONG_BOIL_MIN, SHORT_BOIL_MIN, STAGE_TO_MISC, FAMILY_WEIGHT, POTENCY_WEIGHT, YEAST_WEIGHT,
} from './flavourConfig';

export type FlavourCategory = 'spice' | 'hop' | 'yeast' | 'malt';
export type FlavourLang = 'nl' | 'fr' | 'en';
export type SpiceForm = 'whole' | 'crushed' | 'zest' | 'tincture';
export type SpiceStage = Exclude<FlavourStage, 'yeast' | 'malt'>;

export interface AromaFamily { id: string; name_nl: string; name_fr: string; name_en: string; color: string; sort: number }
export interface AromaCompound {
  id: string; name: string; family_id: string; volatility: Volatility;
  /** Smelled at low concentrations (low odour threshold): counts POTENCY_WEIGHT times in scores */
  aroma_active: boolean;
  descriptor_nl: string; descriptor_fr: string; descriptor_en: string;
}
export interface FlavourIngredient {
  id: string; category: FlavourCategory;
  name_nl: string; name_fr: string; name_en: string;
  aliases: string[];
  dose_min_g_per_l: number | null; dose_max_g_per_l: number | null;
  preferred_stage: SpiceStage | null; form: SpiceForm | null; yeast_pof: boolean | null;
  notes_nl: string | null; notes_fr: string | null; notes_en: string | null;
}
export interface IngredientCompound { ingredient_id: string; compound_id: string; intensity: number; source_id: string }
export interface DataSource { id: string; title: string; url: string | null; type: string; accessed_on: string; note: string | null }
export interface FlavourKb {
  families: AromaFamily[]; compounds: AromaCompound[]; ingredients: FlavourIngredient[];
  links: IngredientCompound[]; sources: DataSource[];
}

/** A manual link: a recipe name (normalised) to a knowledge-base ingredient, or null = leave out. */
export interface FlavourMapping { category: FlavourCategory; name_key: string; ingredient_id: string | null }

// ---------- Names ----------

/** Name key: lower case, no accents, punctuation as spaces ("Hallertauer MF" → "hallertauer mf"). */
export const nameKey = (s: string): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();

export const ingredientName = (i: FlavourIngredient, lang: FlavourLang) => i[`name_${lang}`] || i.name_en || i.name_nl;
export const familyName = (f: AromaFamily, lang: FlavourLang) => f[`name_${lang}`] || f.name_en;
export const compoundDescriptor = (c: AromaCompound, lang: FlavourLang) => c[`descriptor_${lang}`] || c.descriptor_en;
export const ingredientNotes = (i: FlavourIngredient, lang: FlavourLang) => i[`notes_${lang}`] || i.notes_en || null;

interface NameIndex { exact: Map<string, string>; byTokens: { tokens: string[]; id: string }[] }

const indexes = new WeakMap<FlavourKb, Record<FlavourCategory, NameIndex>>();

const nameIndex = (kb: FlavourKb): Record<FlavourCategory, NameIndex> => {
  const hit = indexes.get(kb);
  if (hit) return hit;
  const idx = {} as Record<FlavourCategory, NameIndex>;
  for (const cat of ['spice', 'hop', 'yeast', 'malt'] as FlavourCategory[]) idx[cat] = { exact: new Map(), byTokens: [] };
  for (const i of kb.ingredients) {
    const names = [i.name_nl, i.name_fr, i.name_en, ...i.aliases].map(nameKey).filter(Boolean);
    for (const k of new Set(names)) {
      if (!idx[i.category].exact.has(k)) idx[i.category].exact.set(k, i.id);
      idx[i.category].byTokens.push({ tokens: k.split(' '), id: i.id });
    }
  }
  // Longest names first, so "hallertauer magnum" wins over "magnum"
  for (const cat of Object.values(idx)) cat.byTokens.sort((a, b) => b.tokens.join(' ').length - a.tokens.join(' ').length);
  indexes.set(kb, idx);
  return idx;
};

/**
 * The knowledge-base ingredient for a recipe name: a manual link first, then the exact name or
 * alias, then a name or alias whose words all occur in the recipe name ("SafAle US-05" → US-05).
 * undefined: not recognised; null: left out on purpose by a manual link.
 */
export const matchName = (
  name: string, category: FlavourCategory, kb: FlavourKb, mappings: FlavourMapping[] = [],
): string | null | undefined => {
  const key = nameKey(name);
  if (!key) return undefined;
  const manual = mappings.find(m => m.category === category && m.name_key === key);
  if (manual) return manual.ingredient_id;
  const idx = nameIndex(kb)[category];
  const exact = idx.exact.get(key);
  if (exact) return exact;
  const words = new Set(key.split(' '));
  return idx.byTokens.find(e => e.tokens.every(t => words.has(t)))?.id;
};

// ---------- Reading a recipe ----------

/** One addition in a recipe, as Flavour Lab sees it. */
export interface RecipeAddition {
  category: FlavourCategory;
  name: string;
  /** Where it is in the recipe */
  list: 'fermentables' | 'hops' | 'cultures' | 'miscellaneous';
  index: number;
  stage: FlavourStage;
  /** g/L for spices and hops (null when the unit is not a weight); share of the grain bill for malt */
  amount: number | null;
}

const toGrams = (value: number, unit: string | undefined): number | null => {
  const u = (unit || '').toLowerCase();
  if (u.startsWith('kg') || u.startsWith('kilo')) return value * 1000;
  if (u === 'g' || u.startsWith('gram')) return value;
  if (u === 'mg' || u.startsWith('milligram')) return value / 1000;
  if (u.startsWith('oz') || u.startsWith('ounce')) return value * 28.3495;
  if (u.startsWith('lb') || u.startsWith('pound')) return value * 453.592;
  return null;
};

export const batchLiters = (recipe: Recipe): number => {
  const v = recipe.batch_size?.value || 0;
  return recipe.batch_size?.unit === 'gallons' ? v * 3.78541 : v;
};

const boilStage = (minutes: number): FlavourStage =>
  minutes >= LONG_BOIL_MIN ? 'boil_long' : minutes >= SHORT_BOIL_MIN ? 'boil_short' : 'whirlpool';

/** Process stage of a hop addition (spec §7). */
export const hopStage = (h: Pick<Hop, 'use' | 'time'>): FlavourStage => {
  const use = String(h.use || 'boil').toLowerCase().replace(/[\s-]+/g, '_');
  if (use === 'dry_hop') return 'secondary';
  if (use === 'whirlpool' || use === 'aroma') return 'whirlpool';
  if (use === 'first_wort' || use === 'mash') return 'boil_long';
  return boilStage(h.time?.value ?? 60);
};

/** Process stage of a misc addition (spec §7): BeerXML USE and time. */
export const miscStage = (m: Pick<Misc, 'use' | 'time'>): FlavourStage => {
  const use = String(m.use || 'boil').toLowerCase().replace(/[\s-]+/g, '_');
  if (use === 'primary') return 'primary';
  if (use === 'secondary' || use === 'dry_hop') return 'secondary';
  if (use === 'bottling') return 'bottling';
  if (use === 'aroma' || use === 'whirlpool') return 'whirlpool';
  if (use === 'mash') return 'boil_long';
  return boilStage(m.time?.value ?? 0);
};

const FLAVOUR_MISC_TYPES = new Set(['spice', 'herb', 'flavor', 'flavour']);
const MALT_TYPES = new Set(['grain', 'adjunct']);

/** The recipe's additions that can carry aroma: malts, hops, yeasts and spices/herbs/flavours. */
export const recipeAdditions = (recipe: Recipe): RecipeAddition[] => {
  const out: RecipeAddition[] = [];
  const liters = batchLiters(recipe);
  const perLiter = (g: number | null) => (g !== null && liters > 0 ? g / liters : null);

  const grains = recipe.ingredients.fermentables
    .map((f, index) => ({ f, index, kg: (toGrams(f.amount?.value || 0, f.amount?.unit) ?? 0) / 1000 }))
    .filter(x => MALT_TYPES.has(String(x.f.type || 'grain').toLowerCase()));
  const totalKg = grains.reduce((s, x) => s + x.kg, 0);
  for (const { f, index, kg } of grains) {
    out.push({ category: 'malt', name: f.name, list: 'fermentables', index, stage: 'malt', amount: totalKg > 0 ? kg / totalKg : 0 });
  }
  recipe.ingredients.hops.forEach((h, index) => out.push({
    category: 'hop', name: h.name, list: 'hops', index, stage: hopStage(h),
    amount: perLiter(toGrams(h.amount?.value || 0, h.amount?.unit)),
  }));
  recipe.ingredients.cultures.forEach((c, index) => out.push({ category: 'yeast', name: c.name, list: 'cultures', index, stage: 'yeast', amount: 1 }));
  (recipe.ingredients.miscellaneous ?? []).forEach((m, index) => {
    if (!FLAVOUR_MISC_TYPES.has(String(m.type || '').toLowerCase())) return;
    out.push({ category: 'spice', name: m.name, list: 'miscellaneous', index, stage: miscStage(m), amount: perLiter(toGrams(m.amount?.value || 0, m.amount?.unit)) });
  });
  return out.filter(a => a.name?.trim());
};

// ---------- Vectors ----------

export type Vector = Map<string, number>;

/** One ingredient's share in one compound */
export interface Contribution { ingredient_id: string; compound_id: string; value: number; addition?: number }

const linksByIngredient = new WeakMap<FlavourKb, Map<string, IngredientCompound[]>>();
const compoundsById = new WeakMap<FlavourKb, Map<string, AromaCompound>>();

const kbLinks = (kb: FlavourKb, id: string): IngredientCompound[] => {
  let m = linksByIngredient.get(kb);
  if (!m) {
    m = new Map();
    for (const l of kb.links) m.set(l.ingredient_id, [...(m.get(l.ingredient_id) ?? []), l]);
    linksByIngredient.set(kb, m);
  }
  return m.get(id) ?? [];
};
export const kbCompound = (kb: FlavourKb, id: string): AromaCompound | undefined => {
  let m = compoundsById.get(kb);
  if (!m) { m = new Map(kb.compounds.map(c => [c.id, c])); compoundsById.set(kb, m); }
  return m.get(id);
};
export const kbIngredient = (kb: FlavourKb, id: string) => kb.ingredients.find(i => i.id === id);

/** Weight of an addition (spec §6): spice/hop dose ÷ upper typical dose (max 2), yeast YEAST_WEIGHT, malt its share. */
export const additionWeight = (ing: FlavourIngredient, stage: FlavourStage, amount: number | null): number => {
  if (ing.category === 'yeast') return YEAST_WEIGHT;
  if (ing.category === 'malt') return amount ?? 0;
  if (amount === null || !ing.dose_max_g_per_l) return 1; // no weight known: as one typical dose
  return Math.min(MAX_WEIGHT, amount / ing.dose_max_g_per_l);
};

/** What one addition adds to each compound: weight × intensity × retention. */
export const ingredientContributions = (
  kb: FlavourKb, ing: FlavourIngredient, stage: FlavourStage, weight: number, addition?: number,
): Contribution[] =>
  kbLinks(kb, ing.id).flatMap(l => {
    const c = kbCompound(kb, l.compound_id);
    if (!c) return [];
    const value = weight * l.intensity * RETENTION[stage][c.volatility];
    return value > 0 ? [{ ingredient_id: ing.id, compound_id: c.id, value, addition }] : [];
  });

export const toVector = (contribs: Contribution[]): Vector => {
  const v: Vector = new Map();
  for (const c of contribs) v.set(c.compound_id, (v.get(c.compound_id) ?? 0) + c.value);
  return v;
};

/** Key of an aroma family in a scoring vector (compounds are keyed by their own id). */
export const FAMILY_KEY = 'family:';

/**
 * The vector used for scores: one dimension per compound, plus one per aroma family holding the
 * family's total × FAMILY_WEIGHT. So compounds of the same family match a little too (eugenol in
 * clove and 4-vinylguaiacol of a POF+ yeast are both clove phenols). Aroma-active compounds count
 * POTENCY_WEIGHT times, as their low odour threshold makes them stand out.
 */
export const scoreVector = (kb: FlavourKb, contribs: Contribution[]): Vector => {
  const v: Vector = new Map();
  const add = (k: string, x: number) => v.set(k, (v.get(k) ?? 0) + x);
  for (const c of contribs) {
    const compound = kbCompound(kb, c.compound_id);
    const value = c.value * (compound?.aroma_active ? POTENCY_WEIGHT : 1);
    add(c.compound_id, value);
    if (compound && FAMILY_WEIGHT > 0) add(FAMILY_KEY + compound.family_id, value * FAMILY_WEIGHT);
  }
  return v;
};

const norm = (v: Vector) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));

export const dot = (a: Vector, b: Vector) => {
  let s = 0;
  for (const [k, x] of a) s += x * (b.get(k) ?? 0);
  return s;
};

export const cosine = (a: Vector, b: Vector): number => {
  const na = norm(a), nb = norm(b);
  return na > 0 && nb > 0 ? dot(a, b) / (na * nb) : 0;
};

// ---------- The recipe's profile ----------

export interface UnmatchedItem { category: FlavourCategory; name: string; key: string }

export interface RecipeProfile {
  additions: (RecipeAddition & { ingredient_id: string | null | undefined })[];
  contributions: Contribution[];
  vector: Vector;
  /** Recognised knowledge-base ingredients in the recipe */
  ingredientIds: Set<string>;
  /** Names that are not in the knowledge base and have no manual link (counted once) */
  unmatched: UnmatchedItem[];
  batchL: number;
}

export const recipeProfile = (recipe: Recipe, kb: FlavourKb, mappings: FlavourMapping[] = []): RecipeProfile => {
  const additions = recipeAdditions(recipe).map(a => ({ ...a, ingredient_id: matchName(a.name, a.category, kb, mappings) }));
  const contributions: Contribution[] = [];
  const ingredientIds = new Set<string>();
  const unmatched = new Map<string, UnmatchedItem>();
  additions.forEach((a, n) => {
    if (a.ingredient_id === undefined) {
      const key = nameKey(a.name);
      unmatched.set(`${a.category}:${key}`, { category: a.category, name: a.name.trim(), key });
      return;
    }
    if (a.ingredient_id === null) return;
    const ing = kbIngredient(kb, a.ingredient_id);
    if (!ing) return;
    ingredientIds.add(ing.id);
    contributions.push(...ingredientContributions(kb, ing, a.stage, additionWeight(ing, a.stage, a.amount), n));
  });
  return { additions, contributions, vector: scoreVector(kb, contributions), ingredientIds, unmatched: [...unmatched.values()], batchL: batchLiters(recipe) };
};

// ---------- Candidates ----------

const midDose = (i: FlavourIngredient) =>
  i.dose_min_g_per_l != null && i.dose_max_g_per_l != null ? (i.dose_min_g_per_l + i.dose_max_g_per_l) / 2 : null;

/** How a candidate is added (spec §6 step 2): spice at its preferred stage, hop as aroma hop (whirlpool). */
export const candidateStage = (i: FlavourIngredient): FlavourStage =>
  i.category === 'spice' ? (i.preferred_stage ?? 'boil_short')
    : i.category === 'hop' ? 'whirlpool'
    : i.category === 'yeast' ? 'yeast' : 'malt';

/** Grams/L a candidate is added at: the middle of the typical dose for spices, the lower bound for hops. */
export const candidateDosePerL = (i: FlavourIngredient): number | null =>
  i.category === 'hop' ? i.dose_min_g_per_l : i.category === 'spice' ? midDose(i) : null;

/** The candidate's contributions when added at its default dose and stage. */
export const candidateContributions = (kb: FlavourKb, i: FlavourIngredient): Contribution[] => {
  const dose = candidateDosePerL(i);
  const weight = i.category === 'yeast' ? 1 : i.category === 'malt' ? 1
    : dose !== null && i.dose_max_g_per_l ? Math.min(MAX_WEIGHT, dose / i.dose_max_g_per_l) : 1;
  return ingredientContributions(kb, i, candidateStage(i), weight);
};

/** Dose shown on the card: middle of the typical dose × batch, rounded to 0.5 g under 10 g and 1 g above. */
export const roundDose = (grams: number): number => (grams < 10 ? Math.round(grams * 2) / 2 : Math.round(grams));
export const candidateGrams = (i: FlavourIngredient, batchL: number): number | null => {
  const d = candidateDosePerL(i);
  return d === null || !(batchL > 0) ? null : roundDose(d * batchL);
};

/** A bridge: a compound id, or FAMILY_KEY + a family id when only the family is shared */
export interface Bridge { compound_id: string; share: number }
export interface Suggestion {
  ingredient: FlavourIngredient;
  score: number;
  bridges: Bridge[];
  contributions: Contribution[];
}

/**
 * Bridge compounds (spec §6 step 4): the largest parts of the compound dot product, at most 3,
 * each ≥ 10 %. A shared aroma family whose compounds differ (eugenol in clove, 4-vinylguaiacol
 * of a POF+ yeast) is added as a family bridge when it makes up ≥ 25 % of the whole dot product.
 */
export const bridges = (kb: FlavourKb, recipe: Vector, candidate: Vector): Bridge[] => {
  const part = (k: string) => (recipe.get(k) ?? 0) * (candidate.get(k) ?? 0);
  const keys = [...candidate.keys()];
  const compoundKeys = keys.filter(k => !k.startsWith(FAMILY_KEY));
  const compoundTotal = compoundKeys.reduce((s, k) => s + part(k), 0);
  const total = keys.reduce((s, k) => s + part(k), 0);
  if (total <= 0) return [];
  const byShare = (a: Bridge, b: Bridge) => b.share - a.share || a.compound_id.localeCompare(b.compound_id);
  const out: Bridge[] = compoundTotal > 0
    ? compoundKeys.map(k => ({ compound_id: k, share: part(k) / compoundTotal })).filter(b => b.share >= MIN_BRIDGE_SHARE).sort(byShare)
    : [];
  const covered = new Set(out.map(b => kbCompound(kb, b.compound_id)?.family_id));
  const families = keys.filter(k => k.startsWith(FAMILY_KEY) && !covered.has(k.slice(FAMILY_KEY.length)))
    .map(k => ({ compound_id: k, share: part(k) / total })).filter(b => b.share >= MIN_FAMILY_BRIDGE_SHARE).sort(byShare);
  // A family bridge comes first when it is the larger reason
  return [...families, ...out].slice(0, MAX_BRIDGES);
};

export interface SuggestOptions {
  /** Lowest score shown (default MIN_SCORE) */
  minScore?: number;
  /** Knowledge-base ingredients not to suggest */
  exclude?: Set<string>;
  /** Leave out POF+ yeasts */
  noPof?: boolean;
  lang?: FlavourLang;
  limit?: number;
}

/**
 * Top suggestions of one category for a recipe vector (spec §6). Ingredients already in the
 * recipe are not candidates; scores under 20 are left out; equal scores sort by name.
 */
export const suggest = (
  kb: FlavourKb, vector: Vector, category: FlavourCategory, inRecipe: Set<string>, opts: SuggestOptions = {},
): Suggestion[] => {
  const lang = opts.lang ?? 'en';
  return kb.ingredients
    .filter(i => i.category === category && !inRecipe.has(i.id) && !opts.exclude?.has(i.id))
    .filter(i => !(opts.noPof && i.category === 'yeast' && i.yeast_pof))
    .map(i => {
      const contributions = candidateContributions(kb, i);
      const cv = scoreVector(kb, contributions);
      return { ingredient: i, score: Math.round(100 * cosine(vector, cv)), bridges: bridges(kb, vector, cv), contributions };
    })
    .filter(s => s.score >= (opts.minScore ?? MIN_SCORE))
    .sort((a, b) => b.score - a.score || ingredientName(a.ingredient, lang).localeCompare(ingredientName(b.ingredient, lang)))
    .slice(0, opts.limit ?? TOP_N);
};

/** Suggestions for a recipe, per tab. The yeast tab compares without the recipe's own yeast (spec §6). */
export const recipeSuggestions = (
  kb: FlavourKb, profile: RecipeProfile, opts: SuggestOptions = {},
): Record<'spice' | 'yeast' | 'hop', Suggestion[]> => {
  const yeastIds = new Set(profile.additions.filter(a => a.category === 'yeast' && a.ingredient_id).map(a => a.ingredient_id as string));
  const withoutYeast = scoreVector(kb, profile.contributions.filter(c => !yeastIds.has(c.ingredient_id)));
  return {
    spice: suggest(kb, profile.vector, 'spice', profile.ingredientIds, opts),
    // Yeasts make esters and phenols that malt and hop hardly hold, so their scores stay low:
    // the yeast tab shows the best five whatever their score (the card marks a weak match)
    yeast: suggest(kb, withoutYeast, 'yeast', profile.ingredientIds, { ...opts, minScore: 0 }),
    hop: suggest(kb, profile.vector, 'hop', profile.ingredientIds, opts),
  };
};

/** Flow B: the chosen ingredient alone, at its default dose and stage. */
export const ingredientProfile = (kb: FlavourKb, ing: FlavourIngredient): RecipeProfile => {
  const contributions = candidateContributions(kb, ing);
  return {
    additions: [], contributions, vector: scoreVector(kb, contributions),
    ingredientIds: new Set([ing.id]), unmatched: [], batchL: 0,
  };
};

// ---------- Profile per aroma family ----------

export interface FamilyBar {
  family: AromaFamily;
  total: number;
  /** Per ingredient, largest first */
  parts: { ingredient_id: string; value: number }[];
  /** What a previewed suggestion would add */
  extra: number;
}

/** The profile per aroma family (US-01), with an optional previewed suggestion (US-06). */
export const familyBars = (kb: FlavourKb, contribs: Contribution[], preview: Contribution[] = []): FamilyBar[] => {
  const bars = new Map<string, FamilyBar>();
  const bar = (familyId: string) => {
    let b = bars.get(familyId);
    if (!b) {
      const family = kb.families.find(f => f.id === familyId);
      if (!family) return undefined;
      b = { family, total: 0, parts: [], extra: 0 };
      bars.set(familyId, b);
    }
    return b;
  };
  for (const c of contribs) {
    const b = bar(kbCompound(kb, c.compound_id)?.family_id ?? '');
    if (!b) continue;
    b.total += c.value;
    const p = b.parts.find(x => x.ingredient_id === c.ingredient_id);
    if (p) p.value += c.value; else b.parts.push({ ingredient_id: c.ingredient_id, value: c.value });
  }
  for (const c of preview) {
    const b = bar(kbCompound(kb, c.compound_id)?.family_id ?? '');
    if (b) b.extra += c.value;
  }
  return [...bars.values()]
    .map(b => ({ ...b, parts: b.parts.sort((x, y) => y.value - x.value || x.ingredient_id.localeCompare(y.ingredient_id)) }))
    .filter(b => b.total > 0 || b.extra > 0)
    .sort((a, b) => b.total - a.total || a.family.sort - b.family.sort);
};

// ---------- Adding a suggestion to a recipe (spec §8) ----------

/** A spice as MISC (type Spice) at its preferred stage and the card's dose. */
export const spiceAsMisc = (i: FlavourIngredient, lang: FlavourLang, batchL: number): Misc => {
  const stage = (i.preferred_stage ?? 'boil_short') as keyof typeof STAGE_TO_MISC;
  const s = STAGE_TO_MISC[stage];
  return { name: ingredientName(i, lang), type: 'spice', use: s.use, amount: { unit: 'grams', value: candidateGrams(i, batchL) ?? 0 }, time: { unit: s.unit, value: s.time } };
};

/** A hop as aroma hop: whirlpool at 80 °C, at the lower typical dose. */
export const hopAsAroma = (i: FlavourIngredient, lang: FlavourLang, batchL: number): Hop => ({
  name: ingredientName(i, lang), amount: { unit: 'grams', value: candidateGrams(i, batchL) ?? 0 },
  use: 'whirlpool', time: { unit: 'minutes', value: 15 }, temperature: 80, form: 'pellet',
});

/** A yeast as culture (dry ale yeast). */
export const yeastAsCulture = (i: FlavourIngredient, lang: FlavourLang): Culture => ({
  name: ingredientName(i, lang), type: 'ale', form: 'dry', amount: { unit: 'grams', value: 11 }, attenuation: 78,
});

/** The recipe with a suggestion added; a yeast replaces the recipe's yeasts. */
export const addToRecipe = (recipe: Recipe, i: FlavourIngredient, lang: FlavourLang): Recipe => {
  const batchL = batchLiters(recipe);
  const ings = recipe.ingredients;
  if (i.category === 'spice') return { ...recipe, ingredients: { ...ings, miscellaneous: [...(ings.miscellaneous ?? []), spiceAsMisc(i, lang, batchL)] } };
  if (i.category === 'hop') return { ...recipe, ingredients: { ...ings, hops: [...ings.hops, hopAsAroma(i, lang, batchL)] } };
  if (i.category === 'yeast') {
    const old = ings.cultures[0];
    const next = yeastAsCulture(i, lang);
    return { ...recipe, ingredients: { ...ings, cultures: [old ? { ...next, amount: old.amount ?? next.amount } : next] } };
  }
  return recipe;
};

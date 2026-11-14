
import { Recipe, LibraryIngredient } from "../types";
import { calculateRecipeStats, normalizeFermentableType, resolveEquipment } from './calculations';
import { chemToWaterAgents, coveredByChem } from './beerXmlWater';
import { PRESET_WATERS } from './waterProfiles';

const FERMENTABLE_TYPE_XML: Record<string, string> = {
  grain: 'Grain', adjunct: 'Adjunct', sugar: 'Sugar', extract: 'Extract', dry_extract: 'Dry Extract',
};
// Whirlpool has no BeerXML equivalent; "Aroma" (after the boil) is the closest
const HOP_USE_XML: Record<string, string> = {
  boil: 'Boil', dry_hop: 'Dry Hop', mash: 'Mash', first_wort: 'First Wort', whirlpool: 'Aroma',
};

const YEAST_TYPE_XML: Record<string, string> = { ale: 'Ale', lager: 'Lager', wheat: 'Wheat', wine: 'Wine', champagne: 'Champagne' };
const YEAST_FORM_XML: Record<string, string> = { liquid: 'Liquid', dry: 'Dry', slant: 'Slant', culture: 'Culture' };
const MASH_STEP_TYPE_XML: Record<string, string> = { infusion: 'Infusion', temperature: 'Temperature', decoction: 'Decoction' };

const sanitize = (str: string) => str.replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[m] || m));

const num = (n: number | undefined) => Math.round((Number(n) || 0) * 1000) / 1000;

/** A water reference of the recipe (library id or 'preset:<key>') as a full profile. */
const findWater = (ref: string | undefined, library: LibraryIngredient[]): LibraryIngredient | undefined => {
  if (!ref) return undefined;
  const all = [...library.filter(l => l.type === 'water'), ...PRESET_WATERS];
  return ref.startsWith('preset:') ? all.find(w => w.preset_key === ref.slice(7)) : all.find(w => w.id === ref);
};

/**
 * One recipe as BeerXML 1.0. Its base water and target profile are written as <WATERS> inside the
 * RECIPE with the BrewBindr tag <WATER_KIND>; the water treatment's salts and lactic acid as MISC
 * "Water Agent"; dilution and target mash pH as <WATER_DILUTION_PCT> and <TARGET_MASH_PH>.
 * Other programs ignore the unknown tags. `library` resolves the recipe's water profiles.
 */
export const exportToBeerXml = (recipe: Recipe, library: LibraryIngredient[] = []): string => {
  const xmlParts: string[] = [];
  
  xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlParts.push('<RECIPES>');
  xmlParts.push('  <RECIPE>');
  xmlParts.push(`    <NAME>${sanitize(recipe.name)}</NAME>`);
  xmlParts.push('    <VERSION>1</VERSION>');
  xmlParts.push(`    <TYPE>${recipe.type === 'all_grain' ? 'All Grain' : recipe.type === 'extract' ? 'Extract' : 'Partial Mash'}</TYPE>`);
  
  if (recipe.style) {
    xmlParts.push('    <STYLE>');
    xmlParts.push(`      <NAME>${sanitize(recipe.style.name)}</NAME>`);
    xmlParts.push(`      <CATEGORY>${sanitize(recipe.style.category || "")}</CATEGORY>`);
    xmlParts.push('      <VERSION>1</VERSION>');
    xmlParts.push('    </STYLE>');
  }

  xmlParts.push(`    <BREWER>${sanitize(recipe.author || 'brewbindr')}</BREWER>`);
  xmlParts.push(`    <BATCH_SIZE>${recipe.batch_size.value}</BATCH_SIZE>`);
  xmlParts.push(`    <BOIL_TIME>${recipe.boil_time.value}</BOIL_TIME>`);
  xmlParts.push(`    <EFFICIENCY>${recipe.efficiency.brewhouse}</EFFICIENCY>`);
  
  // Ingredients
  xmlParts.push('    <FERMENTABLES>');
  recipe.ingredients.fermentables.forEach(f => {
    xmlParts.push('      <FERMENTABLE>');
    xmlParts.push(`        <NAME>${sanitize(f.name)}</NAME>`);
    xmlParts.push(`        <TYPE>${FERMENTABLE_TYPE_XML[normalizeFermentableType(f.type)]}</TYPE>`);
    xmlParts.push(`        <AMOUNT>${f.amount.unit === 'pounds' ? f.amount.value * 0.453592 : f.amount.value}</AMOUNT>`);
    if (f.yield?.potential?.value) xmlParts.push(`        <POTENTIAL>${f.yield.potential.value}</POTENTIAL>`);
    xmlParts.push(`        <COLOR>${f.color?.value || 0}</COLOR>`);
    xmlParts.push('      </FERMENTABLE>');
  });
  xmlParts.push('    </FERMENTABLES>');

  xmlParts.push('    <HOPS>');
  recipe.ingredients.hops.forEach(h => {
    xmlParts.push('      <HOP>');
    xmlParts.push(`        <NAME>${sanitize(h.name)}</NAME>`);
    xmlParts.push(`        <ALPHA>${h.alpha_acid?.value || 0}</ALPHA>`);
    xmlParts.push(`        <AMOUNT>${(h.amount.unit === 'ounces' ? h.amount.value * 28.3495 : h.amount.value) / 1000}</AMOUNT>`);
    xmlParts.push(`        <USE>${HOP_USE_XML[h.use] || 'Boil'}</USE>`);
    xmlParts.push(`        <FORM>${h.form === 'leaf' ? 'Leaf' : h.form === 'plug' ? 'Plug' : 'Pellet'}</FORM>`);
    xmlParts.push(`        <TIME>${h.time.value}</TIME>`);
    xmlParts.push('      </HOP>');
  });
  xmlParts.push('    </HOPS>');

  // Misc, plus the water treatment's salts and acid; a water agent the treatment already holds is written once
  const chem = recipe.water_chem;
  const miscs = (recipe.ingredients.miscellaneous ?? []).filter(m => !coveredByChem(m, chem));
  const agents = chemToWaterAgents(chem);
  if (miscs.length > 0 || agents.length > 0) {
    xmlParts.push('    <MISCS>');
    miscs.forEach(m => {
      xmlParts.push('      <MISC>');
      xmlParts.push(`        <NAME>${sanitize(m.name)}</NAME>`);
      xmlParts.push(`        <AMOUNT>${m.amount.value / 1000}</AMOUNT>`);
      xmlParts.push(`        <TYPE>${sanitize(m.type)}</TYPE>`);
      xmlParts.push(`        <USE>${sanitize(m.use)}</USE>`);
      xmlParts.push(`        <TIME>${m.time.value}</TIME>`);
      xmlParts.push('      </MISC>');
    });
    agents.forEach(a => {
      xmlParts.push('      <MISC>');
      xmlParts.push(`        <NAME>${sanitize(a.name)}</NAME>`);
      xmlParts.push('        <VERSION>1</VERSION>');
      xmlParts.push('        <TYPE>Water Agent</TYPE>');
      xmlParts.push('        <USE>Mash</USE>');
      xmlParts.push('        <TIME>0</TIME>');
      // kg or L to 0.001 g or ml
      xmlParts.push(`        <AMOUNT>${Math.round(a.amount * 1000) / 1e6}</AMOUNT>`);
      xmlParts.push(`        <AMOUNT_IS_WEIGHT>${a.isWeight ? 'TRUE' : 'FALSE'}</AMOUNT_IS_WEIGHT>`);
      xmlParts.push('      </MISC>');
    });
    xmlParts.push('    </MISCS>');
  }

  // Yeasts
  if (recipe.ingredients.cultures.length > 0) {
    xmlParts.push('    <YEASTS>');
    recipe.ingredients.cultures.forEach(c => {
      xmlParts.push('      <YEAST>');
      xmlParts.push(`        <NAME>${sanitize(c.name)}</NAME>`);
      xmlParts.push('        <VERSION>1</VERSION>');
      xmlParts.push(`        <TYPE>${YEAST_TYPE_XML[c.type] || 'Ale'}</TYPE>`);
      xmlParts.push(`        <FORM>${YEAST_FORM_XML[c.form] || 'Dry'}</FORM>`);
      // BeerXML has no unit count: grams as kg, packs as 0
      xmlParts.push(`        <AMOUNT>${c.amount?.unit === 'grams' ? c.amount.value / 1000 : 0}</AMOUNT>`);
      if (c.amount?.unit === 'grams') xmlParts.push('        <AMOUNT_IS_WEIGHT>TRUE</AMOUNT_IS_WEIGHT>');
      if (c.attenuation) xmlParts.push(`        <ATTENUATION>${c.attenuation}</ATTENUATION>`);
      xmlParts.push('      </YEAST>');
    });
    xmlParts.push('    </YEASTS>');
  }

  // Mash schedule (temperatures in °C, times in minutes)
  if (recipe.mash && recipe.mash.steps?.length) {
    const m = recipe.mash;
    xmlParts.push('    <MASH>');
    xmlParts.push(`      <NAME>${sanitize(m.name || 'Mash')}</NAME>`);
    xmlParts.push('      <VERSION>1</VERSION>');
    xmlParts.push(`      <GRAIN_TEMP>${m.grain_temp ?? 20}</GRAIN_TEMP>`);
    if (m.sparge_temp) xmlParts.push(`      <SPARGE_TEMP>${m.sparge_temp}</SPARGE_TEMP>`);
    if (m.ph) xmlParts.push(`      <PH>${m.ph}</PH>`);
    if (m.notes) xmlParts.push(`      <NOTES>${sanitize(m.notes)}</NOTES>`);
    xmlParts.push('      <MASH_STEPS>');
    m.steps.forEach(st => {
      xmlParts.push('        <MASH_STEP>');
      xmlParts.push(`          <NAME>${sanitize(st.name || 'Step')}</NAME>`);
      xmlParts.push('          <VERSION>1</VERSION>');
      xmlParts.push(`          <TYPE>${MASH_STEP_TYPE_XML[st.type] || 'Infusion'}</TYPE>`);
      if (st.infuse_amount) xmlParts.push(`          <INFUSE_AMOUNT>${st.infuse_amount}</INFUSE_AMOUNT>`);
      xmlParts.push(`          <STEP_TEMP>${st.temperature ?? st.step_temp ?? 0}</STEP_TEMP>`);
      xmlParts.push(`          <STEP_TIME>${st.duration ?? st.step_time ?? 0}</STEP_TIME>`);
      if (st.ramp_time) xmlParts.push(`          <RAMP_TIME>${st.ramp_time}</RAMP_TIME>`);
      if (st.end_temp) xmlParts.push(`          <END_TEMP>${st.end_temp}</END_TEMP>`);
      if (st.description) xmlParts.push(`          <DESCRIPTION>${sanitize(st.description)}</DESCRIPTION>`);
      xmlParts.push('        </MASH_STEP>');
    });
    xmlParts.push('      </MASH_STEPS>');
    xmlParts.push('    </MASH>');
  }

  // The recipe's water profiles: base water and target profile
  const waters = ([['base', chem?.source], ['target', chem?.target]] as const)
    .map(([kind, ref]) => ({ kind, water: findWater(ref, library) }))
    .filter((w): w is { kind: 'base' | 'target'; water: LibraryIngredient } => !!w.water);
  if (waters.length > 0) {
    xmlParts.push('    <WATERS>');
    waters.forEach(({ kind, water: w }) => {
      xmlParts.push('      <WATER>');
      xmlParts.push(`        <NAME>${sanitize(w.name)}</NAME>`);
      xmlParts.push('        <VERSION>1</VERSION>');
      xmlParts.push(`        <AMOUNT>${num(w.amount)}</AMOUNT>`);
      xmlParts.push(`        <CALCIUM>${num(w.calcium)}</CALCIUM>`);
      xmlParts.push(`        <BICARBONATE>${num(w.bicarbonate)}</BICARBONATE>`);
      xmlParts.push(`        <SULFATE>${num(w.sulfate)}</SULFATE>`);
      xmlParts.push(`        <CHLORIDE>${num(w.chloride)}</CHLORIDE>`);
      xmlParts.push(`        <SODIUM>${num(w.sodium)}</SODIUM>`);
      xmlParts.push(`        <MAGNESIUM>${num(w.magnesium)}</MAGNESIUM>`);
      if (w.ph) xmlParts.push(`        <PH>${w.ph}</PH>`);
      if (w.notes) xmlParts.push(`        <NOTES>${sanitize(w.notes)}</NOTES>`);
      xmlParts.push(`        <WATER_KIND>${kind}</WATER_KIND>`);
      xmlParts.push('      </WATER>');
    });
    xmlParts.push('    </WATERS>');
  }
  if (chem?.dilution_pct) xmlParts.push(`    <WATER_DILUTION_PCT>${chem.dilution_pct}</WATER_DILUTION_PCT>`);
  if (chem?.target_ph) xmlParts.push(`    <TARGET_MASH_PH>${chem.target_ph}</TARGET_MASH_PH>`);

  if (recipe.notes) xmlParts.push(`    <NOTES>${sanitize(recipe.notes)}</NOTES>`);

  // Calculated values, as BrewBindr shows them (with the recipe's installation)
  const stats = calculateRecipeStats(recipe, undefined, resolveEquipment(recipe, library));
  xmlParts.push(`    <EST_OG>${stats.og.toFixed(3)}</EST_OG>`);
  xmlParts.push(`    <EST_FG>${stats.fg.toFixed(3)}</EST_FG>`);
  xmlParts.push(`    <EST_ABV>${stats.abv.toFixed(1)}</EST_ABV>`);
  xmlParts.push(`    <IBU>${stats.ibu}</IBU>`);
  xmlParts.push(`    <EST_COLOR>${stats.color.toFixed(1)}</EST_COLOR>`);

  xmlParts.push('  </RECIPE>');
  xmlParts.push('</RECIPES>');

  return xmlParts.join('\n');
};

export const exportLibraryToBeerXml = (ingredients: LibraryIngredient[]): string => {
  const xmlParts: string[] = [];
  xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlParts.push('<BREW_LIBRARY>');
  
  ingredients.filter(i => i.type === 'fermentable').forEach(f => {
    xmlParts.push('  <FERMENTABLE>');
    xmlParts.push(`    <NAME>${sanitize(f.name)}</NAME>`);
    xmlParts.push(`    <TYPE>Malt</TYPE>`);
    xmlParts.push(`    <AMOUNT>0</AMOUNT>`);
    xmlParts.push(`    <YIELD>${f.yield ? (1 + (f.yield * 0.046 / 100)).toFixed(3) : 1.036}</YIELD>`);
    xmlParts.push(`    <COLOR>${f.color || 0}</COLOR>`);
    xmlParts.push('  </FERMENTABLE>');
  });

  ingredients.filter(i => i.type === 'hop').forEach(h => {
    xmlParts.push('  <HOP>');
    xmlParts.push(`    <NAME>${sanitize(h.name)}</NAME>`);
    xmlParts.push(`    <ALPHA>${h.alpha || 0}</ALPHA>`);
    xmlParts.push(`    <AMOUNT>0</AMOUNT>`);
    xmlParts.push(`    <USE>Boil</USE>`);
    xmlParts.push(`    <TIME>60</TIME>`);
    xmlParts.push('  </HOP>');
  });

  ingredients.filter(i => i.type === 'culture').forEach(y => {
    xmlParts.push('  <YEAST>');
    xmlParts.push(`    <NAME>${sanitize(y.name)}</NAME>`);
    xmlParts.push(`    <TYPE>${sanitize(y.form || "Ale")}</TYPE>`);
    xmlParts.push(`    <FORM>${sanitize(y.form || "Dry")}</FORM>`);
    xmlParts.push(`    <ATTENUATION>${y.attenuation || 75}</ATTENUATION>`);
    xmlParts.push('  </YEAST>');
  });

  ingredients.filter(i => i.type === 'misc').forEach(m => {
    xmlParts.push('  <MISC>');
    xmlParts.push(`    <NAME>${sanitize(m.name)}</NAME>`);
    xmlParts.push(`    <TYPE>${sanitize(m.misc_type || "Other")}</TYPE>`);
    xmlParts.push(`    <USE>${sanitize(m.misc_use || "Boil")}</USE>`);
    xmlParts.push('  </MISC>');
  });

  ingredients.filter(i => i.type === 'style').forEach(s => {
    xmlParts.push('  <STYLE>');
    xmlParts.push(`    <NAME>${sanitize(s.name)}</NAME>`);
    xmlParts.push(`    <CATEGORY>${sanitize(s.category || "")}</CATEGORY>`);
    xmlParts.push(`    <VERSION>1</VERSION>`);
    xmlParts.push(`    <OG_MIN>${s.og_min || 0}</OG_MIN>`);
    xmlParts.push(`    <OG_MAX>${s.og_max || 0}</OG_MAX>`);
    xmlParts.push(`    <IBU_MIN>${s.ibu_min || 0}</IBU_MIN>`);
    xmlParts.push(`    <IBU_MAX>${s.ibu_max || 0}</IBU_MAX>`);
    xmlParts.push('  </STYLE>');
  });

  ingredients.filter(i => i.type === 'equipment').forEach(e => {
    xmlParts.push('  <EQUIPMENT>');
    xmlParts.push(`    <NAME>${sanitize(e.name)}</NAME>`);
    xmlParts.push(`    <VERSION>1</VERSION>`);
    xmlParts.push(`    <BATCH_SIZE>${e.batch_size || 20}</BATCH_SIZE>`);
    xmlParts.push(`    <BOIL_SIZE>${e.boil_size || 25}</BOIL_SIZE>`);
    xmlParts.push(`    <EFFICIENCY>${e.efficiency || 70}</EFFICIENCY>`);
    xmlParts.push(`    <BOIL_TIME>${e.boil_time || 60}</BOIL_TIME>`);
    xmlParts.push(`    <TRUB_CHILLER_LOSS>${e.trub_chiller_loss || 0}</TRUB_CHILLER_LOSS>`);
    xmlParts.push(`    <EVAP_RATE>${e.evap_rate || 0}</EVAP_RATE>`);
    xmlParts.push(`    <LAUTER_DEADSPACE>${e.lauter_deadspace || 0}</LAUTER_DEADSPACE>`);
    xmlParts.push(`    <TOP_UP_WATER>${e.top_up_water || 0}</TOP_UP_WATER>`);
    xmlParts.push(`    <TUN_SPECIFIC_HEAT>${e.tun_specific_heat || 0}</TUN_SPECIFIC_HEAT>`);
    xmlParts.push(`    <NOTES>${sanitize(e.description || "")}</NOTES>`);
    xmlParts.push('  </EQUIPMENT>');
  });

  ingredients.filter(i => i.type === 'mash_profile').forEach(m => {
    xmlParts.push('  <MASH>');
    xmlParts.push(`    <NAME>${sanitize(m.name)}</NAME>`);
    xmlParts.push(`    <VERSION>1</VERSION>`);
    xmlParts.push(`    <GRAIN_TEMP>${m.grain_temp || 20}</GRAIN_TEMP>`);
    xmlParts.push('    <MASH_STEPS>');
    (m.steps || []).forEach(s => {
      xmlParts.push('      <MASH_STEP>');
      xmlParts.push(`        <NAME>${sanitize(s.name)}</NAME>`);
      xmlParts.push(`        <VERSION>1</VERSION>`);
      xmlParts.push(`        <TYPE>${sanitize(s.type || "Infusion")}</TYPE>`);
      xmlParts.push(`        <STEP_TEMP>${s.temperature || s.step_temp || 67}</STEP_TEMP>`);
      xmlParts.push(`        <STEP_TIME>${s.duration || s.step_time || 60}</STEP_TIME>`);
      xmlParts.push('      </MASH_STEP>');
    });
    xmlParts.push('    </MASH_STEPS>');
    xmlParts.push('  </MASH>');
  });

  ingredients.filter(i => i.type === 'water').forEach(w => {
    xmlParts.push('  <WATER>');
    xmlParts.push(`    <NAME>${sanitize(w.name)}</NAME>`);
    xmlParts.push(`    <VERSION>1</VERSION>`);
    xmlParts.push(`    <AMOUNT>${w.amount || 0}</AMOUNT>`);
    xmlParts.push(`    <NOTES>${sanitize(w.notes || "")}</NOTES>`);
    xmlParts.push('  </WATER>');
  });

  xmlParts.push('</BREW_LIBRARY>');
  return xmlParts.join('\n');
};

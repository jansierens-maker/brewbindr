
import { Recipe, LibraryIngredient } from "../types";

const sanitize = (str: string) => str.replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[m] || m));

export const exportToBeerXml = (recipe: Recipe): string => {
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
    xmlParts.push(`        <AMOUNT>${f.amount.value}</AMOUNT>`);
    xmlParts.push(`        <COLOR>${f.color?.value || 0}</COLOR>`);
    xmlParts.push('      </FERMENTABLE>');
  });
  xmlParts.push('    </FERMENTABLES>');

  xmlParts.push('    <HOPS>');
  recipe.ingredients.hops.forEach(h => {
    xmlParts.push('      <HOP>');
    xmlParts.push(`        <NAME>${sanitize(h.name)}</NAME>`);
    xmlParts.push(`        <ALPHA>${h.alpha_acid?.value || 0}</ALPHA>`);
    xmlParts.push(`        <AMOUNT>${h.amount.value / 1000}</AMOUNT>`);
    xmlParts.push(`        <USE>${sanitize(h.use)}</USE>`);
    xmlParts.push(`        <TIME>${h.time.value}</TIME>`);
    xmlParts.push('      </HOP>');
  });
  xmlParts.push('    </HOPS>');

  if (recipe.ingredients.miscellaneous && recipe.ingredients.miscellaneous.length > 0) {
    xmlParts.push('    <MISCELLANEOUS>');
    recipe.ingredients.miscellaneous.forEach(m => {
      xmlParts.push('      <MISC>');
      xmlParts.push(`        <NAME>${sanitize(m.name)}</NAME>`);
      xmlParts.push(`        <AMOUNT>${m.amount.value / 1000}</AMOUNT>`);
      xmlParts.push(`        <TYPE>${sanitize(m.type)}</TYPE>`);
      xmlParts.push(`        <USE>${sanitize(m.use)}</USE>`);
      xmlParts.push(`        <TIME>${m.time.value}</TIME>`);
      xmlParts.push('      </MISC>');
    });
    xmlParts.push('    </MISCELLANEOUS>');
  }

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

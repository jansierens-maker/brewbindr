
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
    xmlParts.push(`    <OG_MIN>${s.og_min || 0}</OG_MIN>`);
    xmlParts.push(`    <OG_MAX>${s.og_max || 0}</OG_MAX>`);
    xmlParts.push(`    <IBU_MIN>${s.ibu_min || 0}</IBU_MIN>`);
    xmlParts.push(`    <IBU_MAX>${s.ibu_max || 0}</IBU_MAX>`);
    xmlParts.push('  </STYLE>');
  });

  xmlParts.push('</BREW_LIBRARY>');
  return xmlParts.join('\n');
};

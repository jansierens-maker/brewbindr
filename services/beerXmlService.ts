import { normalizeRecipe, normalizeFermentableType } from './calculations';
import { Recipe, Fermentable, Hop, Culture, MashProfile, MashStep, LibraryIngredient } from "../types";
import { RecipeWater, waterAgentsToChem } from './beerXmlWater';

// BeerXML USE: Boil, Dry Hop, Mash, First Wort, Aroma (aroma = after the boil, i.e. whirlpool)
const hopUse = (use: string): Hop['use'] => {
  const u = use.toLowerCase().trim().replace(/\s+/g, '_');
  if (u === 'aroma') return 'whirlpool';
  return (['boil', 'dry_hop', 'mash', 'first_wort', 'whirlpool'] as const).find(x => x === u) || 'boil';
};

// BeerXML FORM: Pellet, Plug, Leaf
const hopForm = (form: string): Pick<Hop, 'form'> => {
  const f = form.toLowerCase().trim();
  return f === 'pellet' || f === 'plug' || f === 'leaf' ? { form: f } : {};
};

export interface BeerXmlImportResult {
  recipes: Recipe[];
  fermentables: any[];
  hops: any[];
  cultures: any[];
  miscs: any[];
  waters: any[];
  styles: any[];
  equipments: any[];
  mashes: any[];
  /** Water profiles inside a RECIPE: saved in the library, then linked to that recipe's water treatment */
  recipeWaters: RecipeWater[];
}

export const parseBeerXml = (xmlString: string): BeerXmlImportResult => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  const result: BeerXmlImportResult = {
    recipes: [],
    fermentables: [],
    hops: [],
    cultures: [],
    miscs: [],
    waters: [],
    styles: [],
    equipments: [],
    mashes: [],
    recipeWaters: []
  };

  const getVal = (el: Element | null, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent || "";
  const getNum = (el: Element | null, tag: string) => parseFloat(el?.getElementsByTagName(tag)[0]?.textContent || "0");
  // A recipe's own fields: direct children only, not e.g. the NOTES of a hop or water inside it
  const ownVal = (el: Element, tag: string) => Array.from(el.children).find(c => c.tagName === tag)?.textContent || "";
  const ownNum = (el: Element, tag: string) => parseFloat(ownVal(el, tag) || "0");

  const parseMashSteps = (mashNode: Element): MashStep[] => {
    const steps: MashStep[] = [];
    const stepNodes = mashNode.getElementsByTagName("MASH_STEP");
    for (let i = 0; i < stepNodes.length; i++) {
      const s = stepNodes[i];
      steps.push({
        name: getVal(s, "NAME"),
        type: (getVal(s, "TYPE").toLowerCase() as any) || "infusion",
        step_temp: getNum(s, "STEP_TEMP"),
        step_time: getNum(s, "STEP_TIME"),
        infuse_amount: getNum(s, "INFUSE_AMOUNT") || undefined,
        ramp_time: getNum(s, "RAMP_TIME") || undefined,
        end_temp: getNum(s, "END_TEMP") || undefined,
        description: getVal(s, "DESCRIPTION")
      });
    }
    return steps;
  };

  // Helper for global parsing
  const isGlobal = (el: Element) => {
    let parent = el.parentElement;
    while (parent) {
      if (parent.tagName === "RECIPE") return false;
      parent = parent.parentElement;
    }
    return true;
  };

  // Global Fermentables
  const fermentables = xmlDoc.getElementsByTagName("FERMENTABLE");
  for (let i = 0; i < fermentables.length; i++) {
    const f = fermentables[i];
    if (isGlobal(f)) {
      result.fermentables.push({
        name: getVal(f, "NAME"),
        type: 'fermentable',
        color: getNum(f, "COLOR"),
        yield: getNum(f, "POTENTIAL") ? Math.round((getNum(f, "POTENTIAL") - 1) / 0.046 * 100) : 75
      });
    }
  }

  // Global Hops
  const globalHops = xmlDoc.getElementsByTagName("HOP");
  for (let i = 0; i < globalHops.length; i++) {
    const h = globalHops[i];
    if (isGlobal(h)) {
      result.hops.push({
        name: getVal(h, "NAME"),
        type: 'hop',
        alpha: getNum(h, "ALPHA")
      });
    }
  }

  // Global Yeasts
  const globalYeasts = xmlDoc.getElementsByTagName("YEAST");
  for (let i = 0; i < globalYeasts.length; i++) {
    const y = globalYeasts[i];
    if (isGlobal(y)) {
      result.cultures.push({
        name: getVal(y, "NAME"),
        type: 'culture',
        form: getVal(y, "FORM").toLowerCase(),
        attenuation: getNum(y, "ATTENUATION") || 75
      });
    }
  }

  // Global Styles
  const styles = xmlDoc.getElementsByTagName("STYLE");
  for (let i = 0; i < styles.length; i++) {
    const s = styles[i];
    if (isGlobal(s)) {
      result.styles.push({
        name: getVal(s, "NAME"),
        type: 'style',
        category: getVal(s, "CATEGORY"),
        og_min: getNum(s, "OG_MIN"),
        og_max: getNum(s, "OG_MAX"),
        fg_min: getNum(s, "FG_MIN"),
        fg_max: getNum(s, "FG_MAX"),
        ibu_min: getNum(s, "IBU_MIN"),
        ibu_max: getNum(s, "IBU_MAX"),
        color_min: getNum(s, "COLOR_MIN"),
        color_max: getNum(s, "COLOR_MAX"),
        abv_min: getNum(s, "ABV_MIN"),
        abv_max: getNum(s, "ABV_MAX")
      });
    }
  }

  // Global Miscs
  const miscs = xmlDoc.getElementsByTagName("MISC");
  for (let i = 0; i < miscs.length; i++) {
    const m = miscs[i];
    if (isGlobal(m)) {
      result.miscs.push({
        name: getVal(m, "NAME"),
        type: 'misc',
        misc_type: getVal(m, "TYPE").toLowerCase(),
        misc_use: getVal(m, "USE").toLowerCase()
      });
    }
  }

  // Global Mashes
  const mashes = xmlDoc.getElementsByTagName("MASH");
  for (let i = 0; i < mashes.length; i++) {
    const m = mashes[i];
    if (isGlobal(m)) {
      result.mashes.push({
        name: getVal(m, "NAME"),
        type: 'mash_profile',
        steps: parseMashSteps(m),
        grain_temp: getNum(m, "GRAIN_TEMP"),
        sparge_temp: getNum(m, "SPARGE_TEMP"),
        ph: getNum(m, "PH"),
        notes: getVal(m, "NOTES")
      });
    }
  }

  // Global Equipments
  const equipments = xmlDoc.getElementsByTagName("EQUIPMENT");
  for (let i = 0; i < equipments.length; i++) {
    const e = equipments[i];
    if (isGlobal(e)) {
      result.equipments.push({
        name: getVal(e, "NAME"),
        type: 'equipment',
        equipment_type: 'custom',
        batch_size: getNum(e, "BATCH_SIZE"),
        boil_size: getNum(e, "BOIL_SIZE"),
        efficiency: getNum(e, "EFFICIENCY"),
        boil_time: getNum(e, "BOIL_TIME"),
        trub_chiller_loss: getNum(e, "TRUB_CHILLER_LOSS"),
        evap_rate: getNum(e, "EVAP_RATE"),
        lauter_deadspace: getNum(e, "LAUTER_DEADSPACE"),
        top_up_water: getNum(e, "TOP_UP_WATER"),
        tun_specific_heat: getNum(e, "TUN_SPECIFIC_HEAT"),
        description: getVal(e, "NOTES")
      });
    }
  }

  // A WATER profile; <WATER_KIND> (BrewBindr, not in BeerXML 1.0) says base water or target profile
  const parseWater = (w: Element) => ({
    name: getVal(w, "NAME"),
    type: 'water' as const,
    water_kind: getVal(w, "WATER_KIND").trim().toLowerCase() === 'target' ? 'target' as const : 'base' as const,
    amount: getNum(w, "AMOUNT"),
    calcium: getNum(w, "CALCIUM"),
    magnesium: getNum(w, "MAGNESIUM"),
    sodium: getNum(w, "SODIUM"),
    chloride: getNum(w, "CHLORIDE"),
    sulfate: getNum(w, "SULFATE"),
    bicarbonate: getNum(w, "BICARBONATE"),
    ph: getNum(w, "PH") || undefined,
    notes: getVal(w, "NOTES")
  });

  // Global Waters
  const waters = xmlDoc.getElementsByTagName("WATER");
  for (let i = 0; i < waters.length; i++) {
    const w = waters[i];
    if (isGlobal(w)) result.waters.push(parseWater(w));
  }

  // Recipes
  const recipes = xmlDoc.getElementsByTagName("RECIPE");
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    
    // Parse Fermentables within recipe
    const recipeFermentables: Fermentable[] = [];
    const fNodes = r.getElementsByTagName("FERMENTABLE");
    for (let j = 0; j < fNodes.length; j++) {
      const f = fNodes[j];
      recipeFermentables.push({
        name: getVal(f, "NAME"),
        type: normalizeFermentableType(getVal(f, "TYPE")),
        amount: { unit: "kilograms", value: getNum(f, "AMOUNT") },
        yield: { potential: { value: getNum(f, "POTENTIAL") || 1.037 } },
        color: { value: getNum(f, "COLOR") }
      });
    }

    // Parse Hops within recipe
    const recipeHops: Hop[] = [];
    const hNodes = r.getElementsByTagName("HOP");
    for (let j = 0; j < hNodes.length; j++) {
      const h = hNodes[j];
      recipeHops.push({
        name: getVal(h, "NAME"),
        amount: { unit: "grams", value: getNum(h, "AMOUNT") * 1000 },
        alpha_acid: { value: getNum(h, "ALPHA") },
        use: hopUse(getVal(h, "USE")),
        time: { unit: "minutes", value: getNum(h, "TIME") },
        ...hopForm(getVal(h, "FORM")),
      });
    }

    // Parse Miscs within recipe
    const recipeMiscs: any[] = [];
    const mNodes = r.getElementsByTagName("MISC");
    for (let j = 0; j < mNodes.length; j++) {
      const m = mNodes[j];
      const isWeight = getVal(m, "AMOUNT_IS_WEIGHT").trim().toUpperCase();
      recipeMiscs.push({
        name: getVal(m, "NAME"),
        type: getVal(m, "TYPE").toLowerCase(),
        use: getVal(m, "USE").toLowerCase(),
        amount: { unit: "grams", value: getNum(m, "AMOUNT") * 1000 },
        time: { unit: "minutes", value: getNum(m, "TIME") },
        ...(isWeight === 'TRUE' ? { isWeight: true } : isWeight === 'FALSE' ? { isWeight: false } : {})
      });
    }

    // Parse Cultures within recipe
    const recipeCultures: Culture[] = [];
    const yNodes = r.getElementsByTagName("YEAST");
    for (let j = 0; j < yNodes.length; j++) {
      const y = yNodes[j];
      recipeCultures.push({
        name: getVal(y, "NAME"),
        type: (getVal(y, "TYPE").toLowerCase() as any) || "ale",
        form: (getVal(y, "FORM").toLowerCase() as any) || "dry",
        attenuation: getNum(y, "ATTENUATION") || 75
      });
    }

    // Parse Style
    const styleNode = r.getElementsByTagName("STYLE")[0];
    let style: any = undefined;
    if (styleNode) {
      style = {
        name: getVal(styleNode, "NAME"),
        category: getVal(styleNode, "CATEGORY")
      };
    }

    // Parse Mash within recipe
    const mashNode = r.getElementsByTagName("MASH")[0];
    let mash: MashProfile | undefined = undefined;
    if (mashNode) {
      mash = {
        name: getVal(mashNode, "NAME"),
        steps: parseMashSteps(mashNode),
        grain_temp: getNum(mashNode, "GRAIN_TEMP"),
        sparge_temp: getNum(mashNode, "SPARGE_TEMP"),
        ph: getNum(mashNode, "PH"),
        notes: getVal(mashNode, "NOTES")
      };
    }

    const recipeId = crypto.randomUUID();

    // Water profiles of the recipe: the first base water is the source, the first target the target
    const wNodes = r.getElementsByTagName("WATER");
    const roles = new Set<string>();
    for (let j = 0; j < wNodes.length; j++) {
      const water = parseWater(wNodes[j]);
      const role = water.water_kind === 'target' ? 'target' : 'source';
      if (roles.has(role)) { result.waters.push(water); continue; }
      roles.add(role);
      result.recipeWaters.push({ recipeId, role, water });
    }

    // Water salts and lactic acid (MISC "Water Agent") belong to the water treatment
    const dilution = ownNum(r, "WATER_DILUTION_PCT");
    const targetPh = ownNum(r, "TARGET_MASH_PH");
    const water = waterAgentsToChem(recipeMiscs, {
      ...(dilution > 0 ? { dilution_pct: dilution } : {}),
      ...(targetPh > 0 ? { target_ph: targetPh } : {}),
    });

    result.recipes.push({
      id: recipeId,
      name: ownVal(r, "NAME"),
      type: (ownVal(r, "TYPE").toLowerCase().replace(" ", "_") as any) || "all_grain",
      author: ownVal(r, "BREWER"),
      notes: ownVal(r, "NOTES"),
      batch_size: { unit: "liters", value: ownNum(r, "BATCH_SIZE") },
      efficiency: { brewhouse: ownNum(r, "EFFICIENCY") },
      boil_time: { unit: "minutes", value: ownNum(r, "BOIL_TIME") },
      ingredients: { 
        fermentables: recipeFermentables, 
        hops: recipeHops, 
        cultures: recipeCultures,
        miscellaneous: water.miscs
      },
      ...(water.chem ? { water_chem: water.chem } : {}),
      style,
      mash,
      specifications: {
        og: { value: ownNum(r, "EST_OG") },
        fg: { value: ownNum(r, "EST_FG") },
        abv: { value: ownNum(r, "EST_ABV") },
        ibu: { value: ownNum(r, "IBU") },
        color: { value: ownNum(r, "EST_COLOR") }
      }
    });
  }

  result.recipes = result.recipes.map(normalizeRecipe);
  return result;
};
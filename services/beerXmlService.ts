
import { Recipe, Fermentable, Hop, Culture, MashProfile, MashStep, LibraryIngredient } from "../types";

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
    mashes: []
  };

  const getVal = (el: Element | null, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent || "";
  const getNum = (el: Element | null, tag: string) => parseFloat(el?.getElementsByTagName(tag)[0]?.textContent || "0");

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

  // Global Styles
  const styles = xmlDoc.getElementsByTagName("STYLE");
  for (let i = 0; i < styles.length; i++) {
    const s = styles[i];
    if (s.parentElement?.tagName === "RECIPE") continue;
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

  // Global Miscs
  const miscs = xmlDoc.getElementsByTagName("MISC");
  for (let i = 0; i < miscs.length; i++) {
    const m = miscs[i];
    if (m.parentElement?.tagName === "RECIPE" || m.parentElement?.tagName === "MISCELLANEOUS") continue;
    result.miscs.push({
      name: getVal(m, "NAME"),
      type: 'misc',
      misc_type: getVal(m, "TYPE").toLowerCase(),
      misc_use: getVal(m, "USE").toLowerCase()
    });
  }

  // Global Mashes
  const mashes = xmlDoc.getElementsByTagName("MASH");
  for (let i = 0; i < mashes.length; i++) {
    const m = mashes[i];
    if (m.parentElement?.tagName === "RECIPE") continue;
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

  const recipes = xmlDoc.getElementsByTagName("RECIPE");
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    
    // Parse Fermentables
    const recipeFermentables: Fermentable[] = [];
    const fNodes = r.getElementsByTagName("FERMENTABLE");
    for (let j = 0; j < fNodes.length; j++) {
      const f = fNodes[j];
      recipeFermentables.push({
        name: getVal(f, "NAME"),
        type: getVal(f, "TYPE").toLowerCase(),
        amount: { unit: "kilograms", value: getNum(f, "AMOUNT") },
        yield: { potential: { value: getNum(f, "POTENTIAL") || 1.037 } },
        color: { value: getNum(f, "COLOR") }
      });
    }

    // Parse Hops
    const recipeHops: Hop[] = [];
    const hNodes = r.getElementsByTagName("HOP");
    for (let j = 0; j < hNodes.length; j++) {
      const h = hNodes[j];
      recipeHops.push({
        name: getVal(h, "NAME"),
        amount: { unit: "grams", value: getNum(h, "AMOUNT") * 1000 },
        alpha_acid: { value: getNum(h, "ALPHA") },
        use: (getVal(h, "USE").toLowerCase().replace(" ", "_") as any) || "boil",
        time: { unit: "minutes", value: getNum(h, "TIME") }
      });
    }

    // Parse Miscs within recipe
    const recipeMiscs: any[] = [];
    const mNodes = r.getElementsByTagName("MISC");
    for (let j = 0; j < mNodes.length; j++) {
      const m = mNodes[j];
      recipeMiscs.push({
        name: getVal(m, "NAME"),
        type: getVal(m, "TYPE").toLowerCase(),
        use: getVal(m, "USE").toLowerCase(),
        amount: { unit: "grams", value: getNum(m, "AMOUNT") * 1000 },
        time: { unit: "minutes", value: getNum(m, "TIME") }
      });
    }

    // Parse Cultures
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

    result.recipes.push({
      id: Math.random().toString(36).substr(2, 9),
      name: getVal(r, "NAME"),
      type: (getVal(r, "TYPE").toLowerCase().replace(" ", "_") as any) || "all_grain",
      author: getVal(r, "BREWER"),
      notes: getVal(r, "NOTES"),
      batch_size: { unit: "liters", value: getNum(r, "BATCH_SIZE") },
      efficiency: { brewhouse: getNum(r, "EFFICIENCY") },
      boil_time: { unit: "minutes", value: getNum(r, "BOIL_TIME") },
      ingredients: { 
        fermentables: recipeFermentables, 
        hops: recipeHops, 
        cultures: recipeCultures,
        miscellaneous: recipeMiscs
      },
      style,
      mash,
      specifications: {
        og: { value: getNum(r, "EST_OG") },
        fg: { value: getNum(r, "EST_FG") },
        abv: { value: getNum(r, "EST_ABV") },
        ibu: { value: getNum(r, "IBU") },
        color: { value: getNum(r, "EST_COLOR") }
      }
    });
  }

  return result;
};

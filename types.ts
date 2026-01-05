
export interface BeerJSON {
  version: number;
  recipes: Recipe[];
}

export interface LibraryIngredient {
  id: string;
  name: string;
  type: string; // 'fermentable' | 'hop' | 'culture' | 'mash_profile' | 'misc' | 'style'
  color?: number;
  yield?: number;
  alpha?: number;
  attenuation?: number;
  form?: string;
  
  // Misc specific
  misc_type?: 'spice' | 'fining' | 'water_agent' | 'herb' | 'flavor' | 'other';
  misc_use?: 'boil' | 'mash' | 'primary' | 'secondary' | 'bottling';
  amount_is_weight?: boolean;
  use_for?: string;

  // Style specific
  category?: string;
  style_guide?: string;
  style_type?: 'lager' | 'ale' | 'mead' | 'wheat' | 'mixed' | 'cider';
  og_min?: number;
  og_max?: number;
  fg_min?: number;
  fg_max?: number;
  ibu_min?: number;
  ibu_max?: number;
  color_min?: number;
  color_max?: number;
  abv_min?: number;
  abv_max?: number;
  profile?: string;
  examples?: string;

  // Mash specific library fields
  grain_temp?: number;
  sparge_temp?: number;
  ph?: number;
  steps?: MashStep[];
  notes?: string;
}

export interface MashStep {
  name: string;
  type: 'infusion' | 'temperature' | 'decoction';
  infuse_amount?: number; // Liters
  step_temp: number; // Celsius
  step_time: number; // Minutes
  ramp_time?: number; // Minutes
  end_temp?: number; // Celsius
  description?: string;
}

export interface MashProfile {
  name: string;
  grain_temp?: number;
  notes?: string;
  sparge_temp?: number;
  ph?: number;
  steps: MashStep[];
}

export interface Recipe {
  id?: string;
  name: string;
  type: 'extract' | 'partial_mash' | 'all_grain';
  author: string;
  notes?: string;
  batch_size: {
    unit: 'liters' | 'gallons';
    value: number;
  };
  style?: {
    name: string;
    category?: string;
    libraryId?: string;
  };
  ingredients: {
    fermentables: Fermentable[];
    hops: Hop[];
    cultures: Culture[];
    miscellaneous?: Misc[];
    water?: Water[];
  };
  mash?: MashProfile;
  efficiency: {
    brewhouse: number;
  };
  boil_time: {
    unit: 'minutes';
    value: number;
  };
  specifications?: {
    og?: { value: number };
    fg?: { value: number };
    abv?: { value: number };
    ibu?: { value: number };
    color?: { value: number };
  };
}

export interface Fermentable {
  name: string;
  type: string;
  amount: { unit: 'kilograms' | 'pounds'; value: number };
  yield?: { potential: { value: number } };
  color?: { value: number };
  libraryId?: string;
}

export interface Hop {
  name: string;
  amount: { unit: 'grams' | 'ounces'; value: number };
  alpha_acid?: { value: number };
  use: 'boil' | 'dry_hop' | 'mash' | 'first_wort' | 'whirlpool';
  time: { unit: 'minutes' | 'days'; value: number };
  libraryId?: string;
}

export interface Culture {
  name: string;
  type: 'ale' | 'lager' | 'wheat' | 'wine' | 'champagne';
  form: 'liquid' | 'dry' | 'slant' | 'culture';
  amount?: { unit: 'units' | 'grams'; value: number };
  attenuation?: number;
  libraryId?: string;
}

export interface Misc {
  name: string;
  type: string;
  use: string;
  amount: { unit: string; value: number };
  time: { unit: string; value: number };
  libraryId?: string;
}

export interface Water {
  name: string;
  amount: { unit: 'liters' | 'gallons'; value: number };
}

export interface BrewLogEntry {
  id: string;
  recipeId: string;
  date: string; // Original start date
  brewDate?: string;
  fermentationDate?: string;
  lageringDate?: string;
  status: 'brewing' | 'fermenting' | 'lagering' | 'bottled';
  notes: string;
  measurements: {
    actual_og?: number;
    actual_fg?: number;
    actual_volume?: number;
    mash_temp?: number;
    boil_gravity?: number;
    measured_alpha?: Record<string, number>;
    fermentation_temp?: number;
  };
  bottling?: {
    date?: string;
    target_co2: number;
    sugar_type: 'table_sugar' | 'glucose' | 'dme';
    sugar_amount?: number;
    bottling_volume?: number;
  };
}

export interface TastingNote {
  id: string;
  recipeId: string;
  brewLogId: string;
  date: string;
  appearance: number;
  aroma: number;
  flavor: number;
  mouthfeel: number;
  overall: number;
  comments: string;
}

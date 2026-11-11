
export interface BeerJSON {
  version: number;
  recipes: Recipe[];
}

import { Language } from './services/i18n';

export type ItemStatus = 'private' | 'submitted' | 'approved';

export interface UserPreferences {
  units: 'metric' | 'imperial';
  colorScale: 'srm' | 'ebc';
  language: Language;
  enableStockManagement: boolean;
  bottled_period: 'week' | 'month' | 'year' | 'all';
  gravityUnit?: 'sg' | 'plato' | 'both'; // how densities are shown and entered (default SG)
  refractometerWcf?: number; // wort correction factor of the refractometer (default 1.04)
}

export type BreweryRole = 'admin' | 'brewmaster' | 'brewer' | 'taster';

export interface UserProfile {
  id: string;
  email?: string;
  role: 'admin' | 'user';
  preferences: UserPreferences;
  brewery_id?: string;
  brewery_role?: BreweryRole;
  /** Name shown to the team, e.g. as taster of tasting notes (max 40 characters) */
  display_name?: string | null;
}

export interface Brewery {
  id: string;
  name: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  brewery_id: string;
  role: BreweryRole;
  email?: string;
  code: string;
  created_at: string;
  expires_at: string;
  /** How often the e-mail was sent (max. 3) */
  sent_count?: number;
  last_sent_at?: string | null;
}

export interface LibraryIngredient {
  id: string;
  user_id?: string;
  brewery_id?: string;
  status?: ItemStatus;
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

  // Equipment & Mash specific library fields
  description?: string;
  equipment_type?: 'biab' | 'all_in_one' | 'two_vessel' | 'three_vessel' | 'rims' | 'herms' | 'custom';
  preset?: string;
  vessels?: Vessel[];
  batch_size?: number;
  boil_size?: number;
  efficiency?: number;
  boil_time?: number;
  trub_chiller_loss?: number;
  fermenter_loss?: number;
  evap_rate?: number;
  top_up_water?: number;
  lauter_deadspace?: number;
  tun_specific_heat?: number;
  mash_capacity?: number;      // L: water + grain the mash tun holds
  grain_displacement?: number; // L per kg: room the grain (and bag) takes in the mash
  grain_absorption?: number;   // L per kg: water the spent grain keeps
  boil_capacity?: number;      // L: most wort the boil kettle takes
  max_grain_kg?: number;       // kg: most grain the mash tun / malt pipe takes
  is_default?: boolean;        // the brewery's default installation

  // Water profile (mg/L)
  calcium?: number;
  magnesium?: number;
  sodium?: number;
  chloride?: number;
  sulfate?: number;
  bicarbonate?: number;
  grain_temp?: number;
  sparge_temp?: number;
  ph?: number;
  steps?: MashStep[];
  notes?: string;
  amount?: number;
  stock?: {
    amount: number;
    unit: string;
    stock_target?: number;
  };
}

export interface Vessel {
  name: string;
  role: 'mash' | 'boil' | 'hlt' | 'combined';
  volume: number;
  heating: 'electric' | 'gas' | 'none';
  pump: boolean;
}

export interface MashStep {
  name: string;
  type: 'infusion' | 'temperature' | 'decoction';
  infuse_amount?: number; // Liters
   step_temp?: number; // Celsius (Legacy)
   step_time?: number; // Minutes (Legacy)
  temperature?: number; // Celsius
  duration?: number; // Minutes
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
  user_id?: string;
  brewery_id?: string;
  status?: ItemStatus;
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
  equipmentId?: string; // brewing installation (library item of type 'equipment')
  water?: {
    mash_l?: number;    // own mash water, instead of the calculated one
    sparge_l?: number;  // own sparge water
    drain_all?: boolean; // drain everything into the fermenter: no trub/chiller loss
  };
  water_chem?: {
    source?: string;       // library water id or 'preset:<key>'
    target?: string;       // idem
    dilution_pct?: number; // share of osmosis / demineralised water
    cacl2_form?: 'cacl2' | 'cacl2_33' | 'cacl2_36';
    salts?: Partial<Record<'gypsum' | 'cacl2' | 'cacl2_33' | 'cacl2_36' | 'epsom' | 'nacl' | 'nahco3', number>>;
    target_ph?: number;  // mash pH to aim for (default 5.4)
    lactic_ml?: number;  // lactic acid 80 % in the mash
  };
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
  form?: 'pellet' | 'leaf' | 'plug'; // pellet when not given
  temperature?: number; // Celsius, whirlpool only (default 80)
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
  user_id?: string;
  brewery_id?: string;
  recipeId: string;
  date: string; // Original start date
  brewDate?: string;
  fermentationDate?: string;
  lageringDate?: string;
  status: 'brewing' | 'fermenting' | 'lagering' | 'bottled';
  /** Brewed at another size than the recipe: every amount × factor (the recipe itself is unchanged) */
  scale?: { factor: number; batch_l: number };
  /** Installation this brew is made on (otherwise the recipe's, or the brewery default) */
  equipmentId?: string;
  /** Water treatment actually used (starts as the recipe's); absent in older brews: the recipe's */
  water_chem?: Recipe['water_chem'];
  /** All bottles or the keg are finished: no longer offered for new tasting notes */
  finished?: boolean;
  finishedDate?: string;
  notes: string;
  yeast_pitch?: {
    form: 'dry' | 'liquid';
    amount: number;            // grams (dry) or packs (liquid)
    production_date?: string;  // liquid yeast
    rate?: number;             // million cells / ml / °P; default from yeast type and OG
  };
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
    method?: 'bottle' | 'keg'; // bottles with priming sugar (default) or force-carbonated keg
    keg_temp?: number; // Celsius, beer temperature while carbonating the keg
  };
}

export interface TastingNote {
  id: string;
  user_id?: string;
  brewery_id?: string;
  recipeId: string;
  brewLogId: string;
  date: string;
  appearance: number;
  aroma: number;
  flavor: number;
  mouthfeel: number;
  overall: number;
  comments: string;
  /** Set when a member entered the note for someone without an account */
  guest_name?: string;
  /** The AI analysis of this note, kept with it */
  ai_feedback?: string;
}

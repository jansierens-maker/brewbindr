import { LibraryIngredient } from '../types';
import { isPrivateItem } from './calculations';
import { Ions, WATER_PRESETS, WaterProfilePreset, ionsOf } from './waterChemistry';

/**
 * Water profiles have a kind (#174): base water (the water you start from: tap water,
 * a classic water) or target profile (a beer style or colour profile to aim for).
 */
export type WaterKind = 'base' | 'target';

export const waterKind = (w: Pick<LibraryIngredient, 'water_kind'>): WaterKind => w.water_kind ?? 'base';

const presetKind = (p: WaterProfilePreset): WaterKind => (p.kind === 'source' ? 'base' : 'target');

/**
 * The built-in presets as public water profiles. Since #174 they live in the public library
 * (migration 20261112200000_water_presets_public); this is the source of that migration and
 * the fallback when they are not loaded.
 */
export const presetToWater = (p: WaterProfilePreset): LibraryIngredient => ({
  id: `preset-water-${p.key.replace(/_/g, '-')}`,
  name: p.name,
  type: 'water',
  status: 'approved',
  water_kind: presetKind(p),
  preset_key: p.key,
  calcium: p.ca,
  magnesium: p.mg,
  sodium: p.na,
  chloride: p.cl,
  sulfate: p.so4,
  bicarbonate: p.hco3,
});

export const PRESET_WATERS: LibraryIngredient[] = WATER_PRESETS.map(presetToWater);

const byName = (a: LibraryIngredient, b: LibraryIngredient) => a.name.localeCompare(b.name);

/** The public water profiles; the built-in presets when none of them is loaded. */
export const publicWaters = (library: LibraryIngredient[]): LibraryIngredient[] => {
  const pub = library.filter(l => l.type === 'water' && l.status === 'approved');
  return pub.some(w => w.preset_key) ? pub : [...pub, ...PRESET_WATERS];
};

/** What the water treatment offers for base water or target: own profiles first, then public ones. */
export const waterOptions = (library: LibraryIngredient[], kind: WaterKind) => ({
  own: library.filter(l => l.type === 'water' && isPrivateItem(l) && waterKind(l) === kind).sort(byName),
  public: publicWaters(library).filter(w => waterKind(w) === kind).sort(byName),
});

/**
 * A water reference in a recipe or brew: a library id, or 'preset:<key>' from before #174
 * (the public profile made from that preset, otherwise the built-in preset).
 */
export const resolveWater = (ref: string | undefined, library: LibraryIngredient[]): { id: string; name: string; ions: Ions } | undefined => {
  if (!ref) return undefined;
  const all = library.filter(l => l.type === 'water');
  const waters = [...all.filter(l => l.status === 'approved'), ...all.filter(l => l.status !== 'approved'), ...PRESET_WATERS];
  const w = ref.startsWith('preset:')
    ? waters.find(x => x.preset_key === ref.slice(7))
    : waters.find(x => x.id === ref);
  return w && { id: w.id, name: w.name, ions: ionsOf(w) };
};

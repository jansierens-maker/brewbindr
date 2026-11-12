import { LibraryIngredient, Vessel } from '../types';

/**
 * Starting points for a new installation (#164). Since #164 they live in the public
 * library (migration 20261112190000_equipment_presets_public); this list is only the
 * fallback when no public installation could be loaded, and the source of that migration.
 */
export type EquipmentPreset = {
  /** Fixed id when the name changed after the preset went into the public library */
  id?: string;
  name: string;
  type: LibraryIngredient['equipment_type'];
  batch: number;
  efficiency: number;
  vessels: Vessel[];
  trub_loss: number;
  mash_capacity?: number;
  grain_displacement?: number;
  boil_capacity?: number;
  max_grain_kg?: number;
};

export const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  {
    name: "Brewie",
    type: 'two_vessel',
    batch: 23,
    efficiency: 70,
    trub_loss: 2,
    mash_capacity: 22,
    grain_displacement: 1,
    boil_capacity: 23,
    vessels: [
      { name: "Maischketel", role: 'combined', volume: 27, heating: 'electric', pump: true },
      { name: "Kookketel", role: 'boil', volume: 23, heating: 'electric', pump: true }
    ]
  },
  {
    name: "Grainfather G30",
    type: 'all_in_one',
    batch: 25,
    efficiency: 72,
    trub_loss: 2,
    vessels: [{ name: "G30", role: 'combined', volume: 30, heating: 'electric', pump: true }]
  },
  {
    name: "Grainfather G40",
    type: 'all_in_one',
    batch: 35,
    efficiency: 72,
    trub_loss: 2,
    mash_capacity: 46,
    boil_capacity: 46,
    max_grain_kg: 13,
    vessels: [{ name: "G40", role: 'combined', volume: 40, heating: 'electric', pump: true }]
  },
  {
    name: "Brew Monk B40",
    type: 'all_in_one',
    batch: 30,
    efficiency: 72,
    trub_loss: 2,
    mash_capacity: 40,
    boil_capacity: 40,
    max_grain_kg: 8,
    vessels: [{ name: "B40", role: 'combined', volume: 40, heating: 'electric', pump: true }]
  },
  {
    name: "Brew Monk B50",
    type: 'all_in_one',
    batch: 45,
    efficiency: 72,
    trub_loss: 2,
    mash_capacity: 50,
    boil_capacity: 50,
    max_grain_kg: 12,
    vessels: [{ name: "B50", role: 'combined', volume: 50, heating: 'electric', pump: true }]
  },
  {
    name: "Brew Monk B70",
    type: 'all_in_one',
    batch: 65,
    efficiency: 72,
    trub_loss: 3,
    mash_capacity: 70,
    boil_capacity: 70,
    max_grain_kg: 18,
    vessels: [{ name: "B70", role: 'combined', volume: 70, heating: 'electric', pump: true }]
  },
  {
    name: "Robobrew / BrewZilla",
    type: 'all_in_one',
    batch: 30,
    efficiency: 70,
    trub_loss: 2,
    vessels: [{ name: "BrewZilla", role: 'combined', volume: 35, heating: 'electric', pump: true }]
  },
  {
    name: "BIAB 20L",
    type: 'biab',
    batch: 20,
    efficiency: 65,
    trub_loss: 2,
    vessels: [{ name: "Ketel", role: 'combined', volume: 30, heating: 'gas', pump: false }]
  },
  {
    name: "BIAB 30L",
    type: 'biab',
    batch: 30,
    efficiency: 65,
    trub_loss: 2,
    vessels: [{ name: "Ketel", role: 'combined', volume: 45, heating: 'gas', pump: false }]
  },
  {
    id: "preset-klassiek-3-vatten-20l",
    name: "Klassiek 3 ketels 20L",
    type: 'three_vessel',
    batch: 20,
    efficiency: 75,
    trub_loss: 1,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 30, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 30, heating: 'none', pump: false },
      { name: "Kookketel", role: 'boil', volume: 30, heating: 'gas', pump: true }
    ]
  },
  {
    id: "preset-klassiek-3-vatten-30l",
    name: "Klassiek 3 ketels 30L",
    type: 'three_vessel',
    batch: 30,
    efficiency: 75,
    trub_loss: 2,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 40, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 40, heating: 'none', pump: false },
      { name: "Kookketel", role: 'boil', volume: 40, heating: 'gas', pump: true }
    ]
  },
  {
    name: "RIMS 20L",
    type: 'rims',
    batch: 20,
    efficiency: 78,
    trub_loss: 1,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 30, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 30, heating: 'none', pump: true },
      { name: "Kookketel", role: 'boil', volume: 30, heating: 'gas', pump: true }
    ]
  },
  {
    name: "HERMS 20L",
    type: 'herms',
    batch: 20,
    efficiency: 80,
    trub_loss: 1,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 30, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 30, heating: 'none', pump: true },
      { name: "Kookketel", role: 'boil', volume: 30, heating: 'gas', pump: true }
    ]
  }
];

/** A preset as a (not yet saved) library item, like the public installations. */
export const presetToItem = (p: EquipmentPreset): LibraryIngredient => ({
  id: p.id ?? `preset-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
  name: p.name,
  type: 'equipment',
  preset: p.name,
  status: 'approved',
  equipment_type: p.type,
  batch_size: p.batch,
  efficiency: p.efficiency,
  trub_chiller_loss: p.trub_loss,
  mash_capacity: p.mash_capacity,
  grain_displacement: p.grain_displacement,
  boil_capacity: p.boil_capacity,
  max_grain_kg: p.max_grain_kg,
  vessels: p.vessels,
  boil_time: 60,
  fermenter_loss: 1,
  evap_rate: 2,
  top_up_water: 0,
});

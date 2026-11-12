import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EQUIPMENT_PRESETS, presetToItem } from '../../services/equipmentPresets';
import { equipmentCapacity } from '../../services/calculations';

describe('equipment presets (#164)', () => {
  const items = EQUIPMENT_PRESETS.map(presetToItem);

  it('have unique ids and names', () => {
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
    expect(new Set(items.map(i => i.name.toLowerCase())).size).toBe(items.length);
  });

  it('are public installations with their preset name', () => {
    for (const i of items) {
      expect(i.type).toBe('equipment');
      expect(i.status).toBe('approved');
      expect(i.preset).toBe(i.name);
    }
    expect(equipmentCapacity(items.find(i => i.name === 'Brew Monk B50')!).maxGrainKg).toBe(12);
  });

  it('match the migration that puts them in the public library', () => {
    const sql = readFileSync('supabase/migrations/20261112190000_equipment_presets_public.sql', 'utf8');
    const rename = readFileSync('supabase/migrations/20261112210000_rename_three_vessel_presets.sql', 'utf8');
    // Renamed afterwards: the first migration has the old name, the rename migration the new one
    const renamed: Record<string, string> = { 'preset-klassiek-3-vatten-20l': 'Klassiek 3-vatten 20L', 'preset-klassiek-3-vatten-30l': 'Klassiek 3-vatten 30L' };
    for (const i of items) {
      const original = renamed[i.id] ? { ...i, name: renamed[i.id], preset: renamed[i.id] } : i;
      expect(sql).toContain(`('${i.id}', '${JSON.stringify(original).replace(/'/g, "''")}'::jsonb)`);
      if (renamed[i.id]) expect(rename).toContain(`('${i.id}', '${renamed[i.id]}', '${i.name}')`);
    }
  });
});

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
    for (const i of items) {
      expect(sql).toContain(`('${i.id}', '${JSON.stringify(i).replace(/'/g, "''")}'::jsonb)`);
    }
  });
});

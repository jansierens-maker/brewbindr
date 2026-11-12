import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LibraryIngredient } from '../../types';
import { PRESET_WATERS, publicWaters, resolveWater, waterOptions } from '../../services/waterProfiles';
import { defaultWaterProfile } from '../../services/calculations';

const own = (id: string, extra: Partial<LibraryIngredient> = {}): LibraryIngredient =>
  ({ id, name: id, type: 'water', status: 'private', calcium: 10, ...extra });
const pub = (id: string, extra: Partial<LibraryIngredient> = {}): LibraryIngredient =>
  ({ id, name: id, type: 'water', status: 'approved', calcium: 20, ...extra });

describe('water profiles: base water and target profiles (#174)', () => {
  it('presets: classic waters are base water, colour and style profiles targets', () => {
    expect(PRESET_WATERS.filter(w => w.water_kind === 'base')).toHaveLength(9);
    expect(PRESET_WATERS.filter(w => w.water_kind === 'target')).toHaveLength(24);
    expect(new Set(PRESET_WATERS.map(w => w.id)).size).toBe(PRESET_WATERS.length);
  });

  it('match the migration that puts them in the public library', () => {
    const sql = readFileSync('supabase/migrations/20261112200000_water_presets_public.sql', 'utf8');
    for (const w of PRESET_WATERS) expect(sql).toContain(`('${w.id}', '${JSON.stringify(w).replace(/'/g, "''")}'::jsonb)`);
  });

  it('filters by kind: own first, then public; profiles without a kind are base water', () => {
    const lib = [own('tap'), own('my-ipa', { water_kind: 'target' }), pub('Leidingwater Gent'), ...PRESET_WATERS];
    const base = waterOptions(lib, 'base');
    expect(base.own.map(w => w.id)).toEqual(['tap']);
    expect(base.public.map(w => w.name)).toContain('Leidingwater Gent');
    expect(base.public.map(w => w.name)).toContain('Pilsen');
    expect(base.public.map(w => w.name)).not.toContain('Tripel');
    const target = waterOptions(lib, 'target');
    expect(target.own.map(w => w.id)).toEqual(['my-ipa']);
    expect(target.public.map(w => w.name)).toContain('Tripel');
    expect(target.public.map(w => w.name)).not.toContain('Pilsen');
  });

  it('falls back to the built-in presets when they are not loaded', () => {
    expect(publicWaters([pub('Leidingwater Gent')])).toHaveLength(1 + PRESET_WATERS.length);
    expect(publicWaters([pub('p', { preset_key: 'pilsen' })])).toHaveLength(1);
  });

  it("resolves old 'preset:<key>' references to the public profile, else the built-in one", () => {
    const edited = pub('preset-water-burton', { name: 'Burton (corrected)', preset_key: 'burton', calcium: 300 });
    expect(resolveWater('preset:burton', [edited])).toMatchObject({ name: 'Burton (corrected)', ions: { ca: 300 } });
    expect(resolveWater('preset:burton', [])).toMatchObject({ name: 'Burton-on-Trent', ions: { ca: 352 } });
    expect(resolveWater('preset:style_tripel', [])?.name).toBe('Tripel');
    expect(resolveWater('tap', [own('tap')])?.ions.ca).toBe(10);
    expect(resolveWater('preset:nope', [])).toBeUndefined();
  });

  it('the default (★) is base water only', () => {
    expect(defaultWaterProfile([own('tap'), own('ipa', { water_kind: 'target' })])?.id).toBe('tap');
    expect(defaultWaterProfile([own('ipa', { water_kind: 'target', is_default: true })])).toBeUndefined();
  });
});

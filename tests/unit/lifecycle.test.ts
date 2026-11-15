import { describe, expect, it } from 'vitest';
import {
  stageOf, moveToStage, canMove, brewStart, needsNewVersion, newVersion, otherProductionVersions, freshLifecycle, baseName,
  RECIPE_STAGES, TRANSITIONS, contentChanged,
} from '../../services/lifecycle';
import type { Recipe } from '../../types';

const recipe = (extra: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', name: 'Tripel', type: 'all_grain', author: '', status: 'private',
  batch_size: { unit: 'liters', value: 20 }, efficiency: { brewhouse: 72 }, boil_time: { unit: 'minutes', value: 60 },
  ingredients: { fermentables: [], hops: [], cultures: [] }, ...extra,
});
const at = new Date('2026-11-15T08:00:00Z');

describe('recipe lifecycle', () => {
  it('starts as an idea', () => {
    expect(stageOf(recipe())).toBe('idea');
  });

  it('only allows the planned transitions', () => {
    expect(canMove('idea', 'lab')).toBe(true);
    expect(canMove('idea', 'production')).toBe(false);
    expect(canMove('lab', 'production')).toBe(true); // pilot can be skipped
    expect(canMove('rejected', 'idea')).toBe(true);
    expect(canMove('retired', 'production')).toBe(true);
    for (const s of RECIPE_STAGES) expect(TRANSITIONS[s].length).toBeGreaterThan(0);
    expect(() => moveToStage(recipe(), 'production')).toThrow();
  });

  it('keeps the history with date, person and note', () => {
    let r = moveToStage(recipe(), 'lab', { by: 'u1', at });
    r = moveToStage(r, 'rejected', { by: 'u2', note: '  te zoet ', at });
    expect(stageOf(r)).toBe('rejected');
    expect(r.lifecycle!.history).toEqual([
      { stage: 'lab', at: at.toISOString(), by: 'u1' },
      { stage: 'rejected', at: at.toISOString(), by: 'u2', note: 'te zoet' },
    ]);
  });

  it('requires a reason to reject or retire', () => {
    const lab = moveToStage(recipe(), 'lab', { at });
    expect(() => moveToStage(lab, 'rejected', { note: ' ' })).toThrow();
  });

  it('decides what starting a brew asks', () => {
    expect(brewStart(recipe())).toEqual({ kind: 'move', to: 'lab' });
    expect(brewStart(recipe({ lifecycle: { stage: 'pilot', history: [] } }))).toEqual({ kind: 'ok' });
    expect(brewStart(recipe({ lifecycle: { stage: 'paused', history: [] } }))).toEqual({ kind: 'move', to: 'production' });
    expect(brewStart(recipe({ lifecycle: { stage: 'retired', history: [] } }))).toEqual({ kind: 'blocked' });
    expect(brewStart(recipe({ status: 'approved' }))).toEqual({ kind: 'ok' });
  });

  it('makes a new version of a production recipe, in lab', () => {
    const prod = recipe({ lifecycle: { stage: 'production', history: [] } });
    expect(needsNewVersion(prod)).toBe(true);
    expect(needsNewVersion(recipe())).toBe(false);
    const v2 = newVersion({ ...prod, name: 'Tripel', notes: 'meer koriander' }, prod, [prod], { takenNames: ['Tripel'], by: 'u1', at });
    expect(v2).toMatchObject({ name: 'Tripel v2', version: 2, version_of: 'r1', notes: 'meer koriander', status: 'private' });
    expect(v2.id).not.toBe('r1');
    expect(stageOf(v2)).toBe('lab');
    // A third version counts on from the highest one
    const v2prod = { ...v2, lifecycle: { stage: 'production' as const, history: [] } };
    const v3 = newVersion(v2prod, v2prod, [prod, v2prod], { takenNames: ['Tripel', 'Tripel v2'], at });
    expect(v3).toMatchObject({ name: 'Tripel v3', version: 3, version_of: 'r1' });
    expect(baseName('Tripel v12')).toBe('Tripel');
  });

  it('finds the other production version to retire', () => {
    const v1 = recipe({ lifecycle: { stage: 'production', history: [] } });
    const v2 = recipe({ id: 'r2', name: 'Tripel v2', version: 2, version_of: 'r1', lifecycle: { stage: 'pilot', history: [] } });
    expect(otherProductionVersions(v2, [v1, v2]).map(r => r.id)).toEqual(['r1']);
    expect(otherProductionVersions(v1, [v1, v2])).toEqual([]);
  });

  it('sees a changed recipe, not a changed stage or empty lists', () => {
    const a = recipe();
    expect(contentChanged({ ...a, lifecycle: { stage: 'lab', history: [] }, specifications: { og: { value: 1.05 } } }, a)).toBe(false);
    expect(contentChanged({ ...a, ingredients: { ...a.ingredients, miscellaneous: [] }, notes: '' }, a)).toBe(false);
    expect(contentChanged({ ...a, notes: 'meer hop' }, a)).toBe(true);
    expect(contentChanged({ ...a, batch_size: { unit: 'liters', value: 25 } }, a)).toBe(true);
  });

  it('lets a copy start over as an idea', () => {
    const c = freshLifecycle(recipe({ version: 3, version_of: 'r0', lifecycle: { stage: 'production', history: [] } }));
    expect(c.lifecycle).toBeUndefined();
    expect(c.version).toBeUndefined();
    expect(c.version_of).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { BreweryBackup, derivedId, isBreweryBackup, makeBreweryBackup, planBreweryRestore, remapIds } from '../../services/backup';

const backup: BreweryBackup = makeBreweryBackup({ id: 'brew-a', name: 'Brouwerij A' }, {
  recipes: [
    { id: 'r1', status: 'private', data: { id: 'r1', name: 'Tripel', equipmentId: 'e1', ingredients: { hops: [{ name: 'Saaz', libraryId: 'h1' }] }, water_chem: { source: 'w1', target: 'preset:style_tripel' } } },
    { id: 'r2', status: 'submitted', data: { id: 'r2', name: 'Dubbel' } },
  ],
  hops: [{ id: 'h1', status: 'private', data: { id: 'h1', name: 'Saaz', alpha: 3.5 } }],
  equipment: [{ id: 'e1', status: 'private', data: { id: 'e1', name: 'Brewie' } }],
  waters: [{ id: 'w1', status: 'private', data: { id: 'w1', name: 'Leidingwater' } }],
  brew_logs: [{ id: 'l1', data: { id: 'l1', recipeId: 'r1', equipmentId: 'e1' } }],
  tasting_notes: [{ id: 'n1', data: { id: 'n1', brewLogId: 'l1' } }],
  stock: [{ ingredient_type: 'hop', ingredient_id: 'h1', amount: 100, unit: 'g', target: null }],
}, new Date('2026-11-14T10:00:00Z'));

describe('brewery backup', () => {
  it('has a recognisable format', () => {
    expect(isBreweryBackup(backup)).toBe(true);
    expect(isBreweryBackup({ version: 1, recipes: [] })).toBe(false);
    expect(backup).toMatchObject({ format: 'brewbindr-brewery-backup', version: 2, exported_at: '2026-11-14T10:00:00.000Z' });
  });

  it('derives the same new id each time, a different one per brewery', async () => {
    const a = await derivedId('brew-b', 'r1');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await derivedId('brew-b', 'r1')).toBe(a);
    expect(await derivedId('brew-c', 'r1')).not.toBe(a);
  });

  it('replaces old ids anywhere in the data', () => {
    expect(remapIds({ a: 'x', b: ['x', 'y', { c: 'x' }], n: 3 }, new Map([['x', 'X']]))).toEqual({ a: 'X', b: ['X', 'y', { c: 'X' }], n: 3 });
  });
});

describe('restore into the same brewery', () => {
  it('keeps the ids: existing rows are overwritten, missing ones added', async () => {
    const plan = await planBreweryRestore(backup, 'brew-a', { recipes: [{ id: 'r1', name: 'Tripel', status: 'private' }] });
    expect(plan.sameBrewery).toBe(true);
    expect(plan.tables.recipes!.map(r => r.id)).toEqual(['r1', 'r2']);
    expect(plan.counts.recipes).toEqual({ added: 1, updated: 1 });
    expect(plan.tables.brew_logs![0].data.recipeId).toBe('r1');
    expect(plan.tables.recipes![1].status).toBe('submitted');
  });

  it('leaves out an item that is public now', async () => {
    const plan = await planBreweryRestore(backup, 'brew-a', { hops: [{ id: 'h1', name: 'Saaz', status: 'approved' }] });
    expect(plan.tables.hops).toBeUndefined();
    expect(plan.skippedPublic).toBe(1);
    // ... and its stock with it
    expect(plan.tables.stock).toEqual([]);
  });
});

describe('restore into another brewery', () => {
  it('gives new ids and every reference follows', async () => {
    const plan = await planBreweryRestore(backup, 'brew-b', {});
    const recipe = plan.tables.recipes![0];
    const hop = plan.tables.hops![0];
    const eq = plan.tables.equipment![0];
    const water = plan.tables.waters![0];
    const log = plan.tables.brew_logs![0];
    const note = plan.tables.tasting_notes![0];
    expect(recipe.id).not.toBe('r1');
    expect(recipe.data.id).toBe(recipe.id);
    expect(recipe.data).toMatchObject({ equipmentId: eq.id, ingredients: { hops: [{ libraryId: hop.id }] }, water_chem: { source: water.id, target: 'preset:style_tripel' } });
    expect(log.data).toMatchObject({ recipeId: recipe.id, equipmentId: eq.id });
    expect(note.data.brewLogId).toBe(log.id);
    expect(plan.tables.stock).toEqual([{ ingredient_type: 'hop', ingredient_id: hop.id, amount: 100, unit: 'g', target: null }]);
    expect(plan.counts.recipes).toEqual({ added: 2, updated: 0 });
  });

  it('merges into an item with the same name, and twice gives the same result', async () => {
    const existing = { hops: [{ id: 'my-saaz', name: ' saaz ', status: 'private' }] };
    const plan = await planBreweryRestore(backup, 'brew-b', existing);
    expect(plan.tables.hops![0].id).toBe('my-saaz');
    expect(plan.counts.hops).toEqual({ added: 0, updated: 1 });
    expect((plan.tables.recipes![0].data.ingredients as any).hops[0].libraryId).toBe('my-saaz');

    // Restoring again: the rows written the first time now exist and are overwritten
    const written = Object.fromEntries(Object.entries(plan.tables).filter(([t]) => t !== 'stock')
      .map(([t, rows]) => [t, (rows as any[]).map(r => ({ id: r.id, name: r.data.name, status: r.status }))]));
    const again = await planBreweryRestore(backup, 'brew-b', written);
    expect(again.tables.recipes!.map(r => r.id)).toEqual(plan.tables.recipes!.map(r => r.id));
    expect(again.counts.brew_logs).toEqual({ added: 0, updated: 1 });
    expect(again.counts.recipes).toEqual({ added: 0, updated: 2 });
  });
});

import { describe, expect, it } from 'vitest';
import { applyProposal, coverage, needsTranslation, toInput } from '../../services/translationAdmin';
import type { LibraryIngredient } from '../../types';

const coriander: LibraryIngredient = { id: 'm1', type: 'misc', name: 'Coriander', names: { nl: 'Koriander' }, use_for: 'Witbier', status: 'approved' };
const saaz: LibraryIngredient = { id: 'h1', type: 'hop', name: 'Saaz', status: 'approved' };

describe('translating the public library', () => {
  it('sends the names and descriptions an item has', () => {
    expect(toInput(coriander)).toEqual({ id: 'm1', type: 'misc', name: 'Coriander', names: { nl: 'Koriander' }, texts: { use_for: 'Witbier' } });
  });

  it('fills in a proposal without overwriting what is there', () => {
    const merged = applyProposal({ ...coriander, aliases: ['koriander'] }, {
      id: 'm1', name_kind: 'generic', names: { nl: 'Korianderzaad', fr: 'Coriandre', en: 'Coriander' }, aliases: ['coriander seed'],
      i18n: { nl: { use_for: 'Witbier' }, fr: { use_for: 'Bière blanche' } },
    });
    expect(merged.names).toEqual({ nl: 'Koriander', fr: 'Coriandre', en: 'Coriander' });
    expect(merged.aliases).toEqual(['koriander', 'coriander seed']);
    expect(merged.i18n).toEqual({ nl: { use_for: 'Witbier' }, fr: { use_for: 'Bière blanche' } });
    expect(merged.name_kind).toBe('generic');
    // A product name gets no translated names
    expect(applyProposal(saaz, { id: 'h1', name_kind: 'product', names: { nl: 'Saaz' }, aliases: ['Žatec'], i18n: {} }))
      .toMatchObject({ name_kind: 'product', aliases: ['Žatec'] });
    expect(applyProposal(saaz, { id: 'h1', name_kind: 'product', names: {}, aliases: [], i18n: {} }).names).toBeUndefined();
  });

  it('counts what is still missing per type and language', () => {
    const c = coverage([coriander, saaz, { ...saaz, id: 'h2', name: 'Citra', name_kind: 'product' }]);
    expect(c.find(x => x.type === 'misc')).toEqual({ type: 'misc', total: 1, namesMissing: { nl: 0, fr: 1, en: 1 }, textsMissing: { nl: 1, fr: 1, en: 1 } });
    expect(c.find(x => x.type === 'hop')?.namesMissing).toEqual({ nl: 1, fr: 1, en: 1 });
    expect(needsTranslation(coriander, 'nl', 'name')).toBe(false);
    expect(needsTranslation(coriander, 'fr', 'name')).toBe(true);
    expect(needsTranslation(coriander, 'nl', 'text')).toBe(true);
    expect(needsTranslation({ ...saaz, name_kind: 'product' }, 'any', 'any')).toBe(false);
  });
});

describe('small batches (#215)', () => {
  it('splits on the number of items and on the amount of text', async () => {
    const { planBatches } = await import('../../services/translationAdmin');
    const short = Array.from({ length: 40 }, (_, i) => ({ id: `h${i}`, type: 'hop', name: `Hop ${i}`, status: 'approved' }) as LibraryIngredient);
    expect(planBatches(short).map(b => b.length)).toEqual([15, 15, 10]);
    const long = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'style', name: `Style ${i}`, profile: 'x'.repeat(2000), status: 'approved' }) as LibraryIngredient);
    expect(planBatches(long).map(b => b.length)).toEqual([2, 2, 2]);
    // One item bigger than the limit still goes, on its own
    expect(planBatches([{ ...long[0], profile: 'x'.repeat(9000) }]).map(b => b.length)).toEqual([1]);
  });
});

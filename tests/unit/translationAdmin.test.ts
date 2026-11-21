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

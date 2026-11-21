import { describe, expect, it } from 'vitest';
import { buildPrompt, parseResult, validateInput, MAX_ITEMS } from '../../api/_lib/translate';

const items = [
  { id: 'm1', type: 'misc', name: 'Coriander', texts: { use_for: 'Witbier' } },
  { id: 'h1', type: 'hop', name: 'Saaz' },
];

describe('translation proposals (API)', () => {
  it('accepts at most 50 items with an id, type and name', () => {
    expect(validateInput({ items })).toEqual({ items });
    expect(validateInput({ items: [] })).toHaveProperty('error');
    expect(validateInput({ items: [{ id: 'x', type: 'hop' }] })).toHaveProperty('error');
    expect(validateInput({ items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ id: `i${i}`, type: 'hop', name: 'x' })) })).toHaveProperty('error');
  });

  it('puts the items inside <ITEMS> as untrusted data', () => {
    const p = buildPrompt(items);
    expect(p).toContain('<ITEMS>');
    expect(p).toContain('"Coriander"');
    expect(p).toMatch(/untrusted data/);
  });

  it('keeps only known items, languages and fields from the answer', () => {
    const raw = '```json\n' + JSON.stringify({ items: [
      { id: 'm1', name_kind: 'generic', names: { nl: ' Koriander ', fr: 'Coriandre', de: 'Koriander' }, aliases: ['coriander seed', 'Koriander', 'coriander seed'],
        i18n: { nl: { use_for: 'Witbier', bogus: 'x' }, fr: { use_for: 'Bière blanche' } } },
      { id: 'h1', name_kind: 'product', names: { nl: 'Saaz-hop' }, aliases: ['Žatec'], doubt: 'variety name' },
      { id: 'zz', name_kind: 'generic', names: { nl: 'Onbekend' } },
      { id: 'm1', names: { nl: 'Dubbel' } },
    ] }) + '\n```';
    expect(parseResult(raw, items)).toEqual([
      { id: 'm1', name_kind: 'generic', names: { nl: 'Koriander', fr: 'Coriandre' }, aliases: ['coriander seed'],
        i18n: { nl: { use_for: 'Witbier' }, fr: { use_for: 'Bière blanche' } } },
      { id: 'h1', name_kind: 'product', names: {}, aliases: ['Žatec'], i18n: {}, doubt: 'variety name' },
    ]);
    expect(parseResult('not json', items)).toEqual([]);
  });
});

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

describe('calling Gemini with retries (#215)', () => {
  const noWait = async () => {};
  it('tries the model twice, then the lighter one, on an overloaded model', async () => {
    const { callWithRetry, PRIMARY_MODEL, FALLBACK_MODEL } = await import('../../api/_lib/translate');
    const seen: string[] = [];
    const busy = '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';
    const r = await callWithRetry(async m => { seen.push(m); if (seen.length < 3) throw new Error(busy); return { text: '{"items":[]}' }; }, noWait);
    expect(seen).toEqual([PRIMARY_MODEL, PRIMARY_MODEL, FALLBACK_MODEL]);
    expect(r.model).toBe(FALLBACK_MODEL);
    expect(r.attempts.map(a => a.ok)).toEqual([false, false, true]);
  });

  it('stops at an error that is not worth retrying, and after the last attempt', async () => {
    const { callWithRetry, clientMessage } = await import('../../api/_lib/translate');
    const bad = await callWithRetry(async () => { throw new Error('{"error":{"code":400,"message":"Invalid argument"}}'); }, noWait);
    expect(bad.attempts).toHaveLength(1);
    expect(clientMessage(bad.error!)).toBe('Invalid argument');
    const slow = await callWithRetry(async () => { throw new Error('Timed out after 45 s'); }, noWait);
    expect(slow.attempts).toHaveLength(3);
    expect(slow.answer).toBeUndefined();
  });

  it('reports missing items and a cut-off answer', async () => {
    const { parseWithReport } = await import('../../api/_lib/translate');
    const r = parseWithReport('{"items":[{"id":"m1","name_kind":"generic","names":{"nl":"Koriander"}}', items, 'MAX_TOKENS');
    expect(r.truncated).toBe(true);
    expect(r.jsonError).toBeTruthy();
    expect(r.missingIds).toEqual(['m1', 'h1']);
    const ok = parseWithReport('{"items":[{"id":"m1","name_kind":"generic"}]}', items, 'STOP');
    expect(ok).toMatchObject({ truncated: false, missingIds: ['h1'] });
    expect(ok.jsonError).toBeUndefined();
  });
});

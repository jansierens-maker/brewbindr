import { describe, it, expect } from 'vitest';
import { batchNumbers, daysBetween, ageAtTasting, ageParts, memberName, tasterOf, averageOverall, canEditNote } from '../../services/tasting';
import { BrewLogEntry, TastingNote } from '../../types';

const log = (id: string, recipeId: string, brewDate?: string, bottled?: string) =>
  ({ id, recipeId, date: '2026-01-01', brewDate, status: 'bottled', measurements: {}, bottling: bottled ? { date: bottled } : undefined } as unknown as BrewLogEntry);
const note = (over: Partial<TastingNote>): TastingNote =>
  ({ id: 'n', recipeId: 'r', brewLogId: 'l', date: '2026-07-01', appearance: 0, aroma: 0, flavor: 0, mouthfeel: 0, overall: 0, comments: '', ...over });

describe('batchNumbers', () => {
  it('numbers the brews of each recipe in order of brew date', () => {
    const n = batchNumbers([log('b', 'r1', '2026-05-01'), log('a', 'r1', '2026-03-01'), log('c', 'r2', '2026-04-01'), log('d', 'r1', '2026-09-01')]);
    expect([n.get('a'), n.get('b'), n.get('d'), n.get('c')]).toEqual([1, 2, 3, 1]);
  });
  it('falls back to the creation date when there is no brew date', () => {
    const l1 = { ...log('x', 'r', undefined), date: '2026-02-01' };
    const l2 = log('y', 'r', '2026-01-15');
    expect(batchNumbers([l1, l2]).get('x')).toBe(2);
  });
});

describe('age at tasting', () => {
  it('counts days after bottling', () => {
    expect(daysBetween('2026-06-14', '2026-07-05')).toBe(21);
    expect(ageAtTasting(note({ date: '2026-07-05' }), log('l', 'r', '2026-05-01', '2026-06-14'))).toBe(21);
  });
  it('is unknown without bottling date', () => {
    expect(ageAtTasting(note({}), log('l', 'r', '2026-05-01'))).toBeNull();
    expect(daysBetween('nonsense', '2026-01-01')).toBeNull();
  });
  it('labels days, weeks and months', () => {
    expect(ageParts(5)).toEqual({ value: 5, unit: 'days' });
    expect(ageParts(21)).toEqual({ value: 3, unit: 'weeks' });
    expect(ageParts(120)).toEqual({ value: 4, unit: 'months' });
  });
});

describe('tasters', () => {
  const members = [{ id: 'u1', email: 'jan@example.com', display_name: 'Jan' }, { id: 'u2', email: 'piet@example.com', display_name: null }];
  it('uses the display name, else the e-mail before the @', () => {
    expect(memberName(members[0])).toBe('Jan');
    expect(memberName(members[1])).toBe('piet');
    expect(memberName(undefined)).toBe('');
  });
  it('shows guests by name with who entered them', () => {
    expect(tasterOf(note({ user_id: 'u1', guest_name: ' Jef ' }), members)).toEqual({ key: 'guest:jef', name: 'Jef', guest: true, enteredBy: 'Jan' });
    expect(tasterOf(note({ user_id: 'u2' }), members)).toEqual({ key: 'member:u2', name: 'piet', guest: false });
  });
});

describe('averageOverall', () => {
  it('averages scored notes only', () => {
    expect(averageOverall([note({ overall: 4 }), note({ overall: 5 }), note({ overall: 0 })])).toBe(4.5);
    expect(averageOverall([note({ overall: 0 })])).toBeNull();
  });
});

describe('canEditNote', () => {
  const n = { user_id: 'u2', brewery_id: 'b1' };
  it('lets the writer and brewery admins or brewmasters edit', () => {
    expect(canEditNote(n, { userId: 'u2', breweryId: 'b1', breweryRole: 'taster' })).toBe(true);
    expect(canEditNote(n, { userId: 'u1', breweryId: 'b1', breweryRole: 'brewmaster' })).toBe(true);
    expect(canEditNote(n, { userId: 'u3', breweryId: 'b1', breweryRole: 'brewer' })).toBe(false);
    expect(canEditNote(n, { userId: 'u1', breweryId: 'b2', breweryRole: 'admin' })).toBe(false);
    expect(canEditNote(n, { isAdmin: true })).toBe(true);
  });
});

import { formatDate } from '../../services/tasting';
describe('formatDate', () => {
  it('formats dates per language and leaves other text alone', () => {
    expect(formatDate('2026-06-14', 'nl')).toMatch(/14 jun\.? 2026/);
    expect(formatDate('2026-06-14', 'en')).toBe('14 Jun 2026');
    expect(formatDate('soon', 'en')).toBe('soon');
    expect(formatDate(undefined, 'en')).toBe('');
  });
});

import { findBatches, lastActivity } from '../../services/tasting';
describe('finding a batch to taste', () => {
  const logs = [
    log('t1', 'trip', '2026-01-01', '2026-02-01'),
    log('t2', 'trip', '2026-05-01', '2026-06-01'),
    { ...log('s1', 'saison', '2026-03-01', '2026-04-01'), finished: true },
    { ...log('w1', 'wit', '2026-09-01'), status: 'fermenting' } as BrewLogEntry,
  ];
  const names: Record<string, string> = { t1: 'Tripel – Batch 1', t2: 'Tripel – Batch 2', s1: 'Saison – Batch 1', w1: 'Wit – Batch 1' };
  const label = (l: BrewLogEntry) => names[l.id];
  const notes = [note({ brewLogId: 't1', date: '2026-08-15' })];

  it('takes the latest of bottling and tasting dates', () => {
    expect(lastActivity(logs[0], notes)).toBe('2026-08-15');
    expect(lastActivity(logs[1], notes)).toBe('2026-06-01');
  });
  it('offers bottled, unfinished batches, most recent first', () => {
    expect(findBatches(logs, notes, label, '', false).map(l => l.id)).toEqual(['t1', 't2']);
  });
  it('includes finished batches on request', () => {
    expect(findBatches(logs, notes, label, '', true).map(l => l.id)).toEqual(['t1', 't2', 's1']);
  });
  it('matches every word of the search', () => {
    expect(findBatches(logs, notes, label, 'trip 2', false).map(l => l.id)).toEqual(['t2']);
    expect(findBatches(logs, notes, label, 'SAISON', false)).toEqual([]);
    expect(findBatches(logs, notes, label, 'saison', true).map(l => l.id)).toEqual(['s1']);
  });
});

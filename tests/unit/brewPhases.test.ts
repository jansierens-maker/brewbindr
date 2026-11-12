import { describe, expect, it } from 'vitest';
import { BrewLogEntry } from '../../types';
import { brewsInPhase, daysInPhase, isBottledInPeriod } from '../../services/brewPhases';

const now = new Date('2026-11-12T12:00:00Z');
const log = (id: string, status: BrewLogEntry['status'], date: string, bottled?: string) =>
  ({ id, status, date, brewDate: date, recipeId: 'r', measurements: {}, ...(bottled ? { bottling: { date: bottled } } : {}) }) as unknown as BrewLogEntry;

describe('brew phases (dashboard and Brews tabs)', () => {
  const logs = [
    log('a', 'fermenting', '2026-11-01'),
    log('b', 'fermenting', '2026-11-08'),
    log('c', 'brewing', '2026-11-12'),
    log('d', 'bottled', '2026-09-01', '2026-11-05'),
    log('e', 'bottled', '2026-01-01', '2026-02-01'),
  ];

  it('lists a phase newest first', () => {
    expect(brewsInPhase(logs, 'fermenting', 'month', now).map(l => l.id)).toEqual(['b', 'a']);
    expect(brewsInPhase(logs, 'lagering', 'month', now)).toEqual([]);
  });

  it('bottled: only within the period from the settings', () => {
    expect(brewsInPhase(logs, 'bottled', 'month', now).map(l => l.id)).toEqual(['d']);
    expect(brewsInPhase(logs, 'bottled', 'all', now).map(l => l.id)).toEqual(['d', 'e']);
    expect(isBottledInPeriod(logs[0], 'all', now)).toBe(false);
  });

  it('counts days since brew day, or since bottling', () => {
    expect(daysInPhase(logs[0], now)).toBe(11);
    expect(daysInPhase(logs[3], now)).toBe(7);
  });
});

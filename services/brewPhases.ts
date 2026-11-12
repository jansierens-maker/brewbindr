import { BrewLogEntry } from '../types';

/** The phases of a brew shown as tabs on the dashboard and in Brews. */
export type BrewPhase = 'brewing' | 'fermenting' | 'lagering' | 'bottled';
export const BREW_PHASES: BrewPhase[] = ['brewing', 'fermenting', 'lagering', 'bottled'];

const PERIOD_MS: Record<string, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

/** Bottled within the period from the settings ('week', 'month', 'year' or 'all'). */
export const isBottledInPeriod = (log: BrewLogEntry, period: string | undefined, now: Date = new Date()) => {
  if (log.status !== 'bottled') return false;
  if (period === 'all') return true;
  const date = new Date(log.bottling?.date || log.date);
  return Math.abs(now.getTime() - date.getTime()) <= (PERIOD_MS[period ?? ''] || 0);
};

/** The brews in a phase, newest first. Bottled: only those bottled within the period. */
export const brewsInPhase = (logs: BrewLogEntry[], phase: BrewPhase, period: string | undefined, now: Date = new Date()) =>
  logs
    .filter(l => (phase === 'bottled' ? isBottledInPeriod(l, period, now) : l.status === phase))
    .sort((a, b) => new Date(b.brewDate || b.date).getTime() - new Date(a.brewDate || a.date).getTime());

/** Days since the brew day (bottled: since bottling). */
export const daysInPhase = (log: BrewLogEntry, now: Date = new Date()) => {
  const start = log.status === 'bottled' ? (log.bottling?.date || log.date) : (log.brewDate || log.date);
  return Math.floor((now.getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
};

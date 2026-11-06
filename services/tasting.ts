import { BrewLogEntry, TastingNote } from '../types';

/** A brewery member as needed to show who tasted. */
export interface Taster {
  id: string;
  email?: string | null;
  display_name?: string | null;
}

/** Start date of a brew: the brew day, else when the log was created. */
const brewStart = (log: BrewLogEntry): string => log.brewDate || log.date || '';

/**
 * Batch numbers per recipe: the first brew of a recipe is batch 1, the next batch 2,
 * in order of brew date (ties keep a stable order on id). Returns logId → number.
 */
export const batchNumbers = (logs: BrewLogEntry[]): Map<string, number> => {
  const byRecipe = new Map<string, BrewLogEntry[]>();
  for (const log of logs) {
    const list = byRecipe.get(log.recipeId) || [];
    list.push(log);
    byRecipe.set(log.recipeId, list);
  }
  const result = new Map<string, number>();
  for (const list of byRecipe.values()) {
    [...list]
      .sort((a, b) => brewStart(a).localeCompare(brewStart(b)) || a.id.localeCompare(b.id))
      .forEach((log, i) => result.set(log.id, i + 1));
  }
  return result;
};

/** Whole days from date a to date b (YYYY-MM-DD or ISO), or null when either is missing or invalid. */
export const daysBetween = (a?: string, b?: string): number | null => {
  if (!a || !b) return null;
  const da = Date.parse(a.slice(0, 10));
  const db = Date.parse(b.slice(0, 10));
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86_400_000);
};

/** Age of the beer at a tasting, in days after bottling (null when not known). */
export const ageAtTasting = (note: Pick<TastingNote, 'date'>, log?: BrewLogEntry): number | null =>
  daysBetween(log?.bottling?.date, note.date);

/** Short age label parts: days below 2 weeks, weeks below 3 months, else months. */
export const ageParts = (days: number): { value: number; unit: 'days' | 'weeks' | 'months' } => {
  if (days < 14) return { value: days, unit: 'days' };
  if (days < 91) return { value: Math.round(days / 7), unit: 'weeks' };
  return { value: Math.round(days / 30.44), unit: 'months' };
};

/** Name of a member: their display name, else the part of the e-mail before the @. */
export const memberName = (member?: Taster | null): string => {
  const name = member?.display_name?.trim();
  if (name) return name;
  const email = member?.email || '';
  return email.includes('@') ? email.split('@')[0] : email;
};

/**
 * Who tasted: a guest (entered by a member) or the member who wrote the note.
 * `key` identifies the taster for filtering: guests by their name, members by id.
 */
export const tasterOf = (
  note: TastingNote,
  members: Taster[],
): { key: string; name: string; guest: boolean; enteredBy?: string } => {
  const writer = members.find(m => m.id === note.user_id);
  const guest = note.guest_name?.trim();
  if (guest) {
    return { key: `guest:${guest.toLowerCase()}`, name: guest, guest: true, enteredBy: memberName(writer) || undefined };
  }
  return { key: `member:${note.user_id || ''}`, name: memberName(writer), guest: false };
};

/** Average of the overall scores that were filled in (0 = not scored), rounded to 1 decimal. */
export const averageOverall = (notes: TastingNote[]): number | null => {
  const scores = notes.map(n => n.overall).filter(s => s > 0);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
};

/** Whether this user may change or delete a note. Mirrors the RLS policies on tasting_notes. */
export const canEditNote = (
  note: Pick<TastingNote, 'user_id' | 'brewery_id'>,
  ctx: { userId?: string; breweryId?: string | null; breweryRole?: string | null; isAdmin?: boolean },
): boolean => {
  if (ctx.isAdmin) return true;
  if (!ctx.userId) return false;
  if (note.brewery_id && ctx.breweryId && note.brewery_id !== ctx.breweryId) return false;
  return note.user_id === ctx.userId || ctx.breweryRole === 'admin' || ctx.breweryRole === 'brewmaster';
};

const LOCALES: Record<string, string> = { en: 'en-GB', nl: 'nl-BE', fr: 'fr-BE' };

/** A date (YYYY-MM-DD or ISO) as e.g. "14 Jun 2026"; returns the input when it is not a date. */
export const formatDate = (date: string | undefined, lang: string): string => {
  if (!date) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(LOCALES[lang] || 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "3 weeks after bottling" etc.; `t` is the app's translate function. */
export const ageLabel = (days: number | null, t: (key: any) => string): string => {
  if (days === null) return '';
  if (days < 0) return t('age_before');
  if (days === 0) return t('age_bottling_day');
  if (days === 1) return t('age_day');
  const { value, unit } = ageParts(days);
  const key = unit === 'days' ? 'age_days' : unit === 'weeks' ? 'age_weeks' : 'age_months';
  return t(key).replace('{n}', String(value));
};

/** Latest of bottling date and tasting dates of a batch: what was on the table most recently. */
export const lastActivity = (log: BrewLogEntry, notes: TastingNote[]): string =>
  notes.filter(n => n.brewLogId === log.id).reduce(
    (latest, n) => (n.date > latest ? n.date : latest),
    log.bottling?.date || log.brewDate || log.date || '',
  );

/**
 * Bottled batches to start a tasting note for, most recent activity first.
 * `label(log)` is the text to search in (e.g. "Tripel – Batch 2"); every word of the
 * query must occur in it. Finished batches only with `includeFinished`.
 */
export const findBatches = (
  logs: BrewLogEntry[],
  notes: TastingNote[],
  label: (log: BrewLogEntry) => string,
  query: string,
  includeFinished: boolean,
): BrewLogEntry[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return logs
    .filter(l => l.status === 'bottled' && (includeFinished || !l.finished))
    .filter(l => {
      const text = label(l).toLowerCase();
      return words.every(w => text.includes(w));
    })
    .map(l => ({ l, last: lastActivity(l, notes) }))
    .sort((a, b) => b.last.localeCompare(a.last) || a.l.id.localeCompare(b.l.id))
    .map(x => x.l);
};

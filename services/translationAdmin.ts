import type { LibraryIngredient } from '../types';
import type { Language } from './i18n';
import { ITEM_LANGS, ItemTextField, textFieldsFor } from './itemI18n';
import { supabase } from './supabaseClient';

/** Translation proposals for the public library (#212): what is sent, merged and counted. */

export interface Proposal {
  id: string;
  name_kind: 'generic' | 'product';
  names: Partial<Record<Language, string>>;
  aliases: string[];
  i18n: Partial<Record<Language, Partial<Record<ItemTextField, string>>>>;
  doubt?: string;
}


/** The types the translation tool covers. */
export const TRANSLATABLE_TYPES = ['fermentable', 'hop', 'culture', 'misc', 'style', 'water', 'mash_profile', 'equipment'];

/** What Gemini gets per item: names and the descriptions that exist. */
export const toInput = (i: LibraryIngredient) => {
  const texts: Partial<Record<ItemTextField, string>> = {};
  for (const f of textFieldsFor(i.type)) if (i[f]) texts[f] = i[f]!;
  return {
    id: i.id, type: i.type, name: i.name,
    ...(i.name_kind ? { name_kind: i.name_kind } : {}),
    ...(i.names ? { names: i.names } : {}),
    ...(i.aliases?.length ? { aliases: i.aliases } : {}),
    ...(Object.keys(texts).length ? { texts } : {}),
    ...(i.i18n ? { i18n: i.i18n } : {}),
  };
};

/**
 * The item with a proposal filled in where it has nothing yet: existing names and texts stay,
 * aliases are added, and the kind of name is the proposal's unless the item already has one.
 */
export const applyProposal = (item: LibraryIngredient, p: Proposal): LibraryIngredient => {
  const name_kind = item.name_kind ?? p.name_kind;
  const names = name_kind === 'product' ? item.names : { ...p.names, ...strip(item.names) };
  const aliases = [...new Set([...(item.aliases ?? []), ...p.aliases])];
  const i18n: LibraryIngredient['i18n'] = {};
  for (const l of ITEM_LANGS) {
    const merged = { ...p.i18n[l], ...strip(item.i18n?.[l]) };
    if (Object.keys(merged).length) i18n[l] = merged;
  }
  return {
    ...item, name_kind,
    ...(names && Object.keys(names).length ? { names } : {}),
    ...(aliases.length ? { aliases } : {}),
    ...(Object.keys(i18n).length ? { i18n } : {}),
  };
};

/** Leaves out empty strings so they do not hide a proposal. */
const strip = <T extends object>(o: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())) as Partial<T>;

/** At most this many items per request, and this much text (characters of what is sent). */
export const MAX_BATCH_ITEMS = 15;
export const MAX_BATCH_CHARS = 5000;
/** The browser waits this long for one request (the server tries up to three times, 45 s each). */
export const CLIENT_TIMEOUT_MS = 160000;

/**
 * Groups items so every request stays small: few items, or fewer when they carry long
 * descriptions (styles), so Gemini answers quickly and does not cut its answer off.
 */
export const planBatches = (items: LibraryIngredient[], maxItems = MAX_BATCH_ITEMS, maxChars = MAX_BATCH_CHARS): LibraryIngredient[][] => {
  const batches: LibraryIngredient[][] = [];
  let current: LibraryIngredient[] = [];
  let chars = 0;
  for (const item of items) {
    const size = JSON.stringify(toInput(item)).length;
    if (current.length && (current.length >= maxItems || chars + size > maxChars)) { batches.push(current); current = []; chars = 0; }
    current.push(item);
    chars += size;
  }
  if (current.length) batches.push(current);
  return batches;
};

/** One request, as the debug log shows it. */
export interface RequestLog {
  batch: number;
  batches: number;
  items: { id: string; name: string }[];
  chars: number;
  startedAt: string;
  durationMs?: number;
  status?: number;
  model?: string;
  error?: string;
  warning?: string;
  /** What the server reports in debug mode: attempts, tokens, prompt, raw answer */
  debug?: Record<string, unknown>;
}

/**
 * Asks for proposals batch by batch; reports progress and every request; stops at the first
 * error, at the time limit, or when `stop` is aborted. What came back before stays.
 */
export const requestProposals = async (
  items: LibraryIngredient[],
  opts: {
    debug?: boolean;
    stop?: AbortSignal;
    onProgress?: (batch: number, batches: number, done: number, total: number) => void;
    onLog?: (entry: RequestLog) => void;
    /** The proposals of each batch as soon as it is in */
    onProposals?: (proposals: Proposal[]) => void;
  } = {},
): Promise<{ proposals: Proposal[]; warnings: string[]; error?: string; stopped?: boolean }> => {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  const batches = planBatches(items);
  const proposals: Proposal[] = [];
  const warnings: string[] = [];
  let done = 0;
  for (let b = 0; b < batches.length; b++) {
    if (opts.stop?.aborted) return { proposals, warnings, stopped: true };
    const batch = batches[b];
    const body = JSON.stringify({ items: batch.map(toInput), ...(opts.debug ? { debug: true } : {}) });
    const entry: RequestLog = { batch: b + 1, batches: batches.length, items: batch.map(i => ({ id: i.id, name: i.name })), chars: body.length, startedAt: new Date().toISOString() };
    opts.onProgress?.(b + 1, batches.length, done, items.length);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), CLIENT_TIMEOUT_MS);
    const onStop = () => controller.abort('stopped');
    opts.stop?.addEventListener('abort', onStop);
    try {
      const res = await fetch('/api/translate-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      Object.assign(entry, { durationMs: Date.now() - started, status: res.status, model: json.model, warning: json.warning, debug: json.debug });
      if (!res.ok) {
        entry.error = json.error || `HTTP ${res.status}`;
        opts.onLog?.(entry);
        return { proposals, warnings, error: entry.error };
      }
      opts.onLog?.(entry);
      const got = (json.items ?? []) as Proposal[];
      proposals.push(...got);
      opts.onProposals?.(got);
      if (json.warning) warnings.push(`${b + 1}/${batches.length}: ${json.warning}`);
      done += batch.length;
    } catch (e) {
      const reason = controller.signal.reason;
      entry.durationMs = Date.now() - started;
      entry.error = reason === 'stopped' ? 'Stopped' : reason === 'timeout' ? `No answer after ${CLIENT_TIMEOUT_MS / 1000} s` : (e as Error).message;
      opts.onLog?.(entry);
      return reason === 'stopped' ? { proposals, warnings, stopped: true } : { proposals, warnings, error: entry.error };
    } finally {
      clearTimeout(timer);
      opts.stop?.removeEventListener('abort', onStop);
    }
    opts.onProgress?.(b + 1, batches.length, done, items.length);
  }
  return { proposals, warnings };
};

export interface Coverage {
  type: string;
  total: number;
  /** Items whose name still needs a translation (product names excluded), per language */
  namesMissing: Record<Language, number>;
  /** Items with a description that still lacks a translation, per language */
  textsMissing: Record<Language, number>;
}

/** Per type: how many items still miss a name or a description per language. */
export const coverage = (items: LibraryIngredient[]): Coverage[] =>
  TRANSLATABLE_TYPES.map(type => {
    const list = items.filter(i => i.type === type);
    const zero = () => ({ nl: 0, fr: 0, en: 0 } as Record<Language, number>);
    const namesMissing = zero(), textsMissing = zero();
    for (const i of list) {
      for (const l of ITEM_LANGS) {
        if (i.name_kind !== 'product' && !i.names?.[l]?.trim()) namesMissing[l] += 1;
        if (textFieldsFor(type).some(f => (i[f] || ITEM_LANGS.some(x => i.i18n?.[x]?.[f])) && !i.i18n?.[l]?.[f]?.trim())) textsMissing[l] += 1;
      }
    }
    return { type, total: list.length, namesMissing, textsMissing };
  }).filter(c => c.total > 0);

/** Items that still need work for a language: a name (unless a product name) or a description. */
export const needsTranslation = (i: LibraryIngredient, lang: Language | 'any', what: 'name' | 'text' | 'any'): boolean => {
  const langs = lang === 'any' ? ITEM_LANGS : [lang];
  const name = i.name_kind !== 'product' && langs.some(l => !i.names?.[l]?.trim());
  const text = textFieldsFor(i.type).some(f => (i[f] || ITEM_LANGS.some(x => i.i18n?.[x]?.[f])) && langs.some(l => !i.i18n?.[l]?.[f]?.trim()));
  return what === 'name' ? name : what === 'text' ? text : name || text;
};

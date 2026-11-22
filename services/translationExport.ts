import type { LibraryIngredient } from '../types';
import type { Language } from './i18n';
import { ITEM_LANGS, ITEM_TEXT_FIELDS, ItemTextField, textFieldsFor } from './itemI18n';
import type { Proposal } from './translationAdmin';

/**
 * Translating outside the app (#212): export the items to translate as CSV (spreadsheet) or
 * JSON, fill them in elsewhere, import the file back into the review table.
 */

const ALIAS_SEP = ' | ';

/** The text fields that occur in these items, in a fixed order. */
const usedFields = (items: LibraryIngredient[]): ItemTextField[] =>
  ITEM_TEXT_FIELDS.filter(f => items.some(i => textFieldsFor(i.type).includes(f) && (i[f] || ITEM_LANGS.some(l => i.i18n?.[l]?.[f]))));

/** Columns: id, type, name, kind of name, name per language, aliases, then per description the original and each language. */
export const exportColumns = (items: LibraryIngredient[]): string[] => [
  'id', 'type', 'name', 'name_kind', ...ITEM_LANGS.map(l => `name_${l}`), 'aliases',
  ...usedFields(items).flatMap(f => [f, ...ITEM_LANGS.map(l => `${f}_${l}`)]),
];

export const exportRows = (items: LibraryIngredient[]): Record<string, string>[] => {
  const cols = exportColumns(items);
  return items.map(i => {
    const row: Record<string, string> = {
      id: i.id, type: i.type, name: i.name, name_kind: i.name_kind ?? '',
      aliases: (i.aliases ?? []).join(ALIAS_SEP),
    };
    for (const l of ITEM_LANGS) row[`name_${l}`] = i.names?.[l] ?? '';
    for (const f of ITEM_TEXT_FIELDS) {
      if (!cols.includes(f)) continue;
      row[f] = i[f] ?? '';
      for (const l of ITEM_LANGS) row[`${f}_${l}`] = i.i18n?.[l]?.[f] ?? '';
    }
    return row;
  });
};

const quote = (v: string, sep: string) => (/["\r\n]/.test(v) || v.includes(sep) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV with a byte order mark (Excel then reads UTF-8) and ";" (Excel in Belgium and the Netherlands). */
export const toCsv = (items: LibraryIngredient[], sep = ';'): string => {
  const cols = exportColumns(items);
  const lines = [cols.join(sep), ...exportRows(items).map(r => cols.map(c => quote(r[c] ?? '', sep)).join(sep))];
  return '﻿' + lines.join('\r\n') + '\r\n';
};

/** JSON in the same shape the app sends to Gemini, with the translations filled in so far. */
export const toJson = (items: LibraryIngredient[]): string => JSON.stringify({
  format: 'brewbindr-translations',
  version: 1,
  instructions: 'Fill in name_kind ("generic" or "product"), names (nl, fr, en; none for a product name), aliases and the descriptions per language in i18n. Keep the ids.',
  items: items.map(i => {
    const texts: Partial<Record<ItemTextField, string>> = {};
    for (const f of textFieldsFor(i.type)) if (i[f]) texts[f] = i[f]!;
    return {
      id: i.id, type: i.type, name: i.name, name_kind: i.name_kind ?? '',
      names: { nl: i.names?.nl ?? '', fr: i.names?.fr ?? '', en: i.names?.en ?? '' },
      aliases: i.aliases ?? [],
      ...(Object.keys(texts).length ? { texts } : {}),
      i18n: Object.fromEntries(ITEM_LANGS.map(l => [l, Object.fromEntries(Object.keys(texts).map(f => [f, i.i18n?.[l]?.[f as ItemTextField] ?? '']))])),
    };
  }),
}, null, 2);

/** Parses CSV (RFC 4180: quotes, doubled quotes, line breaks in cells); the separator is ";", "," or a tab, taken from the header. */
export const parseCsv = (text: string): Record<string, string>[] => {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].map(s => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(c => c.trim()));
  if (!head) return [];
  const cols = head.map(h => h.trim());
  return body.map(r => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])));
};

export type ImportedProposal = Proposal & { kindSet?: boolean };

export interface ImportResult {
  proposals: ImportedProposal[];
  /** Ids in the file that are not public items of the library */
  unknown: string[];
  error?: string;
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Reads an exported file back (CSV or JSON) as proposals for the review table. Only ids of the
 * given items count; empty cells mean "no change".
 */
export const importTranslations = (text: string, fileName: string, items: LibraryIngredient[]): ImportResult => {
  const known = new Map(items.map(i => [i.id, i]));
  const proposals: ImportedProposal[] = [];
  const unknown: string[] = [];
  const add = (id: string, kind: string, names: Partial<Record<Language, string>>, aliases: string[], i18n: Proposal['i18n']) => {
    if (!known.has(id)) { if (id) unknown.push(id); return; }
    const imported: ImportedProposal = {
      id, name_kind: kind === 'product' ? 'product' : 'generic',
      names: Object.fromEntries(Object.entries(names).filter(([, v]) => v)) as Proposal['names'],
      aliases: [...new Set(aliases.filter(Boolean))],
      i18n,
      // Whether the file sets the kind of name (else the item's own kind stays)
      kindSet: kind === 'product' || kind === 'generic',
    };
    proposals.push(imported);
  };

  const isJson = /\.json$/i.test(fileName) || /^\s*[[{]/.test(text);
  if (isJson) {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (e) { return { proposals, unknown, error: `JSON: ${(e as Error).message}` }; }
    const list = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
    if (!Array.isArray(list)) return { proposals, unknown, error: 'JSON: no "items" list' };
    for (const r of list as Record<string, any>[]) {
      const names: Partial<Record<Language, string>> = {};
      for (const l of ITEM_LANGS) { const v = clean(r?.names?.[l], 100); if (v) names[l] = v; }
      const i18n: Proposal['i18n'] = {};
      for (const l of ITEM_LANGS) for (const f of ITEM_TEXT_FIELDS) { const v = clean(r?.i18n?.[l]?.[f], 2000); if (v) (i18n[l] ??= {})[f] = v; }
      add(clean(r?.id, 100), clean(r?.name_kind, 10), names, Array.isArray(r?.aliases) ? r.aliases.map((a: unknown) => clean(a, 100)) : [], i18n);
    }
  } else {
    const rows = parseCsv(text);
    if (!rows.length || !('id' in rows[0])) return { proposals, unknown, error: 'CSV: no "id" column' };
    for (const r of rows) {
      const names: Partial<Record<Language, string>> = {};
      for (const l of ITEM_LANGS) { const v = clean(r[`name_${l}`], 100); if (v) names[l] = v; }
      const i18n: Proposal['i18n'] = {};
      for (const l of ITEM_LANGS) for (const f of ITEM_TEXT_FIELDS) { const v = clean(r[`${f}_${l}`], 2000); if (v) (i18n[l] ??= {})[f] = v; }
      add(clean(r.id, 100), clean(r.name_kind, 10), names, (r.aliases ?? '').split(/\s*\|\s*/).map(a => clean(a, 100)), i18n);
    }
  }
  return { proposals, unknown };
};

/** The item with an imported row: filled cells replace what is there, empty cells change nothing. */
export const applyImported = (item: LibraryIngredient, p: ImportedProposal): LibraryIngredient => {
  const name_kind = p.kindSet ? p.name_kind : item.name_kind;
  const names = { ...item.names, ...p.names };
  const i18n: LibraryIngredient['i18n'] = { ...item.i18n };
  for (const l of ITEM_LANGS) if (p.i18n[l]) i18n[l] = { ...item.i18n?.[l], ...p.i18n[l] };
  const aliases = [...new Set([...(item.aliases ?? []), ...p.aliases])];
  return {
    ...item,
    ...(name_kind ? { name_kind } : {}),
    ...(name_kind !== 'product' && Object.keys(names).length ? { names } : {}),
    ...(Object.keys(i18n).length ? { i18n } : {}),
    ...(aliases.length ? { aliases } : {}),
  };
};

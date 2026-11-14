import { nameKey } from './duplicates';

/**
 * Brewery backup (brewery admin): the brewery's own rows, as stored in the database.
 * Restore merges into the current brewery: same id → overwritten, otherwise added, nothing deleted.
 * Into another brewery every row gets a new id (the same one each time, so restoring twice does not
 * duplicate), an item whose name the brewery already uses is merged into that item, and every
 * reference (recipe of a brew, brew of a tasting note, ingredients, water, installation) follows.
 */

export const STATUS_TABLES = ['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'] as const;
export const DATA_TABLES = [...STATUS_TABLES, 'brew_logs', 'tasting_notes'] as const;
export type DataTable = typeof DATA_TABLES[number];

export interface BackupRow { id: string; data: Record<string, unknown>; status?: string }
export interface StockBackupRow { ingredient_type: string; ingredient_id: string; amount: number; unit: string; target: number | null }

export interface BreweryBackup {
  format: 'brewbindr-brewery-backup';
  version: 2;
  exported_at: string;
  brewery: { id: string; name: string };
  tables: Partial<Record<DataTable, BackupRow[]>> & { stock?: StockBackupRow[] };
}

export interface ExistingRow { id: string; name?: string; status?: string }

export type RestoreCounts = Partial<Record<DataTable | 'stock', { added: number; updated: number }>>;

export interface RestorePlan {
  tables: Partial<Record<DataTable, BackupRow[]>> & { stock: StockBackupRow[] };
  counts: RestoreCounts;
  /** Rows left out because the brewery's item with that id is public now */
  skippedPublic: number;
  sameBrewery: boolean;
}

export const isBreweryBackup = (x: unknown): x is BreweryBackup =>
  !!x && typeof x === 'object' && (x as BreweryBackup).format === 'brewbindr-brewery-backup' &&
  typeof (x as BreweryBackup).tables === 'object' && !!(x as BreweryBackup).brewery?.id;

export const makeBreweryBackup = (
  brewery: { id: string; name: string },
  tables: BreweryBackup['tables'],
  now: Date = new Date(),
): BreweryBackup => ({ format: 'brewbindr-brewery-backup', version: 2, exported_at: now.toISOString(), brewery, tables });

/** Same input, same id: a UUID made from SHA-256 of the target brewery and the old id. */
export const derivedId = async (targetBreweryId: string, oldId: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${targetBreweryId}:${oldId}`)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5-style
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/** Replaces every string that is an old id by its new id, anywhere in the data. */
export const remapIds = <T>(value: T, map: Map<string, string>): T => {
  if (typeof value === 'string') return (map.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map(v => remapIds(v, map)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapIds(v, map)])) as T;
  }
  return value;
};

const rowName = (r: BackupRow) => (typeof r.data?.name === 'string' ? (r.data.name as string) : '');

/**
 * The rows to write for a restore into `targetBreweryId`, given the brewery's existing rows
 * (id, name, status) per table, and what will be added or overwritten.
 */
export const planBreweryRestore = async (
  backup: BreweryBackup,
  targetBreweryId: string,
  existing: Partial<Record<DataTable, ExistingRow[]>>,
): Promise<RestorePlan> => {
  const sameBrewery = backup.brewery.id === targetBreweryId;
  const idMap = new Map<string, string>();
  const counts: RestoreCounts = {};
  let skippedPublic = 0;

  // 1. New ids: kept in the same brewery, derived in another; a name in use → that item
  for (const table of DATA_TABLES) {
    const have = existing[table] ?? [];
    const byId = new Map(have.map(r => [r.id, r]));
    const byName = new Map(have.filter(r => r.status !== 'approved' && r.name).map(r => [nameKey(r.name), r]));
    for (const row of backup.tables[table] ?? []) {
      let id = sameBrewery ? row.id : await derivedId(targetBreweryId, row.id);
      if (!byId.has(id) && (STATUS_TABLES as readonly string[]).includes(table)) {
        const sameName = byName.get(nameKey(rowName(row)));
        if (sameName && rowName(row)) id = sameName.id;
      }
      idMap.set(row.id, id);
    }
  }

  // 2. The rows with their new ids and references
  const tables: RestorePlan['tables'] = { stock: [] };
  for (const table of DATA_TABLES) {
    const have = new Map((existing[table] ?? []).map(r => [r.id, r]));
    const out: BackupRow[] = [];
    let added = 0, updated = 0;
    const seen = new Set<string>();
    for (const row of backup.tables[table] ?? []) {
      const id = idMap.get(row.id)!;
      if (seen.has(id)) continue; // two backup rows merged into one item
      seen.add(id);
      const current = have.get(id);
      if (current?.status === 'approved') { skippedPublic++; continue; }
      const data = remapIds(row.data, idMap);
      if ('id' in data) data.id = id;
      out.push({ id, data, ...(row.status !== undefined ? { status: row.status === 'submitted' ? 'submitted' : 'private' } : {}) });
      if (current) updated++; else added++;
    }
    if (out.length) { tables[table] = out; counts[table] = { added, updated }; }
  }

  // 3. Stock of the restored ingredients
  const restored = new Set(Object.values(tables).flatMap(rows => (rows as BackupRow[]).map(r => r.id)));
  tables.stock = (backup.tables.stock ?? [])
    .map(s => ({ ...s, ingredient_id: idMap.get(s.ingredient_id) ?? s.ingredient_id }))
    .filter(s => restored.has(s.ingredient_id));
  if (tables.stock.length) counts.stock = { added: tables.stock.length, updated: 0 };

  return { tables, counts, skippedPublic, sameBrewery };
};

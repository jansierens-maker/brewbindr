import { supabase } from './supabaseClient';
import { BackupRow, BreweryBackup, DATA_TABLES, DataTable, ExistingRow, RestorePlan, STATUS_TABLES, StockBackupRow, makeBreweryBackup } from './backup';

const isStatusTable = (t: DataTable) => (STATUS_TABLES as readonly string[]).includes(t);

/** The brewery's own rows (not its public items), straight from the database. */
const fetchBreweryRows = async (breweryId: string) => {
  if (!supabase) throw new Error('Supabase not configured');
  const client = supabase;
  const tables: Partial<Record<DataTable, (BackupRow & { status?: string })[]>> = {};
  await Promise.all(DATA_TABLES.map(async t => {
    const { data, error } = await client.from(t).select(isStatusTable(t) ? 'id, data, status' : 'id, data').eq('brewery_id', breweryId);
    if (error) throw error;
    tables[t] = (data ?? []) as unknown as BackupRow[];
  }));
  const { data: stock, error } = await client.from('stock').select('ingredient_type, ingredient_id, amount, unit, target').eq('brewery_id', breweryId);
  if (error) throw error;
  return { tables, stock: (stock ?? []).map(s => ({ ...s, amount: Number(s.amount), target: s.target === null ? null : Number(s.target) })) as StockBackupRow[] };
};

export const backupService = {
  /** Backup of the brewery: its own recipes, brews, tasting notes, library items and stock. */
  async breweryBackup(brewery: { id: string; name: string }): Promise<BreweryBackup> {
    const { tables, stock } = await fetchBreweryRows(brewery.id);
    const own = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, (rows ?? []).filter(r => r.status !== 'approved')]));
    return makeBreweryBackup(brewery, { ...own, stock });
  },

  /** The brewery's rows (id, name, status), to plan a restore. */
  async existingRows(breweryId: string): Promise<Partial<Record<DataTable, ExistingRow[]>>> {
    const { tables } = await fetchBreweryRows(breweryId);
    return Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, (rows ?? []).map(r => ({
      id: r.id, status: r.status, name: typeof r.data?.name === 'string' ? (r.data.name as string) : undefined,
    }))]));
  },

  /** Writes a planned restore in one transaction (brewery admin). */
  async restoreBrewery(plan: RestorePlan) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('restore_brewery_backup', { p_tables: plan.tables });
    if (error) throw error;
    return data as Record<string, number>;
  },

  /** Everything in BrewBindr (app admin). */
  async fullBackup(): Promise<Record<string, unknown>> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('admin_full_backup');
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  /** Restores a full backup (app admin); with dryRun only what would be added or overwritten. */
  async fullRestore(backup: unknown, dryRun: boolean): Promise<Record<string, { added: number; updated: number; skipped?: number }>> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.rpc('admin_full_restore', { p_backup: backup, p_dry_run: dryRun });
    if (error) throw error;
    return data as Record<string, { added: number; updated: number; skipped?: number }>;
  },
};

/** Saves JSON as a file. */
export const downloadJson = (value: unknown, fileName: string) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

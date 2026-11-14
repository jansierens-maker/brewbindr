import React, { useState } from 'react';
import { useTranslation } from '../App';
import { BreweryBackup, RestorePlan, isBreweryBackup, planBreweryRestore } from '../services/backup';
import { backupService, downloadJson } from '../services/backupService';
import { formatDate } from '../services/tasting';

interface Props {
  /** 'brewery': the brewery admin's own brewery; 'full': everything (app admin) */
  mode: 'brewery' | 'full';
  brewery?: { id: string; name: string };
}

type Counts = Record<string, { added: number; updated: number; skipped?: number }>;
interface Pending { counts: Counts; from: string; date: string; otherBrewery: boolean; skippedPublic: number; run: () => Promise<void> }

const CATEGORY_KEYS: Record<string, string> = {
  breweries: 'backup_cat_breweries', profiles: 'backup_cat_profiles', recipes: 'backup_cat_recipes', brew_logs: 'backup_cat_brews',
  tasting_notes: 'backup_cat_tasting', fermentables: 'backup_cat_fermentables', hops: 'backup_cat_hops', cultures: 'backup_cat_cultures',
  miscs: 'backup_cat_miscs', styles: 'backup_cat_styles', mash_profiles: 'backup_cat_mash', equipment: 'backup_cat_equipment',
  waters: 'backup_cat_waters', stock: 'backup_cat_stock',
};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brewery';
const today = () => new Date().toISOString().slice(0, 10);

/** Backup and restore: download as JSON, restore by merging after a confirmation. */
const BackupRestore: React.FC<Props> = ({ mode, brewery }) => {
  const { t, lang } = useTranslation();
  const tr = (k: string) => t(k as any);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const inputId = `backup-restore-${mode}`;

  const download = async () => {
    setBusy(true);
    try {
      if (mode === 'brewery' && brewery) downloadJson(await backupService.breweryBackup(brewery), `brewbindr-${slug(brewery.name)}-${today()}.json`);
      else downloadJson(await backupService.fullBackup(), `brewbindr-full-${today()}.json`);
    } catch (err: any) {
      alert(`${tr('backup_failed')}: ${err?.message || ''}`);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      let json: any;
      try { json = JSON.parse(await file.text()); } catch { alert(tr('backup_invalid')); return; }

      if (mode === 'brewery') {
        if (!isBreweryBackup(json)) { alert(tr(json?.format === 'brewbindr-full-backup' ? 'backup_is_full' : 'backup_not_brewery')); return; }
        const backup = json as BreweryBackup;
        const plan: RestorePlan = await planBreweryRestore(backup, brewery!.id, await backupService.existingRows(brewery!.id));
        setPending({
          counts: plan.counts as Counts, from: backup.brewery.name, date: backup.exported_at,
          otherBrewery: !plan.sameBrewery, skippedPublic: plan.skippedPublic,
          run: async () => { await backupService.restoreBrewery(plan); },
        });
      } else {
        if (json?.format !== 'brewbindr-full-backup') { alert(tr(isBreweryBackup(json) ? 'backup_is_brewery' : 'backup_not_full')); return; }
        const counts = await backupService.fullRestore(json, true);
        setPending({
          counts, from: 'BrewBindr', date: json.exported_at, otherBrewery: false, skippedPublic: 0,
          run: async () => { await backupService.fullRestore(json, false); },
        });
      }
    } catch (err: any) {
      alert(`${tr('backup_failed')}: ${err?.message || ''}`);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
      alert(tr('backup_restored'));
      // Load everything again from the database
      window.location.reload();
    } catch (err: any) {
      alert(`${tr('backup_failed')}: ${err?.message || ''}`);
      setBusy(false);
    }
  };

  const rows = pending ? Object.entries(pending.counts).filter(([, c]) => c && (c.added || c.updated || c.skipped)) : [];

  return (
    <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-stone-100 p-3 rounded-2xl text-stone-600"><i className="fas fa-database text-2xl" aria-hidden="true"></i></div>
        <div>
          <h3 className="text-2xl font-black text-stone-900">{tr(mode === 'brewery' ? 'backup_brewery_title' : 'backup_full_title')}</h3>
          <p className="text-xs text-stone-500">{tr(mode === 'brewery' ? 'backup_brewery_desc' : 'backup_full_desc')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" onClick={download} disabled={busy}
          className="py-4 bg-stone-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black disabled:opacity-50">
          <i className="fas fa-download mr-2" aria-hidden="true"></i>{tr('backup_download')}
        </button>
        <label htmlFor={inputId} className={`py-4 text-center bg-stone-100 text-stone-800 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-stone-200 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <i className="fas fa-upload mr-2" aria-hidden="true"></i>{tr('backup_restore')}
        </label>
        <input id={inputId} name={`backup_restore_${mode}`} type="file" accept=".json,application/json" className="hidden" onChange={chooseFile} disabled={busy} />
      </div>

      {pending && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`} className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 id={`${inputId}-title`} className="text-2xl font-black text-stone-900">{tr('backup_confirm_title')}</h3>
            <p className="text-sm text-stone-600">
              {tr('backup_confirm_from').replace('{name}', pending.from).replace('{date}', pending.date ? formatDate(pending.date.slice(0, 10), lang) : '-')}
            </p>
            {pending.otherBrewery && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{tr('backup_other_brewery')}</p>}
            {rows.length === 0 ? <p className="text-sm text-stone-500">{tr('backup_nothing')}</p> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-stone-400">
                    <th className="py-1"></th><th className="py-1 text-right">{tr('backup_added')}</th><th className="py-1 text-right">{tr('backup_updated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([k, c]) => (
                    <tr key={k} className="border-t border-stone-100">
                      <td className="py-1.5 font-bold text-stone-800">{tr(CATEGORY_KEYS[k] ?? k)}</td>
                      <td className="py-1.5 text-right">{c.added}</td>
                      <td className="py-1.5 text-right">{c.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pending.skippedPublic > 0 && <p className="text-xs text-stone-500">{tr('backup_skipped_public').replace('{n}', String(pending.skippedPublic))}</p>}
            {mode === 'full' && (pending.counts.profiles?.skipped ?? 0) > 0 && <p className="text-xs text-stone-500">{tr('backup_missing_accounts').replace('{n}', String(pending.counts.profiles!.skipped))}</p>}
            <p className="text-sm font-bold text-stone-700">{tr('backup_merge_note')}</p>
            <div className="flex gap-3">
              <button type="button" onClick={confirm} disabled={busy} className="flex-[2] py-3 bg-amber-600 text-white rounded-xl font-black text-sm uppercase tracking-widest disabled:opacity-50">
                {busy ? '…' : tr('backup_confirm_btn')}
              </button>
              <button type="button" onClick={() => setPending(null)} disabled={busy} className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-black text-xs uppercase tracking-widest">{tr('cancel_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupRestore;

import React, { useCallback, useEffect, useState } from 'react';
import { AdminBrewery } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { breweryService } from '../services/breweryService';
import { formatDate } from '../services/tasting';

const ERROR_KEYS = { own_brewery: 'admin_brewery_own', name_mismatch: 'admin_brewery_name_mismatch', has_app_admin: 'admin_brewery_has_admin' } as const;

/** Admin → Breweries: every brewery, and deleting one with everything under it (app admin only). */
const AdminBreweries: React.FC = () => {
  const { t, lang } = useTranslation();
  const { profile } = useUser();
  const [breweries, setBreweries] = useState<AdminBrewery[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [toDelete, setToDelete] = useState<AdminBrewery | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setBreweries(await breweryService.listAllBreweries());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const close = () => { setToDelete(null); setConfirmName(''); };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const result = await breweryService.deleteBrewery(toDelete.id, confirmName);
      const items = Object.values(result.deleted || {}).reduce((s, n) => s + n, 0);
      alert(t('admin_brewery_deleted')
        .replace('{name}', result.brewery)
        .replace('{members}', String(result.members))
        .replace('{items}', String(items))
        .replace('{kept}', String(result.kept_public)));
      close();
      await load();
    } catch (err: any) {
      const key = ERROR_KEYS[err?.hint as keyof typeof ERROR_KEYS];
      alert(key ? t(key) : `${t('delete_failed')}: ${err?.message || ''}`);
    } finally {
      setDeleting(false);
    }
  };

  const date = (d: string | null) => (d ? formatDate(d.slice(0, 10), lang) : '-');
  const nameMatches = !!toDelete && confirmName.trim() === toDelete.name.trim();

  return (
    <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-stone-100 p-3 rounded-2xl text-stone-600"><i className="fas fa-industry text-2xl" aria-hidden="true"></i></div>
        <div>
          <h3 className="text-2xl font-black text-stone-900">{t('admin_breweries_title')}</h3>
          <p className="text-xs text-stone-500">{t('admin_breweries_desc')}</p>
        </div>
      </div>

      {loadError && <p className="text-sm text-red-600 font-bold">{t('admin_breweries_load_failed')}</p>}
      {!breweries && !loadError && <p className="text-sm text-stone-400">…</p>}
      {breweries && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-stone-400 border-b border-stone-100">
                <th className="py-2 pr-4">{t('name_label')}</th>
                <th className="py-2 pr-4">{t('admin_brewery_admins')}</th>
                <th className="py-2 pr-4 text-right">{t('admin_brewery_members')}</th>
                <th className="py-2 pr-4 text-right">{t('nav_recipes')}</th>
                <th className="py-2 pr-4 text-right">{t('nav_brews')}</th>
                <th className="py-2 pr-4">{t('admin_brewery_created')}</th>
                <th className="py-2 pr-4">{t('admin_brewery_last_sign_in')}</th>
                <th className="py-2"><span className="sr-only">{t('delete_btn')}</span></th>
              </tr>
            </thead>
            <tbody>
              {breweries.map(b => {
                const own = b.id === profile?.brewery_id;
                return (
                  <tr key={b.id} className="border-b border-stone-50 align-top">
                    <td className="py-3 pr-4 font-bold text-stone-900">{b.name}{own && <span className="ml-2 text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase">{t('admin_brewery_yours')}</span>}</td>
                    <td className="py-3 pr-4 text-stone-600 break-all">{b.admins.join(', ') || '-'}</td>
                    <td className="py-3 pr-4 text-right">{b.member_count}</td>
                    <td className="py-3 pr-4 text-right">{b.recipe_count}</td>
                    <td className="py-3 pr-4 text-right">{b.brew_count}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{date(b.created_at)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{date(b.last_sign_in)}</td>
                    <td className="py-3 text-right">
                      {!own && (
                        <button type="button" onClick={() => setToDelete(b)} aria-label={`${t('delete_btn')}: ${b.name}`} title={t('delete_btn')}
                          className="text-stone-400 hover:text-red-600 px-2"><i className="fas fa-trash-alt" aria-hidden="true"></i></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-brewery-title" className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-4">
            <h3 id="delete-brewery-title" className="text-2xl font-black text-stone-900">{t('admin_brewery_delete_title').replace('{name}', toDelete.name)}</h3>
            <p className="text-sm text-stone-600">
              {t('admin_brewery_delete_what')
                .replace('{members}', String(toDelete.member_count))
                .replace('{recipes}', String(toDelete.recipe_count))
                .replace('{brews}', String(toDelete.brew_count))}
            </p>
            <p className="text-sm text-stone-600">{t('admin_brewery_delete_kept')}</p>
            <p className="text-sm font-bold text-red-700">{t('admin_brewery_delete_irreversible')}</p>
            <div>
              <label htmlFor="delete-brewery-confirm" className="block text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">
                {t('admin_brewery_delete_confirm')} <span className="normal-case tracking-normal text-sm text-stone-900 font-bold">{toDelete.name}</span>
              </label>
              <input id="delete-brewery-confirm" name="delete_brewery_confirm" maxLength={200} autoComplete="off"
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold"
                value={confirmName} onChange={e => setConfirmName(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={remove} disabled={!nameMatches || deleting}
                className="flex-[2] py-3 bg-red-600 text-white rounded-xl font-black text-sm uppercase tracking-widest disabled:opacity-40">
                {deleting ? '…' : t('admin_brewery_delete_btn')}
              </button>
              <button type="button" onClick={close} className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-black text-xs uppercase tracking-widest">{t('cancel_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBreweries;

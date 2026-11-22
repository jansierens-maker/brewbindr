import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { supabase, getSupabaseConfigInfo } from '../services/supabaseClient';
import { supabaseService } from '../services/supabaseService';

interface Props {
  /** Loads all data again; true when it worked */
  onResync: () => Promise<boolean>;
}

/**
 * Connection and database (admin): Supabase configuration, tables, RLS, a manual sync and
 * the full setup SQL. Was a dialog behind the status in the top bar.
 */
const ConnectionDetails: React.FC<Props> = ({ onResync }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const [tableStatus, setTableStatus] = useState<Record<string, boolean | 'timeout' | 'error'>>({});
  const [rlsStatus, setRlsStatus] = useState<{ enabled: boolean; reason?: string } | null>(null);
  const [schemaSql, setSchemaSql] = useState('');
  const [showSql, setShowSql] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const config = getSupabaseConfigInfo();

  const check = useCallback(async () => {
    setTableStatus({});
    setRlsStatus(null);
    if (!supabase) return;
    setTableStatus(await supabaseService.checkTableHealth());
    setRlsStatus(user?.id ? await supabaseService.checkRLSHealth(user.id) : { enabled: false, reason: 'Log in to check RLS' });
  }, [user?.id]);

  useEffect(() => { check(); }, [check]);

  // The setup SQL is large: loaded only when asked for
  useEffect(() => {
    if (showSql && !schemaSql) import('../schema_update.sql?raw').then(m => setSchemaSql(m.default)).catch(() => setSchemaSql(''));
  }, [showSql, schemaSql]);

  const resync = async () => {
    setSyncMessage(null);
    const ok = await onResync();
    setSyncMessage({ ok, text: t(ok ? 'resync_ok' : 'resync_failed_permissions') });
  };

  const label = 'text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2';
  return (
    <section id="connection" aria-labelledby="connection_title" className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-stone-100 p-3 rounded-2xl text-stone-600"><i className="fas fa-plug text-2xl" aria-hidden="true"></i></div>
          <h3 id="connection_title" className="text-2xl font-black text-stone-900">{t('sync_details')}</h3>
        </div>
        <button type="button" onClick={check} className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-700 text-[11px] font-black uppercase tracking-widest">
          <i className="fas fa-rotate mr-1.5" aria-hidden="true"></i>{t('connection_check_again')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className={label}>{t('connection_status')}</p>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${supabase ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="font-bold text-sm">{supabase ? 'Connected' : 'Not Configured'}</span>
          </div>
        </div>
        <div>
          <p className={label}>{t('supabase_config')}</p>
          <div className="text-[10px] font-bold text-stone-600 space-y-0.5 break-all">
            <p>URL: {config.url}</p>
            <p>API Key: {config.hasKey ? 'Present' : 'Missing'}</p>
          </div>
        </div>
      </div>

      {supabase && (
        <div className="space-y-4">
          <div>
            <p className={label}>{t('table_status')}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.keys(tableStatus).length > 0 ? Object.entries(tableStatus).map(([table, status]) => (
                <div key={table} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                  <span className="text-[10px] font-bold text-stone-600 truncate mr-2">{table}</span>
                  <span className={`text-[9px] font-black uppercase flex-shrink-0 ${status === true ? 'text-green-600' : status === 'timeout' ? 'text-amber-500' : 'text-red-600'}`}>
                    {status === true ? t('found') : status === 'timeout' ? 'Timeout' : status === 'error' ? 'Error' : t('not_found')}
                  </span>
                </div>
              )) : (
                <div className="col-span-full py-4 text-center text-xs text-stone-400 italic">{t('checking_status')}</div>
              )}
            </div>
          </div>
          <div>
            <p className={label}>{t('rls_status')}</p>
            {rlsStatus ? (
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${rlsStatus.enabled ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                <i className={`fas ${rlsStatus.enabled ? 'fa-shield-check' : 'fa-shield-exclamation'} text-xl`} aria-hidden="true"></i>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest">{rlsStatus.enabled ? 'RLS Active' : 'RLS Check Failed'}</p>
                  {rlsStatus.reason && <p className="text-[10px] font-bold opacity-70">{rlsStatus.reason}</p>}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-stone-400 italic">{t('checking_rls')}</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`${label} mb-0`}>{t('manual_sync')}</p>
        <button type="button" onClick={resync} className="text-amber-600 font-black text-[10px] uppercase hover:underline">{t('retry_sync')}</button>
      </div>
      {syncMessage && <p role="status" className={`text-sm font-bold ${syncMessage.ok ? 'text-green-700' : 'text-red-700'}`}>{syncMessage.text}</p>}

      <details onToggle={e => setShowSql((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('sql_instructions')}</summary>
        <div className="mt-3 space-y-2">
          <button type="button" onClick={() => { navigator.clipboard.writeText(schemaSql); setSyncMessage({ ok: true, text: t('sql_copied') }); }} disabled={!schemaSql}
            className="text-amber-600 font-black text-[10px] uppercase hover:underline disabled:opacity-40">{t('copy_sql')}</button>
          <pre className="bg-stone-900 text-stone-100 p-4 rounded-xl text-[10px] font-mono overflow-x-auto h-60">{schemaSql || t('loading_short')}</pre>
        </div>
      </details>
    </section>
  );
};

export default ConnectionDetails;

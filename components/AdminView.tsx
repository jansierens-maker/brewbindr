import React from 'react';
import { useTranslation } from '../App';

import { useUser } from '../services/userContext';

interface AdminViewProps {
  onExport: () => void;
  onRestore: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlImport: () => void;
  importStatus: string;
  pendingSubmissions: any[];
  onApprove: (id: string, type: string, table?: string) => void;
  onReject: (id: string, type: string, table?: string) => void;
}

const AdminView: React.FC<AdminViewProps> = ({ 
  onExport, 
  onRestore, 
  onUrlImport, 
  importStatus,
  pendingSubmissions,
  onApprove,
  onReject
}) => {
  const { t } = useTranslation();
  const { isAdmin, user } = useUser();

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-4xl font-black text-stone-900">{t('nav_admin')}</h2>
        <p className="text-stone-500 font-medium mt-1">{t('import_desc')}</p>
      </div>

      {isAdmin && (
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-2xl text-green-600">
              <i className="fas fa-clipboard-check text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">Pending Submissions</h3>
          </div>

          <div className="space-y-4">
            {pendingSubmissions.length === 0 ? (
              <p className="text-center py-10 text-stone-400 font-bold italic border-2 border-dashed border-stone-50 rounded-2xl">No pending submissions to review.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {pendingSubmissions.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 bg-stone-50 rounded-2xl border border-stone-100 group">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-stone-200 text-stone-600 rounded-full">{item.type || item._table}</span>
                        <span className="text-[10px] font-bold text-stone-400 italic">submitted by {item.author || item.user_id?.split('-')[0] || 'Unknown User'}</span>
                      </div>
                      <h4 className="font-black text-stone-900">{item.name}</h4>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onReject(item.id, item.type, item._table)}
                        className="px-4 py-2 bg-white border border-stone-200 text-red-500 rounded-xl font-bold text-xs hover:bg-red-50 hover:border-red-100 transition-all"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => onApprove(item.id, item.type, item._table)}
                        className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-green-700 transition-all"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Management Tools */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
              <i className="fas fa-tools text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">Beheertools</h3>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
              <div className="flex items-center gap-3">
                <i className="fas fa-download text-amber-600"></i>
                <h4 className="font-bold text-stone-900 text-sm">Demo Data</h4>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Importeer voorbeeldrecepten en ingrediënten om de applicatie te testen of te demonstreren aan nieuwe gebruikers.
              </p>
              <button 
                onClick={onUrlImport} 
                className="w-full bg-amber-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-3"
              >
                <i className="fas fa-download"></i> {t('import_demo')}
              </button>
            </div>
          </div>
        </div>

        {/* JSON Backup Management */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-stone-100 p-3 rounded-2xl text-stone-600">
              <i className="fas fa-database text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">{t('backup_title')} (JSON)</h3>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
              <div className="flex items-center gap-3">
                <i className="fas fa-file-download text-stone-400"></i>
                <h4 className="font-bold text-stone-900 text-sm">{t('export')} Full Data</h4>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Creates a comprehensive backup of all recipes, brew logs, tasting notes, and your ingredient library in a single JSON file.
              </p>
              <button 
                onClick={onExport} 
                className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-all shadow-lg text-sm"
              >
                {t('export')}
              </button>
            </div>

            <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4" style={{ opacity: user ? 1 : 0.5, pointerEvents: user ? 'auto' : 'none' }}>
              <div className="flex items-center gap-3">
                <i className="fas fa-file-upload text-stone-400"></i>
                <h4 className="font-bold text-stone-900 text-sm">{t('restore')} Data</h4>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Restores your workspace from a previously exported brewbindr JSON backup. Caution: This may overwrite existing data.
              </p>
              <label className="block w-full bg-white border border-stone-200 text-stone-900 py-4 rounded-xl font-bold cursor-pointer hover:bg-stone-100 transition-all shadow-sm text-center text-sm">
                {t('restore')}
                <input id="json-restore-file" name="json_restore" type="file" className="hidden" accept=".json" onChange={onRestore} disabled={!user} aria-label="Upload JSON Backup File" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminView;
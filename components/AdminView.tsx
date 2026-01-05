
import React from 'react';
import { useTranslation } from '../App';

interface AdminViewProps {
  onExport: () => void;
  onExportBeerXml: () => void;
  onRestore: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlImport: () => void;
  xmlUrl: string;
  onXmlUrlChange: (url: string) => void;
  importStatus: string;
}

const AdminView: React.FC<AdminViewProps> = ({ 
  onExport, 
  onExportBeerXml,
  onRestore, 
  onFileImport, 
  onUrlImport, 
  xmlUrl, 
  onXmlUrlChange, 
  importStatus 
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-4xl font-black text-stone-900">{t('nav_admin')}</h2>
        <p className="text-stone-500 font-medium mt-1">{t('import_desc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* BeerXML Management */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
              <i className="fas fa-file-code text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">{t('import_tool')} (BeerXML)</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('via_file')}</p>
              <label className="group flex flex-col items-center justify-center w-full h-40 bg-stone-50 border-2 border-dashed border-stone-200 rounded-2xl cursor-pointer hover:bg-stone-100 transition-all">
                <i className="fas fa-cloud-upload-alt text-3xl text-stone-300 group-hover:text-amber-500 mb-2"></i>
                <p className="text-sm text-stone-500 font-bold">{t('dropzone_text')}</p>
                <input type="file" className="hidden" accept=".xml,.beerxml" onChange={onFileImport} />
              </label>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('via_url')}</p>
              <div className="flex flex-col md:flex-row gap-3">
                <input 
                  type="text" 
                  placeholder="https://..." 
                  className="flex-1 px-4 h-12 bg-stone-50 border border-stone-200 rounded-xl text-sm font-medium" 
                  value={xmlUrl} 
                  onChange={(e) => onXmlUrlChange(e.target.value)} 
                />
                <button 
                  onClick={() => onUrlImport()} 
                  disabled={!xmlUrl} 
                  className="px-6 h-12 bg-stone-900 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50"
                >
                  Import
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-100">
              <button 
                onClick={onExportBeerXml} 
                className="w-full bg-amber-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-3"
              >
                <i className="fas fa-file-export"></i> {t('export_library_xml')}
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

            <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
              <div className="flex items-center gap-3">
                <i className="fas fa-file-upload text-stone-400"></i>
                <h4 className="font-bold text-stone-900 text-sm">{t('restore')} Data</h4>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Restores your workspace from a previously exported BrewMaster JSON backup. Caution: This may overwrite existing data.
              </p>
              <label className="block w-full bg-white border border-stone-200 text-stone-900 py-4 rounded-xl font-bold cursor-pointer hover:bg-stone-100 transition-all shadow-sm text-center text-sm">
                {t('restore')}
                <input type="file" className="hidden" accept=".json" onChange={onRestore} />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminView;

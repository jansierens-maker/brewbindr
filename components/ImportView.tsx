import React from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';

interface ImportViewProps {
  onFileImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportBeerXml: () => void;
  importStatus: string;
  xmlUrl: string;
  onXmlUrlChange: (url: string) => void;
  onUrlImport: () => void;
}

const ImportView: React.FC<ImportViewProps> = ({
  onFileImport,
  onExportBeerXml,
  importStatus,
  xmlUrl,
  onXmlUrlChange,
  onUrlImport
}) => {
  const { t } = useTranslation();
  const { user } = useUser();

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-4xl font-black text-stone-900">{t('nav_import')}</h2>
        <p className="text-stone-500 font-medium mt-1">{t('import_view_desc')}</p>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* BeerXML Import Section */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
              <i className="fas fa-file-import text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">BeerXML {t('import_tab')}</h3>
          </div>

          <div className="space-y-6">
            {!user && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
                <i className="fas fa-lock text-amber-600"></i>
                <p className="text-xs font-bold text-amber-900">{t('login_to_import')}</p>
              </div>
            )}

            <div className="space-y-4" style={{ opacity: user ? 1 : 0.5, pointerEvents: user ? 'auto' : 'none' }}>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('via_file')}</p>
              <label className="group flex flex-col items-center justify-center w-full h-64 bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl cursor-pointer hover:bg-amber-50 hover:border-amber-500 transition-all">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <i className="fas fa-cloud-upload-alt text-3xl text-stone-300 group-hover:text-inherit"></i>
                </div>
                <p className="text-stone-500 font-bold">{t('dropzone_text')}</p>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-2">Max 10MB · .xml, .beerxml</p>
                <input
                  id="xml-file-import-view"
                  name="xml_file"
                  type="file"
                  className="hidden"
                  accept=".xml,.beerxml"
                  onChange={onFileImport}
                  disabled={!user}
                  aria-label="Upload BeerXML File"
                />
              </label>

              <div className="pt-4 space-y-4 border-t border-stone-100">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('via_url')}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="xml-url-import-view"
                    name="xml_url"
                    type="url"
                    placeholder="https://example.com/recipe.xml"
                    className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                    value={xmlUrl}
                    onChange={(e) => onXmlUrlChange(e.target.value)}
                    disabled={!user}
                    aria-label="Recipe XML URL"
                  />
                  <button
                    onClick={onUrlImport}
                    className="bg-stone-900 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-black transition-all disabled:opacity-50"
                    disabled={!user || !xmlUrl}
                  >
                    {t('import_btn')}
                  </button>
                </div>
              </div>
            </div>

            {importStatus !== 'idle' && (
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 flex items-center gap-3 animate-pulse">
                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                <p className="text-xs font-bold text-stone-600 uppercase tracking-widest">
                  Status: {importStatus}...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* BeerXML Export Section */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-stone-100 p-3 rounded-2xl text-stone-600">
              <i className="fas fa-file-export text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">BeerXML {t('export')}</h3>
          </div>

          <p className="text-sm text-stone-500 leading-relaxed">
            Exporteer je volledige ingrediëntenbibliotheek naar een BeerXML bestand. Dit bestand kan worden geïmporteerd in de meeste brouwsoftware.
          </p>

          <button
            onClick={onExportBeerXml}
            className="w-full bg-stone-900 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-black transition-all flex items-center justify-center gap-3"
          >
            <i className="fas fa-download"></i> {t('export_library_xml')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportView;

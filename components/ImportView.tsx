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
        <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('nav_import')}</h2>
        <p className="text-[var(--color-text-muted)] font-medium mt-1">{t('import_view_desc')}</p>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* BeerXML Import Section */}
        <div className="bg-[var(--color-bg)] p-8 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--color-accent-light)] p-3 rounded-2xl text-[var(--color-accent)]">
              <i className="fas fa-file-import text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-[var(--color-text)]">BeerXML {t('import_tab')}</h3>
          </div>

          <div className="space-y-6">
            {!user && (
              <div className="p-4 bg-[var(--color-accent-light)] border border-[var(--color-accent-light)] rounded-[var(--radius-sm)] flex items-center gap-3 text-[var(--color-accent-dark)]">
                <i className="fas fa-lock"></i>
                <p className="text-xs font-bold">{t('login_to_import')}</p>
              </div>
            )}

            <div className="space-y-4" style={{ opacity: user ? 1 : 0.5, pointerEvents: user ? 'auto' : 'none' }}>
              <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('via_file')}</p>
              <label className="group flex flex-col items-center justify-center w-full h-64 bg-[var(--color-bg-subtle)] border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius)] cursor-pointer hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent)] transition-all">
                <div className="w-16 h-16 bg-[var(--color-bg)] rounded-2xl flex items-center justify-center shadow-sm mb-4 group-hover:bg-[var(--color-accent)] group-hover:text-white transition-all">
                  <i className="fas fa-cloud-upload-alt text-3xl text-[var(--color-text-xmuted)] group-hover:text-inherit"></i>
                </div>
                <p className="text-[var(--color-text-muted)] font-bold">{t('dropzone_text')}</p>
                <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mt-2">Max 10MB · .xml, .beerxml</p>
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

              <div className="pt-4 space-y-4 border-t border-[var(--color-border)]">
                <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('via_url')}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="xml-url-import-view"
                    name="xml_url"
                    type="url"
                    placeholder="https://example.com/recipe.xml"
                    className="flex-1 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
                    value={xmlUrl}
                    onChange={(e) => onXmlUrlChange(e.target.value)}
                    disabled={!user}
                    aria-label="Recipe XML URL"
                  />
                  <button
                    onClick={onUrlImport}
                    className="bg-[var(--color-text)] text-white px-8 py-3 rounded-[var(--radius-sm)] font-bold text-sm shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
                    disabled={!user || !xmlUrl}
                  >
                    {t('import_btn')}
                  </button>
                </div>
              </div>
            </div>

            {importStatus !== 'idle' && (
              <div className="p-4 bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] border border-[var(--color-border)] flex items-center gap-3 animate-pulse">
                <div className="w-2 h-2 bg-[var(--color-accent)] rounded-full"></div>
                <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
                  Status: {importStatus}...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* BeerXML Export Section */}
        <div className="bg-[var(--color-bg)] p-8 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-[var(--color-bg-subtle)] p-3 rounded-2xl text-[var(--color-text-muted)]">
              <i className="fas fa-file-export text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-[var(--color-text)]">BeerXML {t('export')}</h3>
          </div>

          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            Exporteer je volledige ingrediëntenbibliotheek naar een BeerXML bestand. Dit bestand kan worden geïmporteerd in de meeste brouwsoftware.
          </p>

          <button
            onClick={onExportBeerXml}
            className="w-full bg-[var(--color-text)] text-white py-4 rounded-[var(--radius-sm)] font-black shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-3"
          >
            <i className="fas fa-download"></i> {t('export_library_xml')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportView;

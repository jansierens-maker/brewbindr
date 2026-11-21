import React, { useState } from 'react';
import { useTranslation } from '../App';
import type { Language } from '../services/i18n';

const KEY = 'brewbindr.exportLang';
const readLang = (): Language => {
  try { const v = localStorage.getItem(KEY); return v === 'nl' || v === 'fr' || v === 'en' ? v : 'en'; } catch { return 'en'; }
};

interface Props {
  /** What is exported (shown in the title) */
  what: string;
  onExport: (lang: Language) => void;
  onClose: () => void;
}

/** Before a BeerXML export: in which language to write the names (#212). English is the most widely read. */
const ExportLanguageDialog: React.FC<Props> = ({ what, onExport, onClose }) => {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Language>(readLang);
  const go = () => {
    try { localStorage.setItem(KEY, lang); } catch { /* blocked: no memory of the choice */ }
    onExport(lang);
  };
  const options: { value: Language; label: string }[] = [
    { value: 'en', label: t('export_lang_en') },
    { value: 'nl', label: 'Nederlands' },
    { value: 'fr', label: 'Français' },
  ];
  return (
    <div className="fixed inset-0 z-[400] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="export_lang_title" className="w-full max-w-sm bg-[var(--color-bg)] rounded-[var(--radius)] shadow-2xl p-6 space-y-5">
        <div>
          <h3 id="export_lang_title" className="text-lg font-black text-[var(--color-text)]">{t('export_lang_title')}</h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{what}</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-2">{t('export_lang_label')}</legend>
          {options.map(o => (
            <label key={o.value} htmlFor={`export_lang_${o.value}`} className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] cursor-pointer has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-light)]">
              <input id={`export_lang_${o.value}`} type="radio" name="export_lang" value={o.value} checked={lang === o.value} onChange={() => setLang(o.value)} />
              <span className="text-sm font-bold text-[var(--color-text)]">{o.label}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-[var(--color-text-muted)]">{t('export_lang_hint')}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">{t('cancel_btn')}</button>
          <button type="button" onClick={go} autoFocus className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white text-xs font-black uppercase tracking-widest">{t('export_beerxml')}</button>
        </div>
      </div>
    </div>
  );
};

export default ExportLanguageDialog;

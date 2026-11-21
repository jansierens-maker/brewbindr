import React, { useState } from 'react';
import { useTranslation } from '../App';
import type { LibraryIngredient } from '../types';
import type { Language } from '../services/i18n';
import { ITEM_LANGS, ItemTextField, missingLanguages } from '../services/itemI18n';

/** The descriptions a type has (the others are not shown). */
export const textFieldsFor = (type: string): ItemTextField[] =>
  type === 'style' ? ['profile', 'examples', 'notes']
    : type === 'misc' ? ['use_for', 'notes']
    : type === 'equipment' || type === 'mash_profile' ? ['description', 'notes']
    : ['notes'];

interface Props {
  idPrefix: string;
  item: Partial<LibraryIngredient> & { type?: string };
  onChange: (patch: Partial<LibraryIngredient>) => void;
}

const LANG_LABEL: Record<Language, string> = { nl: 'Nederlands', fr: 'Français', en: 'English' };

/**
 * "Translations" in an edit form: product name or not, the name per language, aliases and
 * the descriptions per language. Folded away; the summary says what is still missing.
 */
const TranslationsEditor: React.FC<Props> = ({ idPrefix, item, onChange }) => {
  const { t } = useTranslation();
  // The aliases as typed ("a, b, "): parsed into a clean list on every change
  const [aliasText, setAliasText] = useState((item.aliases ?? []).join(', '));
  const fields = textFieldsFor(item.type ?? '');
  const product = item.name_kind === 'product';
  const missing = item.name ? missingLanguages(item as LibraryIngredient, 'name') : ITEM_LANGS;
  const field = 'w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold';
  const label = 'text-[10px] font-black text-[var(--color-text-xmuted)] uppercase';

  const setName = (l: Language, v: string) => {
    const names = { ...item.names, [l]: v };
    if (!v.trim()) delete names[l];
    onChange({ names: Object.keys(names).length ? names : undefined });
  };
  const setText = (l: Language, f: ItemTextField, v: string) => {
    const lang = { ...item.i18n?.[l], [f]: v };
    if (!v.trim()) delete lang[f];
    const i18n = { ...item.i18n, [l]: lang };
    if (!Object.keys(lang).length) delete i18n[l];
    onChange({ i18n: Object.keys(i18n).length ? i18n : undefined });
  };

  return (
    <details className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] group/tr">
      <summary className="cursor-pointer select-none px-3 py-2 flex items-center justify-between gap-2 text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">
        <span><i className="fas fa-language mr-1.5" aria-hidden="true"></i>{t('tr_title')}</span>
        <span className="normal-case tracking-normal font-bold text-[10px] text-[var(--color-text-xmuted)]">
          {product ? t('tr_product_short') : missing.length ? t('tr_missing').replace('{langs}', missing.map(l => l.toUpperCase()).join(', ')) : t('tr_complete')}
        </span>
      </summary>
      <div className="p-3 pt-1 space-y-3">
        <div>
          <label htmlFor={`${idPrefix}-name-kind`} className={label}>{t('tr_name_kind')}</label>
          <select id={`${idPrefix}-name-kind`} name="name_kind" className={field} value={item.name_kind ?? 'generic'}
            onChange={e => onChange({ name_kind: e.target.value as 'generic' | 'product' })}>
            <option value="generic">{t('tr_generic')}</option>
            <option value="product">{t('tr_product')}</option>
          </select>
          {product && <p className="text-[10px] text-[var(--color-text-xmuted)] mt-1">{t('tr_product_hint')}</p>}
        </div>

        {!product && (
          <fieldset className="space-y-2">
            <legend className={label}>{t('tr_name_in')}</legend>
            {ITEM_LANGS.map(l => (
              <div key={l} className="flex gap-2 items-center">
                <label htmlFor={`${idPrefix}-name-${l}`} className="w-6 text-[10px] font-black text-[var(--color-text-xmuted)]">
                  <span aria-hidden="true">{l.toUpperCase()}</span><span className="sr-only">{t('tr_name_in')} ({LANG_LABEL[l]})</span>
                </label>
                <input id={`${idPrefix}-name-${l}`} name={`name_${l}`} lang={l} className={field} maxLength={100} placeholder={item.name}
                  value={item.names?.[l] ?? ''} onChange={e => setName(l, e.target.value)} />
              </div>
            ))}
          </fieldset>
        )}

        <div>
          <label htmlFor={`${idPrefix}-aliases`} className={label}>{t('tr_aliases')}</label>
          <input id={`${idPrefix}-aliases`} name="aliases" className={field} maxLength={300} placeholder={t('tr_aliases_hint')}
            value={aliasText}
            onChange={e => {
              setAliasText(e.target.value);
              const list = [...new Set(e.target.value.split(',').map(x => x.trim()).filter(Boolean))];
              onChange({ aliases: list.length ? list : undefined });
            }} />
        </div>

        {fields.map(f => (
          <fieldset key={f} className="space-y-2">
            <legend className={label}>{t(`tr_field_${f}` as any)}</legend>
            {ITEM_LANGS.map(l => (
              <div key={l}>
                <label htmlFor={`${idPrefix}-${f}-${l}`} className="sr-only">{t(`tr_field_${f}` as any)} ({LANG_LABEL[l]})</label>
                <div className="flex gap-2 items-start">
                  <span className="mt-2 w-6 text-[10px] font-black text-[var(--color-text-xmuted)]" aria-hidden="true">{l.toUpperCase()}</span>
                  <textarea id={`${idPrefix}-${f}-${l}`} name={`${f}_${l}`} lang={l} rows={f === 'profile' ? 3 : 2} maxLength={2000}
                    className={`${field} font-medium`} placeholder={item[f] ?? ''}
                    value={item.i18n?.[l]?.[f] ?? ''} onChange={e => setText(l, f, e.target.value)} />
                </div>
              </div>
            ))}
          </fieldset>
        ))}
      </div>
    </details>
  );
};

export default TranslationsEditor;

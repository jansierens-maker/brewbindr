import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from '../App';
import SearchBox from './SearchBox';

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  search: { id: string; label: string; value: string; onChange: (v: string) => void };
  sort?: { id: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
  /** Filters that are set: shown as chips under the bar, counted on the button */
  chips?: FilterChip[];
  onClearAll?: () => void;
  /** The filter panel's fields; without them there is no Filters button */
  children?: React.ReactNode;
}

/**
 * One bar per list: search, a Filters button that opens a panel (a sheet from the bottom on a
 * phone), and a compact sort menu. Filters that are set stay visible as removable chips.
 */
const ListToolbar: React.FC<Props> = ({ search, sort, chips = [], onClearAll, children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const btn = 'flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-black uppercase tracking-widest whitespace-nowrap';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox id={search.id} label={search.label} value={search.value} onChange={search.onChange} className="flex-1 min-w-[12rem] max-w-xl" />
        {children && (
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={panelId}
            className={`${btn} ${chips.length ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-text)]' : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
            <i className="fas fa-sliders" aria-hidden="true"></i>
            {t('filters_label')}{chips.length > 0 && <span className="tabular-nums">({chips.length})</span>}
          </button>
        )}
        {sort && (
          <div className={`${btn} border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] normal-case tracking-normal font-bold`}>
            <i className="fas fa-arrow-down-wide-short" aria-hidden="true"></i>
            <label htmlFor={sort.id} className="sr-only">{t('sort_label')}</label>
            <select id={sort.id} name={sort.id} value={sort.value} onChange={e => sort.onChange(e.target.value)}
              className="bg-transparent outline-none text-xs font-bold text-[var(--color-text)] cursor-pointer">
              {sort.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {open && children && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[300] md:hidden" onClick={() => setOpen(false)} aria-hidden="true"></div>
          <div id={panelId} role="region" aria-label={t('filters_label')}
            className="fixed inset-x-0 bottom-0 z-[301] max-h-[85vh] overflow-auto rounded-t-2xl p-5 pb-[max(2rem,env(safe-area-inset-bottom))] bg-[var(--color-bg)] shadow-2xl md:static md:z-auto md:max-h-none md:rounded-[var(--radius)] md:shadow-[var(--shadow-sm)] md:p-5 border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-4 md:hidden">
              <p className="font-black text-sm uppercase tracking-widest text-[var(--color-text)]">{t('filters_label')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">{children}</div>
            <div className="flex justify-end gap-2 mt-5">
              {chips.length > 0 && onClearAll && (
                <button type="button" onClick={onClearAll} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{t('filters_clear_all')}</button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white text-xs font-black uppercase tracking-widest">{t('filters_done')}</button>
            </div>
          </div>
        </>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('filters_active')} role="group">
          {chips.map(c => (
            <span key={c.key} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[11px] font-bold text-[var(--color-text)]">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={t('filters_remove').replace('{f}', c.label)} title={t('filters_remove').replace('{f}', c.label)}
                className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center">
                <i className="fas fa-times text-[10px]" aria-hidden="true"></i>
              </button>
            </span>
          ))}
          {onClearAll && chips.length > 1 && (
            <button type="button" onClick={onClearAll} className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2">{t('filters_clear_all')}</button>
          )}
        </div>
      )}
    </div>
  );
};

export default ListToolbar;

/** "6–9", "≥ 6" or "≤ 9" for a range filter chip. */
export const rangeText = (min?: number, max?: number) =>
  min !== undefined && max !== undefined ? `${min}–${max}` : min !== undefined ? `≥ ${min}` : `≤ ${max}`;

const fieldClass = 'w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold text-[var(--color-text)]';
const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1';

/** A choice from a short list ("" = any). */
export const FilterSelect: React.FC<{ id: string; label: string; value: string; options: { value: string; label: string }[]; anyLabel: string; onChange: (v: string) => void }> =
  ({ id, label, value, options, anyLabel, onChange }) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} name={id} className={fieldClass} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{anyLabel}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

/** A range: from … to (either may be empty). */
export const FilterRange: React.FC<{ id: string; label: string; unit?: string; min?: number; max?: number; step?: number; onChange: (min?: number, max?: number) => void }> =
  ({ id, label, unit, min, max, step = 0.1, onChange }) => {
    const { t } = useTranslation();
    const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; };
    return (
      <fieldset>
        <legend className={labelClass}>{label}{unit ? ` (${unit})` : ''}</legend>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}_min`} className="sr-only">{t('filters_from')}</label>
          <input id={`${id}_min`} name={`${id}_min`} type="number" inputMode="decimal" step={step} placeholder={t('filters_from')} className={fieldClass} maxLength={6}
            value={min ?? ''} onChange={e => onChange(num(e.target.value), max)} />
          <span className="text-[var(--color-text-xmuted)]">–</span>
          <label htmlFor={`${id}_max`} className="sr-only">{t('filters_to')}</label>
          <input id={`${id}_max`} name={`${id}_max`} type="number" inputMode="decimal" step={step} placeholder={t('filters_to')} className={fieldClass} maxLength={6}
            value={max ?? ''} onChange={e => onChange(min, num(e.target.value))} />
        </div>
      </fieldset>
    );
  };

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../App';
import { matchesQuery } from '../services/search';

export interface ComboOption {
  value: string;
  label: string;
  /** Shown after the label, also searched (e.g. "8 EBC", "12 % alfa") */
  hint?: string;
  /** Options with the same group are listed under that heading */
  group?: string;
  /** Searched but not shown (e.g. the names in other languages) */
  keywords?: string;
}

interface Props {
  id: string;
  name: string;
  /** Accessible name (the field shows the choice, so a visible label is optional) */
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  /** Shown when the value is not one of the options (e.g. an ingredient typed in a recipe) */
  fallbackText?: string;
  placeholder?: string;
  /** A first option with an empty value (e.g. "No target profile") */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** Most options rendered at once: typing narrows a long list down. */
const MAX_SHOWN = 150;

/**
 * A choice from a list you can type in to search (ARIA combobox with a listbox).
 * Arrow keys move, Enter chooses, Escape closes and keeps the previous choice.
 */
const Combobox: React.FC<Props> = ({ id, name, label, value, options, onChange, fallbackText, placeholder, emptyLabel, disabled, className = '' }) => {
  const { t } = useTranslation();
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find(o => o.value === value);
  const shownText = selected?.label ?? (value === '' && emptyLabel && !fallbackText ? emptyLabel : fallbackText ?? '');

  const all = useMemo(
    () => (emptyLabel ? [{ value: '', label: emptyLabel } as ComboOption, ...options] : options),
    [options, emptyLabel],
  );
  const filtered = useMemo(
    () => all.filter(o => matchesQuery(`${o.label} ${o.hint ?? ''} ${o.group ?? ''} ${o.keywords ?? ''}`, query)).slice(0, MAX_SHOWN),
    [all, query],
  );

  // Close when clicking or tabbing elsewhere
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | FocusEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('focusin', away); };
  }, [open]);

  // Keep the active option in view
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    const at = filteredIndexOf(value);
    setActive(at >= 0 ? at : 0);
    setOpen(true);
  };
  const filteredIndexOf = (v: string) => all.findIndex(o => o.value === v);

  const choose = (o: ComboOption) => {
    setOpen(false);
    setQuery('');
    if (o.value !== value) onChange(o.value);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive(a => Math.max(0, Math.min(filtered.length - 1, a + d)));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={wrap} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={id} name={name} type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          autoComplete="off" maxLength={100} disabled={disabled}
          className="w-full p-2.5 pr-8 bg-white border border-stone-200 rounded-xl text-stone-900 text-sm font-medium truncate disabled:opacity-50 focus:border-amber-500 outline-none"
          placeholder={open ? (shownText || placeholder || t('combo_type_to_search')) : (placeholder || t('combo_type_to_search'))}
          value={open ? query : shownText}
          onFocus={openList}
          onClick={() => { if (!open) openList(); }}
          onChange={e => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onKeyDown={onKey}
        />
        <i className={`fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"></i>
      </div>
      {open && (
        <ul ref={list} id={listId} role="listbox" aria-label={label}
          className="absolute z-50 mt-1 left-0 right-0 min-w-[14rem] max-h-72 overflow-auto bg-white border border-stone-200 rounded-xl shadow-xl py-1 text-sm">
          {filtered.length === 0 && <li className="px-3 py-2 text-stone-400 font-medium" role="presentation">{t('combo_no_match')}</li>}
          {filtered.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : undefined;
            lastGroup = o.group;
            return (
              <React.Fragment key={`${o.value}-${i}`}>
                {heading && <li role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-stone-400">{heading}</li>}
                <li id={`${listId}-${i}`} role="option" aria-selected={o.value === value} data-index={i}
                  onMouseDown={e => e.preventDefault()} onClick={() => choose(o)} onMouseMove={() => setActive(i)}
                  className={`px-3 py-2 cursor-pointer flex items-baseline justify-between gap-3 ${i === active ? 'bg-amber-50' : ''} ${o.value === value ? 'font-bold text-amber-800' : 'text-stone-800'}`}>
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="text-[11px] text-stone-400 whitespace-nowrap">{o.hint}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Combobox;

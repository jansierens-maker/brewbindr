import React from 'react';
import { useTranslation } from '../App';

interface Props {
  id: string;
  /** Placeholder, also the accessible name */
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** A search field with a clear button; Escape clears it too. */
const SearchBox: React.FC<Props> = ({ id, label, value, onChange, className = '' }) => {
  const { t } = useTranslation();
  return (
    <div role="search" className={`bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 flex items-center gap-2 focus-within:border-[var(--color-accent)] transition-colors ${className}`}>
      <i className="fas fa-search text-[var(--color-text-xmuted)] text-xs" aria-hidden="true"></i>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} name={id} type="search" placeholder={label} maxLength={100} autoComplete="off"
        className="bg-transparent border-none outline-none text-sm w-full text-[var(--color-text)] [&::-webkit-search-cancel-button]:hidden"
        value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onChange(''); }} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={t('search_clear')} title={t('search_clear')}
          className="text-[var(--color-text-xmuted)] hover:text-[var(--color-text)] px-1">
          <i className="fas fa-times text-xs" aria-hidden="true"></i>
        </button>
      )}
    </div>
  );
};

export default SearchBox;

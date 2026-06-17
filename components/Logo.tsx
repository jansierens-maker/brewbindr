import React from 'react';

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Mark */}
      <div className="w-8 h-8 bg-[var(--color-accent)] rounded-lg flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] fill-white">
          <path d="M5 3l1.5 14.5A2 2 0 008.5 19h7a2 2 0 002-1.5L19 3H5zm2.2 2h9.6l-1.2 12H8.4L7.2 5zm1.3 2l.8 8h5l.8-8H8.5z"/>
        </svg>
      </div>

      {/* Wordmark */}
      <div className="font-['Outfit'] font-extrabold text-[15px] tracking-[-0.3px] uppercase">
        <span className="text-[var(--color-text)]">BREW</span>
        <span className="text-[var(--color-accent)]">BINDR</span>
      </div>
    </div>
  );
}

export default Logo;

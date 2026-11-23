import React from 'react';

/** Colours per kind, the same as the dots on the stock tiles. */
const COLORS: Record<string, { fill: string; stroke: string; tape: string }> = {
  fermentable: { fill: '#FDE7C2', stroke: '#B45309', tape: '#D97706' },
  hop: { fill: '#D1FAE5', stroke: '#047857', tape: '#059669' },
  culture: { fill: '#DBEAFE', stroke: '#1D4ED8', tape: '#2563EB' },
  misc: { fill: '#EDE9FE', stroke: '#6D28D9', tape: '#7C3AED' },
  empty: { fill: '#F5F5F4', stroke: '#A8A29E', tape: '#D6D3D1' },
};

/**
 * Stock without a desired amount (#221): a box in the colour of the kind, saying only
 * "you have this". The glass (with a percentage) is for stock with a desired amount.
 * Grey when there is nothing (shown with "Show all ingredients").
 */
export const StockBox: React.FC<{ type: string; size?: number; empty?: boolean; title?: string }> = ({ type, size = 48, empty, title }) => {
  const c = COLORS[empty ? 'empty' : type] ?? COLORS.empty;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M6 16 L24 8 L42 16 L42 36 L24 44 L6 36 Z" fill={c.fill} stroke={c.stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 16 L24 24 L42 16 M24 24 L24 44" fill="none" stroke={c.stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 12 L33 20 L33 27" fill="none" stroke={c.tape} strokeWidth="2" />
    </svg>
  );
};

export default StockBox;

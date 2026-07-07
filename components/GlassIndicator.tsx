import React, { useMemo } from 'react';

/**
 * GlassIndicator
 * Toont de voorraad van een ingrediënt als een vullend pintglas (v2).
 * De vloeistofkleur geeft de voorraadstatus aan: rood (kritiek), oranje (laag) of amber (ok).
 * Het statuslabel gebruikt groen/amber/oranje/rood.
 *
 * Props:
 *   pct     - Vulpercentage 0-100
 *   size    - SVG breedte in px (default: 48)
 *   label   - Naam van het ingrediënt (optioneel)
 *   qty     - Hoeveelheid als tekst, bijv. "300 g" (optioneel)
 *   showPct - Toon percentage onder het glas (default: true)
 */

const uidRef = { current: 0 };

function getLiquidColor(pct: number): string {
  if (pct <= 10) return '#EF4444'; // Red
  if (pct <= 30) return '#F97316'; // Orange
  return '#F59E0B'; // Amber
}

function getStatusColor(pct: number): string {
  if (pct <= 10) return '#EF4444';
  if (pct <= 30) return '#F97316';
  if (pct <= 60) return '#F59E0B';
  return '#10B981';
}

interface GlassIndicatorProps {
  pct?: number;
  size?: number;
  label?: string;
  qty?: string;
  showPct?: boolean;
}

const GLASS = {
  outer: 'M8 4 h44 l-5 66 a6 6 0 0 1 -6 5.5 h-22 a6 6 0 0 1 -6 -5.5 Z',
  inner: 'M10 6 h40 l-4.5 62 a5 5 0 0 1 -5 4.6 h-21 a5 5 0 0 1 -5 -4.6 Z',
  top: 6,
  bottom: 72
};

export function GlassIndicator({
  pct = 0,
  size = 48,
  label,
  qty,
  showPct = true,
}: GlassIndicatorProps) {
  const safePct = Math.max(0, Math.min(100, pct));
  const id = useMemo(() => `glass-${++uidRef.current}`, []);
  const liquidColor = getLiquidColor(safePct);
  const statusColor = getStatusColor(safePct);

  const liquidY = GLASS.bottom - (GLASS.bottom - GLASS.top) * (safePct / 100);
  const liquidH = (GLASS.bottom - liquidY) + 4; // +4 to ensure overlap with bottom curve
  const foamVisible = safePct > 3;
  const svgH = Math.round(size * 80 / 60);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg
        width={size}
        height={svgH}
        viewBox="0 0 60 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Stock ${safePct} percent`}
      >
        <defs>
          <clipPath id={id}>
            <path d={GLASS.inner} />
          </clipPath>
        </defs>

        {/* Glas outline */}
        <path
          d={GLASS.outer}
          fill="#FFFFFF"
          stroke="#CBD5E1"
          strokeWidth="2.5"
        />

        {/* Vloeistof */}
        {safePct > 0 && (
          <rect
            x="0"
            y={liquidY}
            width="60"
            height={liquidH}
            fill={liquidColor}
            clipPath={`url(#${id})`}
          />
        )}

        {/* Schuimkraag */}
        {foamVisible && (
          <ellipse
            cx="30"
            cy={liquidY}
            rx="19"
            ry="4"
            fill="#FEF3C7"
            clipPath={`url(#${id})`}
          />
        )}
      </svg>

      {showPct && (
        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, lineHeight: 1 }}>
          {safePct}%
        </span>
      )}

      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#0F1B2D', textAlign: 'center', maxWidth: 80, lineHeight: 1.3 }}>
          {label}
        </span>
      )}

      {qty && (
        <span style={{ fontSize: 11, color: '#64748B', textAlign: 'center' }}>
          {qty}
        </span>
      )}
    </div>
  );
}

interface MiniGlassBarProps {
  pct?: number;
}

export function MiniGlassBar({ pct = 0 }: MiniGlassBarProps) {
  const safePct = Math.max(0, Math.min(100, pct));
  const statusColor = getStatusColor(safePct);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <GlassIndicator pct={safePct} size={24} showPct={false} />
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${safePct}%`,
            borderRadius: 3,
            background: statusColor,
            transition: 'width .3s ease',
          }}
        />
      </div>
    </div>
  );
}

export default GlassIndicator;

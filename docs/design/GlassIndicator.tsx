import React, { useMemo } from 'react';

/**
 * GlassIndicator
 * Toont de voorraad van een ingrediënt als een vullend bierglas.
 * De glaskleur volgt de SRM-schaal: kristalhelder (vol) → stout (leeg).
 * Het statuslabel gebruikt groen/oranje/rood.
 *
 * Props:
 *   pct     {number}  Vulpercentage 0–100
 *   size    {number}  SVG breedte in px (default: 48)
 *   label   {string}  Naam van het ingrediënt (optioneel)
 *   qty     {string}  Hoeveelheid als tekst, bijv. "300 g" (optioneel)
 *   showPct {boolean} Toon percentage onder het glas (default: true)
 */

let _uid = 0;

function getBeerColor(pct: number): string {
  const stops = [
    { at: 100, r: 249, g: 243, b: 160 },
    { at:  75, r: 245, g: 200, b:  66 },
    { at:  50, r: 212, g: 130, b:  26 },
    { at:  25, r: 123, g:  63, b:  16 },
    { at:   0, r:  26, g:  10, b:   2 },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (pct <= a.at && pct >= b.at) {
      const t  = (pct - b.at) / (a.at - b.at);
      const r  = Math.round(b.r  + t * (a.r  - b.r));
      const g  = Math.round(b.g  + t * (a.g  - b.g));
      const bl = Math.round(b.b  + t * (a.b  - b.b));
      return `rgb(${r},${g},${bl})`;
    }
  }
  return 'rgb(249,243,160)';
}

function getStatusColor(pct: number): string {
  if (pct <= 10) return '#EF4444';
  if (pct <= 30) return '#F97316';
  if (pct <= 60) return '#F59E0B';
  return '#10B981';
}

function mapY(pct: number): number {
  return 62 - (pct / 100) * 54;
}

interface GlassIndicatorProps {
  pct?: number;
  size?: number;
  label?: string;
  qty?: string;
  showPct?: boolean;
}

export function GlassIndicator({
  pct = 0,
  size = 48,
  label,
  qty,
  showPct = true,
}: GlassIndicatorProps) {
  const safePct = Math.max(0, Math.min(100, pct));
  const id = useMemo(() => `glass-${++_uid}`, []);
  const beerColor = getBeerColor(safePct);
  const statusColor = getStatusColor(safePct);
  const liquidY = mapY(safePct);
  const liquidH = 62 - liquidY;
  const svgH = Math.round(72 * (size / 48));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg
        width={size}
        height={svgH}
        viewBox="0 0 48 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={id}>
            <path d="M8 6 L6 64 Q6 66 8 66 L40 66 Q42 66 42 64 L40 6 Z" />
          </clipPath>
        </defs>

        {/* Glas outline */}
        <path
          d="M8 6 L6 64 Q6 67 8 67 L40 67 Q42 67 42 64 L40 6 Z"
          fill="rgba(255,255,255,.15)"
          stroke="#CBD5E1"
          strokeWidth="1.5"
        />

        {/* Vloeistof */}
        {safePct > 0 && (
          <rect
            x="6.5"
            y={liquidY}
            width="35"
            height={liquidH}
            fill={beerColor}
            opacity={0.85}
            clipPath={`url(#${id})`}
          />
        )}

        {/* Schuim */}
        {safePct > 5 && (
          <ellipse
            cx="24"
            cy={liquidY + 1}
            rx="13"
            ry="3.5"
            fill="rgba(255,255,255,.75)"
            clipPath={`url(#${id})`}
          />
        )}

        {/* Glinstering */}
        <line
          x1="13" y1="10" x2="11" y2="60"
          stroke="rgba(255,255,255,.35)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Handvat */}
        <path
          d="M42 20 Q52 20 52 30 Q52 40 42 40"
          stroke="#CBD5E1"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Rand */}
        <line x1="8" y1="6" x2="40" y2="6" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />

        {/* Bodem */}
        <line x1="5" y1="67" x2="43" y2="67" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
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

/**
 * MiniGlassBar
 * Compacte versie voor in de lijstweergave:
 * klein bierglas + horizontale voortgangsbalk naast elkaar.
 */
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


/**
 * GlassIndicator
 * Toont de voorraad van een ingrediënt als een vullend bierglas.
 * De glaskleur volgt de SRM-schaal: kristalhelder (vol) → stout (leeg).
 * Het statuslabel gebruikt groen/oranje/rood.
 *
 * Props:
 *   pct    {number}  Vulpercentage 0–100
 *   size   {number}  SVG breedte in px (default: 48)
 *   label  {string}  Naam van het ingrediënt (optioneel)
 *   qty    {string}  Hoeveelheid als tekst, bijv. "300 g" (optioneel)
 *   showPct {boolean} Toon percentage onder het glas (default: true)
 */

let _uid = 0;

function getBeerColor(pct) {
  const stops = [
    { at: 100, r: 249, g: 243, b: 160 }, // kristalhelder geel
    { at:  75, r: 245, g: 200, b:  66 }, // goudblond
    { at:  50, r: 212, g: 130, b:  26 }, // amber
    { at:  25, r: 123, g:  63, b:  16 }, // bruin
    { at:   0, r:  26, g:  10, b:   2 }, // donker stout
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (pct <= a.at && pct >= b.at) {
      const t = (pct - b.at) / (a.at - b.at);
      const r  = Math.round(b.r  + t * (a.r  - b.r));
      const g  = Math.round(b.g  + t * (a.g  - b.g));
      const bl = Math.round(b.b  + t * (a.b  - b.b));
      return `rgb(${r},${g},${bl})`;
    }
  }
  return 'rgb(249,243,160)';
}

function getStatusColor(pct) {
  if (pct <= 10) return '#EF4444'; // rood
  if (pct <= 30) return '#F97316'; // oranje
  if (pct <= 60) return '#F59E0B'; // amber
  return '#10B981';                // groen
}

// Map percentage naar Y-coördinaat in de SVG (bottom=62, top=8)
function mapY(pct) {
  return 62 - (pct / 100) * 54;
}

export function GlassIndicator({
  pct = 0,
  size = 48,
  label,
  qty,
  showPct = true,
}) {
  const safePct = Math.max(0, Math.min(100, pct));
  const id = useMemo(() => `glass-${++_uid}`, []);
  const beerColor = getBeerColor(safePct);
  const statusColor = getStatusColor(safePct);
  const liquidY = mapY(safePct);
  const liquidH = 62 - liquidY;
  const svgH = Math.round(72 * (size / 48));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg
        width={size}
        height={svgH}
        viewBox="0 0 48 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={id}>
            <path d="M8 6 L6 64 Q6 66 8 66 L40 66 Q42 66 42 64 L40 6 Z" />
          </clipPath>
        </defs>

        {/* Glas outline */}
        <path
          d="M8 6 L6 64 Q6 67 8 67 L40 67 Q42 67 42 64 L40 6 Z"
          fill="rgba(255,255,255,.15)"
          stroke="#CBD5E1"
          strokeWidth="1.5"
        />

        {/* Vloeistof */}
        {safePct > 0 && (
          <rect
            x="6.5"
            y={liquidY}
            width="35"
            height={liquidH}
            fill={beerColor}
            opacity={0.85}
            clipPath={`url(#${id})`}
          />
        )}

        {/* Schuim */}
        {safePct > 5 && (
          <ellipse
            cx="24"
            cy={liquidY + 1}
            rx="13"
            ry="3.5"
            fill="rgba(255,255,255,.75)"
            clipPath={`url(#${id})`}
          />
        )}

        {/* Glinstering */}
        <line
          x1="13" y1="10" x2="11" y2="60"
          stroke="rgba(255,255,255,.35)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Handvat */}
        <path
          d="M42 20 Q52 20 52 30 Q52 40 42 40"
          stroke="#CBD5E1"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Rand */}
        <line x1="8" y1="6" x2="40" y2="6" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />

        {/* Bodem */}
        <line x1="5" y1="67" x2="43" y2="67" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
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

/**
 * MiniGlassBar
 * Compacte versie voor in de lijstweergave:
 * klein bierglas + horizontale voortgangsbalk naast elkaar.
 */
export function MiniGlassBar({ pct = 0 }) {
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

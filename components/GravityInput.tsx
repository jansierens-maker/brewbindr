import React, { useEffect, useState } from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { sgToPlato, platoToSg, correctHydrometer, formatGravity, HYDROMETER_CALIBRATION_C, roundTo, brixToSg, sgToBrix, refractometerFg, DEFAULT_WCF } from '../services/calculations';

interface GravityInputProps {
  id: string;
  name: string;
  label: string;
  value: number | undefined; // always SG
  onChange: (sg: number | undefined) => void;
  disabled?: boolean;
  /** 'fg' = during/after fermentation: a refractometer reading needs the alcohol correction */
  kind?: 'og' | 'fg';
  /** Original gravity (SG), needed to correct a refractometer reading after fermentation */
  originalGravity?: number;
}

const toText = (sg: number | undefined, plato: boolean) =>
  sg === undefined || isNaN(sg) ? '' : plato ? String(roundTo(sgToPlato(sg), 1)) : String(roundTo(sg, 3));

/**
 * A measured gravity, entered in SG or °P (user preference) and stored as SG.
 * Optional: the temperature of the sample, to correct a hydrometer reading.
 */
const GravityInput: React.FC<GravityInputProps> = ({ id, name, label, value, onChange, disabled, kind = 'og', originalGravity }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const unit = preferences.gravityUnit ?? 'sg';
  const plato = unit === 'plato';
  const imperial = preferences.units === 'imperial';

  // Keep what the user types (e.g. "13." or "1.05") instead of reformatting on every key
  const [text, setText] = useState(toText(value, plato));
  const [tempText, setTempText] = useState('');
  const [brixText, setBrixText] = useState('');
  const wcf = preferences.refractometerWcf || DEFAULT_WCF;

  useEffect(() => {
    const typed = parseFloat(text);
    const typedSg = isNaN(typed) ? undefined : plato ? platoToSg(typed) : typed;
    const same = typedSg === undefined ? value === undefined : value !== undefined && Math.abs(typedSg - value) < (plato ? 0.0002 : 0.0005);
    if (!same) setText(toText(value, plato));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, plato]);

  const handleText = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw);
    if (isNaN(n)) return onChange(undefined);
    onChange(plato ? roundTo(platoToSg(n), 4) : n);
  };

  const tempInput = parseFloat(tempText);
  const tempC = isNaN(tempInput) ? undefined : imperial ? (tempInput - 32) * 5 / 9 : tempInput;
  const corrected = value !== undefined && !isNaN(value) && tempC !== undefined && Math.abs(tempC - HYDROMETER_CALIBRATION_C) >= 0.5
    ? correctHydrometer(value, tempC)
    : undefined;
  const brix = parseFloat(brixText);
  const hasOg = originalGravity !== undefined && !isNaN(originalGravity) && originalGravity > 1;
  const fromRefractometer = isNaN(brix) ? undefined
    : kind === 'og' ? brixToSg(brix, wcf)
    : hasOg ? refractometerFg(sgToBrix(originalGravity!, wcf), brix, wcf) : undefined;
  const calibrationLabel = imperial ? `${Math.round(HYDROMETER_CALIBRATION_C * 9 / 5 + 32)} °F` : `${HYDROMETER_CALIBRATION_C} °C`;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-bold text-stone-400 uppercase">{label} ({plato ? '°P' : 'SG'})</label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        step={plato ? '0.1' : '0.001'}
        min={plato ? -5 : 0.98}
        max={plato ? 45 : 1.2}
        disabled={disabled}
        className="w-full p-4 bg-stone-50 border rounded-xl font-bold text-lg disabled:opacity-50"
        value={text}
        onChange={e => handleText(e.target.value)}
      />
      {unit !== 'sg' && value !== undefined && !isNaN(value) && (
        <p className="text-[10px] font-bold text-stone-400">= {formatGravity(value, lang, plato ? 'sg' : 'plato')}</p>
      )}
      {!disabled && (
        <details className="pt-1 group">
          <summary className="text-[10px] font-bold text-stone-400 uppercase cursor-pointer select-none">{t('measurement_tools')}</summary>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <label htmlFor={`${id}_temp`} className="text-[10px] font-bold text-stone-400 uppercase">{t('measured_at_temp')}</label>
          <input
            id={`${id}_temp`}
            name={`${name}_temp`}
            type="number"
            inputMode="decimal"
            step="0.5"
            min={imperial ? 32 : 0}
            max={imperial ? 212 : 100}
            placeholder={imperial ? '68' : '20'}
            className="w-20 p-2 bg-stone-50 border rounded-lg text-sm font-bold"
            value={tempText}
            onChange={e => setTempText(e.target.value)}
          />
          <span className="text-[10px] font-bold text-stone-400">°{imperial ? 'F' : 'C'}</span>
          {corrected !== undefined && (
            <button
              type="button"
              onClick={() => { onChange(roundTo(corrected, 4)); setTempText(''); }}
              className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100"
            >
              {t('apply_temp_correction').replace('{temp}', calibrationLabel)}: {formatGravity(corrected, lang, unit)}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <label htmlFor={`${id}_brix`} className="text-[10px] font-bold text-stone-400 uppercase">{t('refractometer')}</label>
          <input
            id={`${id}_brix`}
            name={`${name}_brix`}
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            max={40}
            className="w-20 p-2 bg-stone-50 border rounded-lg text-sm font-bold"
            value={brixText}
            onChange={e => setBrixText(e.target.value)}
          />
          <span className="text-[10px] font-bold text-stone-400">°Bx</span>
          {fromRefractometer !== undefined && (
            <button
              type="button"
              onClick={() => { onChange(roundTo(fromRefractometer, 4)); setBrixText(''); }}
              className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100"
            >
              {t('use_value')}: {formatGravity(fromRefractometer, lang, unit)}
            </button>
          )}
          {kind === 'fg' && !isNaN(brix) && !hasOg && (
            <span className="text-[10px] font-bold text-red-500">{t('refractometer_needs_og')}</span>
          )}
        </div>
        {kind === 'fg' && <p className="text-[10px] text-stone-400 pt-1">{t('refractometer_fg_hint')}</p>}
        </details>
      )}
    </div>
  );
};

export default GravityInput;

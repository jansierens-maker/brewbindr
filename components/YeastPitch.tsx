import React from 'react';
import { BrewLogEntry, Culture } from '../types';
import { useTranslation } from '../App';
import {
  pitchRate, cellsNeeded, liquidViability, starterGrowth, starterFor, formatBrewNumber, formatGravity,
  DRY_CELLS_PER_GRAM, LIQUID_CELLS_PER_PACK, STARTER_DME_G_PER_L,
} from '../services/calculations';
import { useUser } from '../services/userContext';

type YeastPitchData = NonNullable<BrewLogEntry['yeast_pitch']>;

interface YeastPitchProps {
  cultures: Culture[];
  og: number | undefined;      // SG: measured, otherwise the recipe's
  volumeL: number;             // into the fermenter
  value: BrewLogEntry['yeast_pitch'];
  onChange: (value: YeastPitchData) => void;
  disabled?: boolean;
}

const RATES = [0.75, 1.0, 1.5, 2.0];

/** How much yeast a batch needs, what you have, and the starter that closes the gap. */
const YeastPitch: React.FC<YeastPitchProps> = ({ cultures, og, volumeL, value, onChange, disabled }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const yeastType = cultures.some(c => c.type === 'lager') ? 'lager' : 'ale';
  const data: YeastPitchData = value ?? {
    form: cultures[0]?.form === 'dry' ? 'dry' : 'liquid',
    amount: cultures[0]?.form === 'dry' ? 11.5 : 1,
  };
  const update = (patch: Partial<YeastPitchData>) => onChange({ ...data, ...patch });

  const gravity = og && og > 1 ? og : undefined;
  const rate = data.rate ?? (gravity ? pitchRate(yeastType, gravity) : yeastType === 'lager' ? 1.5 : 0.75);
  const needed = gravity ? cellsNeeded(gravity, volumeL, rate) : 0;
  const viability = data.form === 'liquid' ? liquidViability(data.production_date) : 1;
  const available = data.form === 'dry'
    ? (data.amount || 0) * DRY_CELLS_PER_GRAM
    : (data.amount || 0) * LIQUID_CELLS_PER_PACK * viability;
  const enough = needed > 0 && available >= needed;
  const starterL = !enough && data.form === 'liquid' && available > 0 ? starterFor(available, needed) : undefined;
  const fmt = (n: number) => formatBrewNumber(Math.round(n), 'default', lang);
  const fmt1 = (n: number) => formatBrewNumber(n, 'default', lang);
  const liters = (l: number) => preferences.units === 'imperial' ? `${formatBrewNumber(l / 3.78541, 'default', lang)} gal` : `${fmt1(l)} L`;

  const field = 'w-full p-3 bg-white border border-stone-200 rounded-xl font-bold disabled:opacity-50';

  return (
    <div className="space-y-4 p-5 bg-purple-50/40 rounded-2xl border border-purple-100">
      <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
        <i className="fas fa-vial text-purple-600 mr-2" aria-hidden="true"></i>{t('yeast_pitch')}
      </h4>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label htmlFor="pitch_form" className="text-[10px] font-bold text-stone-400 uppercase">{t('yeast_form')}</label>
          <select id="pitch_form" name="pitch_form" disabled={disabled} className={field} value={data.form}
            onChange={e => update({ form: e.target.value as YeastPitchData['form'], amount: e.target.value === 'dry' ? 11.5 : 1 })}>
            <option value="dry">{t('yeast_dry')}</option>
            <option value="liquid">{t('yeast_liquid')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pitch_amount" className="text-[10px] font-bold text-stone-400 uppercase">
            {data.form === 'dry' ? t('yeast_grams') : t('yeast_packs')}
          </label>
          <input id="pitch_amount" name="pitch_amount" type="number" inputMode="decimal" disabled={disabled} className={field}
            min={0} max={data.form === 'dry' ? 500 : 20} step={data.form === 'dry' ? 0.5 : 1}
            value={data.amount ?? ''} onChange={e => update({ amount: parseFloat(e.target.value) || 0 })} />
        </div>
        {data.form === 'liquid' && (
          <div className="space-y-1">
            <label htmlFor="pitch_date" className="text-[10px] font-bold text-stone-400 uppercase">{t('yeast_production_date')}</label>
            <input id="pitch_date" name="pitch_date" type="date" disabled={disabled} className={field}
              value={data.production_date ?? ''} onChange={e => update({ production_date: e.target.value || undefined })} />
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="pitch_rate" className="text-[10px] font-bold text-stone-400 uppercase">{t('pitch_rate')}</label>
          <select id="pitch_rate" name="pitch_rate" disabled={disabled} className={field} value={data.rate ?? ''}
            onChange={e => update({ rate: e.target.value ? parseFloat(e.target.value) : undefined })}>
            <option value="">{t('pitch_rate_auto').replace('{rate}', fmt1(rate))}</option>
            {RATES.map(r => <option key={r} value={r}>{fmt1(r)}</option>)}
          </select>
        </div>
      </div>

      {!gravity ? (
        <p className="text-xs font-bold text-stone-500">{t('pitch_needs_og')}</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="text-stone-600">
            {t('cells_needed')}: <span className="font-black text-stone-900">{fmt(needed)} {t('billion_cells')}</span>
            <span className="text-[10px] text-stone-400"> ({liters(volumeL)}, {formatGravity(gravity, lang, preferences.gravityUnit)}, {t(yeastType === 'lager' ? 'yeast_lager' : 'yeast_ale')})</span>
          </p>
          <p className="text-stone-600">
            {t('cells_available')}: <span className="font-black text-stone-900">{fmt(available)} {t('billion_cells')}</span>
            {data.form === 'liquid' && data.production_date && (
              <span className="text-[10px] text-stone-400"> ({t('viability')} {Math.round(viability * 100)} %)</span>
            )}
          </p>
          <p className={`font-black ${enough ? 'text-green-700' : 'text-amber-800'}`} role="status">
            {enough
              ? t('pitch_enough')
              : data.form === 'dry'
                ? t('pitch_use_dry').replace('{grams}', fmt1(Math.ceil(needed / DRY_CELLS_PER_GRAM * 2) / 2))
                : starterL !== undefined
                  ? t('pitch_starter')
                      .replace('{volume}', liters(starterL))
                      .replace('{dme}', fmt(starterL * STARTER_DME_G_PER_L))
                      .replace('{cells}', fmt(starterGrowth(available, starterL)))
                  : t('pitch_step_starter')}
          </p>
          {!enough && data.form === 'liquid' && starterL !== undefined && (
            <p className="text-[10px] text-stone-400">{t('pitch_starter_hint')}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default YeastPitch;

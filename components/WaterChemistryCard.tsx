import React, { useMemo } from 'react';
import { LibraryIngredient, Recipe } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { formatBrewNumber, roundTo, waterPlan, normalizeFermentableType, defaultWaterProfile } from '../services/calculations';
import { WaterKind, resolveWater, waterOptions } from '../services/waterProfiles';
import {
  CaCl2Form, ION_KEYS, Ions, SALTS, SaltId, ionsOf, ratioCharacter, residualAlkalinity,
  suggestSalts, sulfateChlorideRatio, treatedWater, estimateMashPh, lacticAcidFor, DEFAULT_TARGET_MASH_PH, MashMalt,
} from '../services/waterChemistry';

type WaterChem = NonNullable<Recipe['water_chem']>;

interface Props {
  recipe: Recipe;
  library: LibraryIngredient[];
  equipment: LibraryIngredient | undefined;
  /** Editor only; without it the card shows what to add on brew day */
  onChange?: (value: WaterChem | undefined) => void;
}

const ION_LABELS: Record<keyof Ions, string> = { ca: 'Ca', mg: 'Mg', na: 'Na', cl: 'Cl', so4: 'SO₄', hco3: 'HCO₃' };
const SALT_KEYS = {
  gypsum: 'salt_gypsum', cacl2: 'salt_cacl2', cacl2_33: 'salt_cacl2_33', cacl2_36: 'salt_cacl2_36',
  epsom: 'salt_epsom', nacl: 'salt_nacl', nahco3: 'salt_nahco3',
} as const satisfies Record<SaltId, string>;
const CHARACTER_KEYS = { bitter: 'water_bitter', balanced: 'water_balanced', malty: 'water_malty' } as const;

/** Water treatment: source water, dilution, salts, the resulting profile against a target. */
const WaterChemistryCard: React.FC<Props> = ({ recipe, library, equipment, onChange }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const chem: WaterChem = recipe.water_chem ?? {};
  const editable = !!onChange;
  const options = useMemo(() => ({ base: waterOptions(library, 'base'), target: waterOptions(library, 'target') }), [library]);

  // Profiles: a library id, or 'preset:<key>' from before #174. Default base water: the brewery's default (★) or only one.
  const resolve = (ref: string | undefined) => resolveWater(ref, library);
  const defaultSource = useMemo(() => defaultWaterProfile(library), [library]);
  const source = resolve(chem.source) ?? (defaultSource && { name: defaultSource.name, ions: ionsOf(defaultSource) });
  const target = resolve(chem.target);
  const cacl2Form: CaCl2Form = chem.cacl2_form ?? 'cacl2_33';
  const salts = chem.salts ?? {};

  // All salts go into the mash, the profile is for all brewing water together
  const plan = equipment ? waterPlan(recipe, equipment) : undefined;
  const batchL = recipe.batch_size?.unit === 'gallons' ? recipe.batch_size.value * 3.78541 : recipe.batch_size?.value || 0;
  const volumeL = plan?.totalWaterL || batchL;

  const start = source ? treatedWater(source.ions, chem.dilution_pct || 0, {}, volumeL) : undefined;
  const result = source ? treatedWater(source.ions, chem.dilution_pct || 0, salts, volumeL) : undefined;
  const ratio = result ? sulfateChlorideRatio(result) : undefined;

  // Mash pH: the mashed malts with the mash water (all salts are in it)
  const malts: MashMalt[] = (recipe.ingredients?.fermentables ?? [])
    .filter(f => ['grain', 'adjunct'].includes(normalizeFermentableType(f.type)))
    .map(f => {
      const v = f.amount?.value || 0;
      const kg = f.amount?.unit === 'pounds' ? v * 0.453592 : v;
      return { name: f.name, kg, colorSrm: f.color?.value || 2 };
    });
  const grainKg = malts.reduce((s, m) => s + m.kg, 0);
  const mashL = plan?.mashWaterL || grainKg * 3;
  const mashIons = source && mashL > 0 ? treatedWater(source.ions, chem.dilution_pct || 0, salts, mashL) : undefined;
  const targetPh = chem.target_ph ?? DEFAULT_TARGET_MASH_PH;
  const phWithout = mashIons ? estimateMashPh(malts, mashIons, mashL) : undefined;
  const phWith = mashIons && chem.lactic_ml ? estimateMashPh(malts, mashIons, mashL, chem.lactic_ml) : phWithout;
  const acidNeeded = mashIons ? lacticAcidFor(malts, mashIons, mashL, targetPh) : 0;
  const phClass = (ph: number | undefined) => ph === undefined ? 'text-stone-900' : ph >= 5.2 && ph <= 5.6 ? 'text-green-700' : 'text-amber-800';
  const ph = (n: number | undefined) => n === undefined ? '-' : formatBrewNumber(n, 'default', lang);
  const character = ratioCharacter(ratio);

  const update = (patch: Partial<WaterChem>) => {
    const next: WaterChem = { ...chem, ...patch };
    (Object.keys(next) as (keyof WaterChem)[]).forEach(k => next[k] === undefined && delete next[k]);
    onChange?.(Object.keys(next).length ? next : undefined);
  };
  const setSalt = (id: SaltId, raw: string) => {
    const n = parseFloat(raw);
    const nextSalts: WaterChem['salts'] = { ...salts };
    if (isNaN(n) || n <= 0) delete nextSalts[id]; else nextSalts[id] = roundTo(n, 1);
    update({ salts: Object.keys(nextSalts).length ? nextSalts : undefined });
  };
  const suggest = () => {
    if (!start || !target) return;
    update({ salts: suggestSalts(start, target.ions, volumeL, cacl2Form) });
  };

  const fmt = (n: number) => formatBrewNumber(Math.round(n), 'default', lang);
  const vol = (l: number) => preferences.units === 'imperial'
    ? `${formatBrewNumber(l / 3.78541, 'default', lang)} gal` : `${formatBrewNumber(l, 'vol', lang)} L`;
  const field = 'w-full p-2 bg-white border border-stone-200 rounded-lg text-sm font-bold';
  // Base water lists base waters, target lists target profiles (#174): own ones first, then the public library.
  // A profile the recipe already uses stays selectable, also when it is of the other kind.
  const profileOptions = (kind: WaterKind, current: string | undefined) => {
    const { own, public: pub } = options[kind];
    const listed = [...own, ...pub].some(w => w.id === current || (current?.startsWith('preset:') && w.preset_key === current.slice(7)));
    const extra = current && !listed ? resolve(current) : undefined;
    return (
      <>
        {extra && <option value={current}>{extra.name}</option>}
        {own.length > 0 && (
          <optgroup label={t('water_own_profiles')}>
            {own.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </optgroup>
        )}
        {pub.length > 0 && (
          <optgroup label={t('public_library')}>
            {pub.map(w => <option key={w.id} value={w.preset_key && current === `preset:${w.preset_key}` ? current : w.id}>{w.name}</option>)}
          </optgroup>
        )}
      </>
    );
  };
  const saltIds: SaltId[] = ['gypsum', cacl2Form, 'epsom', 'nacl', 'nahco3'];
  const usedSalts = (Object.keys(salts) as SaltId[]).filter(id => (salts[id] || 0) > 0);

  return (
    <div className="space-y-4 p-5 bg-teal-50/50 rounded-2xl border border-teal-100">
      <h4 className="font-bold uppercase text-stone-900 flex items-center gap-2">
        <i className="fas fa-flask text-teal-600" aria-hidden="true"></i> {t('water_treatment')}
      </h4>

      {editable && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label htmlFor="chem_source" className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('water_source')}</label>
            <select id="chem_source" name="chem_source" className={field} value={chem.source ?? ''} onChange={e => update({ source: e.target.value || undefined })}>
              <option value="">{defaultSource ? t('equipment_default').replace('{name}', defaultSource.name) : t('water_choose')}</option>
              {profileOptions('base', chem.source)}
            </select>
          </div>
          <div>
            <label htmlFor="chem_dilution" className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('water_dilution')}</label>
            <input id="chem_dilution" name="chem_dilution" type="number" inputMode="decimal" min={0} max={100} step={5} placeholder="0"
              className={field} key={`dil-${chem.dilution_pct ?? ''}`} defaultValue={chem.dilution_pct ?? ''}
              onBlur={e => { const n = parseFloat(e.target.value); update({ dilution_pct: isNaN(n) || n <= 0 ? undefined : Math.min(100, n) }); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
          </div>
          <div>
            <label htmlFor="chem_target" className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('water_target')}</label>
            <select id="chem_target" name="chem_target" className={field} value={chem.target ?? ''} onChange={e => update({ target: e.target.value || undefined })}>
              <option value="">{t('water_no_target')}</option>
              {profileOptions('target', chem.target)}
            </select>
          </div>
          <div>
            <label htmlFor="chem_cacl2_form" className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('salt_cacl2_form')}</label>
            <select id="chem_cacl2_form" name="chem_cacl2_form" className={field} value={cacl2Form}
              onChange={e => {
                const form = e.target.value as CaCl2Form;
                // Move an amount already entered to the new form
                const nextSalts: WaterChem['salts'] = { ...salts };
                delete nextSalts.cacl2; delete nextSalts.cacl2_33; delete nextSalts.cacl2_36;
                update({ cacl2_form: form, salts: Object.keys(nextSalts).length ? nextSalts : undefined });
              }}>
              <option value="cacl2_33">{t('salt_cacl2_33')}</option>
              <option value="cacl2_36">{t('salt_cacl2_36')}</option>
              <option value="cacl2">{t('salt_cacl2')}</option>
            </select>
          </div>
        </div>
      )}

      {!source ? (
        <p className="text-xs font-bold text-stone-500">{t('water_needs_source')}</p>
      ) : (
        <>
          {editable ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {saltIds.map(id => (
                <div key={id} className="flex flex-col justify-between gap-1">
                  <label htmlFor={`salt_${id}`} className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t(SALT_KEYS[id])} ({SALTS[id].unit})</label>
                  <input id={`salt_${id}`} name={`salt_${id}`} type="number" inputMode="decimal" min={0} max={100} step={0.1} placeholder="0"
                    className={field} key={`${id}-${salts[id] ?? ''}`} defaultValue={salts[id] ?? ''}
                    onBlur={e => setSalt(id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
                </div>
              ))}
            </div>
          ) : usedSalts.length > 0 || chem.dilution_pct || chem.lactic_ml ? (
            <ul className="text-sm font-bold text-stone-800 space-y-1">
              {chem.dilution_pct ? <li>{t('water_dilution_line').replace('{pct}', fmt(chem.dilution_pct)).replace('{l}', vol(volumeL * chem.dilution_pct / 100))}</li> : null}
              {usedSalts.map(id => <li key={id}>{formatBrewNumber(salts[id]!, 'default', lang)} {SALTS[id].unit} {t(SALT_KEYS[id])}</li>)}
              {chem.lactic_ml ? <li>{formatBrewNumber(chem.lactic_ml, 'default', lang)} ml {t('lactic_acid_80')}</li> : null}
            </ul>
          ) : (
            <p className="text-xs font-bold text-stone-500">{t('water_no_salts')}</p>
          )}

          {editable && target && (
            <button type="button" onClick={suggest} className="text-xs font-black uppercase text-teal-800 bg-teal-100 border border-teal-200 rounded-lg px-4 py-2 hover:bg-teal-200">
              <i className="fas fa-magic mr-2" aria-hidden="true"></i>{t('water_suggest').replace('{name}', target.name)}
            </button>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black text-stone-500 uppercase tracking-widest text-right">
                  <th className="text-left py-1">mg/L</th>
                  {ION_KEYS.map(k => <th key={k} className="py-1 px-2">{ION_LABELS[k]}</th>)}
                </tr>
              </thead>
              <tbody className="font-bold text-right">
                <tr className="text-stone-500">
                  <td className="text-left py-1">{source.name}{chem.dilution_pct ? ` (−${fmt(chem.dilution_pct)} %)` : ''}</td>
                  {ION_KEYS.map(k => <td key={k} className="px-2">{fmt(start![k])}</td>)}
                </tr>
                <tr className="text-stone-900">
                  <td className="text-left py-1">{t('water_result')}</td>
                  {ION_KEYS.map(k => <td key={k} className="px-2">{fmt(result![k])}</td>)}
                </tr>
                {target && (
                  <tr className="text-teal-800">
                    <td className="text-left py-1">{target.name}</td>
                    {ION_KEYS.map(k => <td key={k} className="px-2">{fmt(target.ions[k])}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-stone-600">{t('residual_alkalinity')}: <b className="text-stone-900">{fmt(residualAlkalinity(result!))} ppm</b></span>
            <span className="text-stone-600">SO₄/Cl: <b className="text-stone-900">
              {ratio === undefined ? '-' : ratio === Infinity ? '∞' : formatBrewNumber(ratio, 'default', lang)}
              {character && ` (${t(CHARACTER_KEYS[character])})`}
            </b></span>
            {result!.ca < 40 && <span className="text-amber-800 font-bold">{t('water_low_calcium')}</span>}
          </div>
          {phWithout !== undefined && (
            <div className="p-4 bg-white rounded-xl border border-teal-100 space-y-3">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <p className="text-sm text-stone-600">{t('mash_ph_estimated')}: <b className={`text-xl ${phClass(phWith)}`}>{ph(phWith)}</b>
                  {chem.lactic_ml ? <span className="text-xs text-stone-500"> ({t('mash_ph_without_acid')} {ph(phWithout)})</span> : null}
                </p>
                {editable ? (
                  <>
                    <div>
                      <label htmlFor="chem_target_ph" className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('mash_ph_target')}</label>
                      <input id="chem_target_ph" name="chem_target_ph" type="number" inputMode="decimal" min={5} max={6} step={0.05}
                        className="w-24 p-2 bg-white border border-stone-200 rounded-lg text-sm font-bold" placeholder={String(DEFAULT_TARGET_MASH_PH)}
                        key={`tph-${chem.target_ph ?? ''}`} defaultValue={chem.target_ph ?? ''}
                        onBlur={e => { const n = parseFloat(e.target.value); update({ target_ph: isNaN(n) || n < 5 || n > 6 ? undefined : n }); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
                    </div>
                    <div>
                      <label htmlFor="chem_lactic" className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('lactic_acid_80')} (ml)</label>
                      <input id="chem_lactic" name="chem_lactic" type="number" inputMode="decimal" min={0} max={100} step={0.1} placeholder="0"
                        className="w-24 p-2 bg-white border border-stone-200 rounded-lg text-sm font-bold"
                        key={`lac-${chem.lactic_ml ?? ''}`} defaultValue={chem.lactic_ml ?? ''}
                        onBlur={e => { const n = parseFloat(e.target.value); update({ lactic_ml: isNaN(n) || n <= 0 ? undefined : roundTo(n, 1) }); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
                    </div>
                    {acidNeeded > 0 && acidNeeded !== chem.lactic_ml && (
                      <button type="button" onClick={() => update({ lactic_ml: acidNeeded })}
                        className="text-xs font-black uppercase text-teal-800 bg-teal-100 border border-teal-200 rounded-lg px-4 py-2 hover:bg-teal-200">
                        {t('lactic_use').replace('{ml}', formatBrewNumber(acidNeeded, 'default', lang)).replace('{ph}', ph(targetPh))}
                      </button>
                    )}
                  </>
                ) : null}
              </div>
              {editable && acidNeeded === 0 && phWithout < targetPh - 0.05 && (
                <p className="text-xs font-bold text-amber-800">{t('mash_ph_below_target')}</p>
              )}
              <p className="text-[10px] text-stone-500">{t('mash_ph_hint').replace('{volume}', vol(mashL))}</p>
            </div>
          )}

          <p className="text-[10px] text-stone-500">
            {t('water_chem_hint').replace('{volume}', vol(volumeL))}{!plan && ` ${t('water_chem_no_equipment')}`}
          </p>
        </>
      )}
    </div>
  );
};

export default WaterChemistryCard;

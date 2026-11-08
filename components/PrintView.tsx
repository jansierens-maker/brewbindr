
import React from 'react';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from '../types';
import { useTranslation } from '../App';
import { calculateABV, calculateRecipeStats, equipmentCapacity, formatBrewNumber, formatGravity, waterPlan, WaterWarning } from '../services/calculations';
import { SALTS, SaltId } from '../services/waterChemistry';
import { scaleRecipe } from '../services/scaling';
import { useUser } from '../services/userContext';

interface PrintViewProps {
  recipe?: Recipe;
  log?: BrewLogEntry;
  tastingNote?: TastingNote;
  /** The recipe's brewing installation, for the water volumes */
  equipment?: LibraryIngredient;
}

const SALT_KEYS = {
  gypsum: 'salt_gypsum', cacl2: 'salt_cacl2', cacl2_33: 'salt_cacl2_33', cacl2_36: 'salt_cacl2_36',
  epsom: 'salt_epsom', nacl: 'salt_nacl', nahco3: 'salt_nahco3',
} as const satisfies Record<SaltId, string>;

const WARNING_KEYS = {
  mash_capped: 'water_warn_mash_capped',
  too_much_grain: 'water_warn_too_much_grain',
  grain_over_capacity: 'water_warn_grain_over_capacity',
  mash_over_capacity: 'water_warn_mash_over_capacity',
  boil_over_capacity: 'water_warn_boil_over_capacity',
} as const satisfies Record<WaterWarning, string>;

const PrintView: React.FC<PrintViewProps> = ({ recipe: baseRecipe, log, tastingNote, equipment }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();

  if (!baseRecipe) return null;
  // A brew made at another size shows the amounts it was brewed with
  const recipe = log?.scale ? scaleRecipe(baseRecipe, log.scale.factor) : baseRecipe;

  // Water: the same calculation as in the recipe (own values where set)
  const plannedOg = equipment ? calculateRecipeStats(recipe, undefined, equipment).plannedOg : undefined;
  const plan = equipment ? waterPlan(recipe, equipment, plannedOg) : undefined;
  const volUnit = preferences.units === 'imperial' ? 'Gal' : 'L';
  const tempUnit = preferences.units === 'imperial' ? '°F' : '°C';
  const vol = (l: number) => `${formatBrewNumber(l, 'vol', lang, preferences)} ${volUnit}`;
  const chem = recipe.water_chem;
  const salts = chem?.salts || {};
  const usedSalts = (Object.keys(SALT_KEYS) as SaltId[]).filter(id => (salts[id] ?? 0) > 0);
  const hasTreatment = !!(chem && (usedSalts.length > 0 || chem.dilution_pct || chem.lactic_ml));

  const abv = log 
    ? calculateABV(log.measurements.actual_og, log.measurements.actual_fg, log.status === 'bottled', (log.bottling?.method === 'keg' ? 0 : log.bottling?.sugar_amount), log.bottling?.bottling_volume || log.measurements.actual_volume)
    : recipe.specifications?.abv?.value;

  return (
    <div className="block print:block bg-white p-8 text-stone-900 text-sm font-sans">
      <div className="border-b-4 border-stone-900 pb-4 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif font-bold italic text-stone-900">{recipe.name}</h1>
          <p className="text-stone-500 font-bold uppercase tracking-widest text-xs mt-1">
            {log ? t('print_report') : t('print_recipe')} • {recipe.author || 'brewbindr'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-stone-400 tracking-tighter">{t('date_label')}</p>
          <p className="font-bold text-lg">{log?.brewDate || new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('og_label')}</p>
          <p className="text-xl font-black">{formatGravity(log?.measurements.actual_og || recipe.specifications?.og?.value, lang, preferences.gravityUnit)}</p>
        </div>
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('fg_label')}</p>
          <p className="text-xl font-black">{formatGravity(log?.measurements.actual_fg || recipe.specifications?.fg?.value, lang, preferences.gravityUnit)}</p>
        </div>
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('abv_label')}</p>
          <p className="text-xl font-black">{formatBrewNumber(abv, 'abv', lang, preferences)}%</p>
        </div>
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('target_ibu')}</p>
          <p className="text-xl font-black">{recipe.specifications?.ibu?.value || '-'}</p>
        </div>
      </div>

      <div className="space-y-12">
        {recipe.notes && (
          <section>
            <h2 className="text-lg font-black uppercase border-b-2 border-stone-900 pb-2 mb-4">{t('recipe_summary')}</h2>
            <p className="whitespace-pre-wrap leading-relaxed italic text-stone-700">{recipe.notes}</p>
          </section>
        )}

        {recipe.mash && recipe.mash.steps.length > 0 && (
          <section>
            <h2 className="text-lg font-black uppercase border-b-2 border-stone-900 pb-2 mb-4">{t('mash_profile')} - {recipe.mash.name}</h2>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-stone-200 text-[10px] uppercase text-stone-400">
                  <th className="py-2">{t('step_name')}</th>
                  <th className="py-2">{t('mash_type')}</th>
                  <th className="py-2">{t('step_temp')}</th>
                  <th className="py-2">{t('step_time')}</th>
                  <th className="py-2 text-right">{t('infuse_amount')}</th>
                </tr>
              </thead>
              <tbody>
                {recipe.mash.steps.map((step, i) => (
                  <tr key={i} className="border-b border-stone-100">
                    <td className="py-3 font-bold text-stone-900">{step.name}</td>
                    <td className="py-3 capitalize text-stone-500">{step.type}</td>
                    <td className="py-3">{formatBrewNumber(step.step_temp, 'temp', lang, preferences)}°{preferences.units === 'imperial' ? 'F' : 'C'}</td>
                    <td className="py-3">{step.step_time} min</td>
                    <td className="py-3 text-right">{step.infuse_amount ? `${formatBrewNumber(step.infuse_amount, 'vol', lang, preferences)} ${preferences.units === 'imperial' ? 'Gal' : 'L'}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {(plan || hasTreatment) && (
          <section className="page-break-inside-avoid">
            <h2 className="text-lg font-black uppercase border-b-2 border-stone-900 pb-2 mb-4">
              {t('water_plan')}{equipment ? ` - ${equipment.name}` : ''}
            </h2>
            <div className="grid grid-cols-2 gap-12">
              {plan && (
                <div>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">
                    {plan.manual ? t('water_own') : t('water_suggested')}{recipe.water?.drain_all ? ` · ${t('drain_all_on')}` : ''}
                  </p>
                  <table className="w-full text-left">
                    <tbody>
                      <tr className="border-b border-stone-100"><td className="py-2">{t('water_mash')}</td><td className="py-2 text-right font-bold">{vol(plan.mashWaterL)}</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2">{t('water_sparge')}</td><td className="py-2 text-right font-bold">{vol(plan.spargeWaterL)}</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2">{t('water_total')}</td><td className="py-2 text-right font-bold">{vol(plan.totalWaterL)}</td></tr>
                      {plan.strikeTempC !== undefined && (
                        <tr className="border-b border-stone-100"><td className="py-2">{t('strike_temp')}</td><td className="py-2 text-right font-bold">{formatBrewNumber(plan.strikeTempC, 'temp', lang, preferences)}{tempUnit}</td></tr>
                      )}
                      <tr className="border-b border-stone-100"><td className="py-2">{t('pre_boil_volume')}</td><td className="py-2 text-right font-bold">{vol(plan.preBoilL)}</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2">{t('post_boil_volume')}</td><td className="py-2 text-right font-bold">{vol(plan.postBoilL)}</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2">{t('into_fermenter')}</td><td className="py-2 text-right font-bold">{vol(plan.intoFermenterL)}</td></tr>
                      {plan.preBoilSg !== undefined && (
                        <tr className="border-b border-stone-100"><td className="py-2">{t('pre_boil_gravity')}</td><td className="py-2 text-right font-bold">{formatGravity(plan.preBoilSg, lang, preferences.gravityUnit)}</td></tr>
                      )}
                    </tbody>
                  </table>
                  {plan.warnings.length > 0 && equipment && (
                    <ul className="mt-3 space-y-1">
                      {plan.warnings.map(w => (
                        <li key={w} className="text-xs font-bold">
                          ⚠ {t(WARNING_KEYS[w])
                            .replace('{max}', plan.maxMashL !== undefined ? vol(plan.maxMashL) : '-')
                            .replace('{boil}', vol(equipmentCapacity(equipment).boilCapacity ?? 0))
                            .replace('{kg}', formatBrewNumber(equipmentCapacity(equipment).maxGrainKg ?? 0, 'kg', lang))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {hasTreatment && chem && (
                <div>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('water_treatment')}</p>
                  <ul className="space-y-1 font-bold">
                    {chem.dilution_pct && plan ? <li>{t('water_dilution_line').replace('{pct}', formatBrewNumber(chem.dilution_pct, 'default', lang)).replace('{l}', vol(plan.totalWaterL * chem.dilution_pct / 100))}</li> : null}
                    {usedSalts.map(id => <li key={id}>{formatBrewNumber(salts[id]!, 'default', lang)} {SALTS[id].unit} {t(SALT_KEYS[id])}</li>)}
                    {chem.lactic_ml ? <li>{formatBrewNumber(chem.lactic_ml, 'default', lang)} ml {t('lactic_acid_80')}</li> : null}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-black uppercase border-b-2 border-stone-900 pb-2 mb-4">{t('ingredients_header')}</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-black text-stone-500 uppercase mb-2 tracking-widest">{t('grains')}</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-stone-200 text-[10px] uppercase text-stone-400">
                    <th className="py-2">{t('name_label')}</th>
                    <th className="py-2">{t('amount_label')}</th>
                    <th className="py-2 text-right">{t('color')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.ingredients.fermentables.map((f, i) => (
                    <tr key={i} className="border-b border-stone-100">
                      <td className="py-3 font-bold text-stone-900">{f.name}</td>
                      <td className="py-3">{formatBrewNumber(f.amount.value, 'kg', lang, preferences)} {f.amount?.unit === 'pounds' ? 'lb' : 'kg'}</td>
                      <td className="py-3 text-right">{formatBrewNumber(f.color?.value, 'color', lang, preferences)} {preferences.colorScale.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-12">
              <div>
                <h3 className="text-xs font-black text-stone-500 uppercase mb-2 tracking-widest">{t('hops')}</h3>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-stone-200 text-[10px] uppercase text-stone-400">
                      <th className="py-2">{t('name_label')}</th>
                      <th className="py-2">{t('time_short')}</th>
                      <th className="py-2 text-right">{t('amount_label')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipe.ingredients.hops.map((h, i) => (
                      <tr key={i} className="border-b border-stone-100">
                        <td className="py-3 font-bold text-stone-900">{h.name} ({h.alpha_acid?.value}%)</td>
                        <td className="py-3">{h.time?.value ?? 0} min</td>
                        <td className="py-3 text-right">{formatBrewNumber(h.amount.value, 'g', lang, preferences)} {h.amount?.unit === 'ounces' ? 'oz' : 'g'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-xs font-black text-stone-500 uppercase mb-2 tracking-widest">{t('yeast')}</h3>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-stone-200 text-[10px] uppercase text-stone-400">
                      <th className="py-2">{t('name_label')}</th>
                      <th className="py-2 text-right">{t('atten_short')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipe.ingredients.cultures.map((c, i) => (
                      <tr key={i} className="border-b border-stone-100">
                        <td className="py-3 font-bold text-stone-900">{c.name}</td>
                        <td className="py-3 text-right">{c.attenuation}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {log && (
          <section className="bg-stone-50 p-8 rounded-2xl border border-stone-200 page-break-inside-avoid">
            <h2 className="text-lg font-black uppercase border-b-2 border-stone-300 pb-2 mb-6 tracking-wider">{t('brew_summary')}</h2>
            <div className="grid grid-cols-2 gap-12">
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{t('brew_notes')}</p>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed text-stone-800">{log.notes || 'No notes recorded.'}</p>
                </div>
              </div>
              <div className="space-y-6">
                 <div className="bg-white p-4 rounded-xl border border-stone-200">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 border-b border-stone-100 pb-2">{t('bottling')}</p>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      <p className="flex justify-between"><span>{t('date_label')}:</span> <span className="font-bold">{log.bottling?.date || '-'}</span></p>
                      <p className="flex justify-between"><span>{t('volume_label')}:</span> <span className="font-bold">{formatBrewNumber(log.bottling?.bottling_volume, 'vol', lang, preferences)} {preferences.units === 'imperial' ? 'Gal' : 'L'}</span></p>
                      <p className="flex justify-between"><span>{t('sugar_label')}:</span> <span className="font-bold">{(log.bottling?.method === 'keg' ? 0 : log.bottling?.sugar_amount)} g ({log.bottling?.sugar_type})</span></p>
                      <p className="flex justify-between"><span>CO2:</span> <span className="font-bold">{log.bottling?.target_co2} vol</span></p>
                    </div>
                 </div>
              </div>
            </div>
          </section>
        )}

        {tastingNote && (
          <section className="page-break-inside-avoid">
            <h2 className="text-lg font-black uppercase border-b-2 border-stone-900 pb-2 mb-6 tracking-wider">{t('tasting_notes')}</h2>
            <div className="grid grid-cols-5 gap-4 mb-8">
              {['appearance', 'aroma', 'flavor', 'mouthfeel', 'overall'].map(key => (
                <div key={key} className="text-center bg-stone-50 p-3 rounded-lg border border-stone-100">
                  <p className="text-[8px] font-black text-stone-400 uppercase tracking-tighter">{(t as any)(key)}</p>
                  <p className="text-2xl font-black text-stone-900">{(tastingNote as any)[key]}/5</p>
                </div>
              ))}
            </div>
            <div className="p-6 bg-stone-50 rounded-xl border border-stone-100 italic text-stone-700 leading-relaxed border-l-4 border-stone-900">
              "{tastingNote.comments}"
            </div>
          </section>
        )}
      </div>

      <div className="mt-20 flex justify-between text-[9px] font-black uppercase text-stone-400 border-t-2 border-stone-100 pt-6 tracking-widest">
        <span>{t('generated_by')} BrewBindr</span>
        <span>{new Date().toLocaleString()}</span>
      </div>
    </div>
  );
};

export default PrintView;

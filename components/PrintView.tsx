
import React from 'react';
import { Recipe, BrewLogEntry, TastingNote } from '../types';
import { useTranslation } from '../App';
import { calculateABV, formatBrewNumber } from '../services/calculations';
import { useUser } from '../services/userContext';

interface PrintViewProps {
  recipe?: Recipe;
  log?: BrewLogEntry;
  tastingNote?: TastingNote;
}

const PrintView: React.FC<PrintViewProps> = ({ recipe, log, tastingNote }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();

  if (!recipe) return null;

  const abv = log 
    ? calculateABV(log.measurements.actual_og, log.measurements.actual_fg, log.status === 'bottled', log.bottling?.sugar_amount, log.bottling?.bottling_volume || log.measurements.actual_volume)
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
          <p className="text-[10px] font-black uppercase text-stone-400 tracking-tighter">Date</p>
          <p className="font-bold text-lg">{log?.brewDate || new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('og_label')}</p>
          <p className="text-xl font-black">{log?.measurements.actual_og?.toFixed(3) || recipe.specifications?.og?.value?.toFixed(3) || '-'}</p>
        </div>
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('fg_label')}</p>
          <p className="text-xl font-black">{log?.measurements.actual_fg?.toFixed(3) || recipe.specifications?.fg?.value?.toFixed(3) || '-'}</p>
        </div>
        <div className="border-2 border-stone-900 p-3 rounded-lg">
          <p className="text-[9px] font-black uppercase text-stone-400 mb-1">{t('abv_label')}</p>
          <p className="text-xl font-black">{abv}%</p>
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

        <section>
          <h2 className="text-lg font-black uppercase border-b-2 border-stone-900 pb-2 mb-4">{t('ingredients_header')}</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-black text-stone-500 uppercase mb-2 tracking-widest">{t('grains')}</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-stone-200 text-[10px] uppercase text-stone-400">
                    <th className="py-2">Name</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2 text-right">Color</th>
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
                      <th className="py-2">Name</th>
                      <th className="py-2">Time</th>
                      <th className="py-2 text-right">Amount</th>
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
                      <th className="py-2">Name</th>
                      <th className="py-2 text-right">Atten..</th>
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
                      <p className="flex justify-between"><span>Date:</span> <span className="font-bold">{log.bottling?.date || '-'}</span></p>
                      <p className="flex justify-between"><span>Volume:</span> <span className="font-bold">{formatBrewNumber(log.bottling?.bottling_volume, 'vol', lang, preferences)} {preferences.units === 'imperial' ? 'Gal' : 'L'}</span></p>
                      <p className="flex justify-between"><span>Sugar:</span> <span className="font-bold">{log.bottling?.sugar_amount} g ({log.bottling?.sugar_type})</span></p>
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
        <span>Generated by brewbindr</span>
        <span>{new Date().toLocaleString()}</span>
      </div>
    </div>
  );
};

export default PrintView;

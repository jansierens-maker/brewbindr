
import React, { useState, useMemo, useEffect } from 'react';
import { Recipe, BrewLogEntry, LibraryIngredient } from '../types';
import { calculateABV, calculatePrimingSugar, calculateRecipeStats, formatBrewNumber, kegPressure } from '../services/calculations';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { canManageBrews } from '../services/permissions';
import GravityInput from './GravityInput';
import YeastPitch from './YeastPitch';
import WaterPlanCard from './WaterPlanCard';
import WaterChemistryCard from './WaterChemistryCard';

interface BrewLogProps {
  recipe: Recipe;
  initialLog?: BrewLogEntry;
  onUpdate: (entry: BrewLogEntry) => void;
  onSaveAndExit: (entry: BrewLogEntry) => void;
  /** Brewing installation of the recipe, for water volumes and boil gravity */
  equipment?: LibraryIngredient;
  /** Library, for the recipe's water profiles */
  library?: LibraryIngredient[];
}

const BrewLog: React.FC<BrewLogProps> = ({ recipe, initialLog, onUpdate, onSaveAndExit, equipment, library = [] }) => {
  const { t, lang } = useTranslation();
  const { preferences, breweryRole, isAdmin } = useUser();

  const canEdit = canManageBrews({ breweryRole, isAdmin });
  const [activeTab, setActiveTab] = useState<'brew' | 'ferment' | 'lager' | 'bottle'>('brew');
  const [saveIndicator, setSaveIndicator] = useState<boolean>(false);
  
  const [entry, setEntry] = useState<BrewLogEntry>(initialLog || {
    id: crypto.randomUUID(),
    recipeId: recipe.id || 'unassigned',
    date: new Date().toISOString().split('T')[0],
    brewDate: new Date().toISOString().split('T')[0],
    status: 'brewing',
    notes: '',
    measurements: {
      actual_og: recipe.specifications?.og?.value,
      actual_fg: undefined,
      actual_volume: recipe.batch_size.value,
      fermentation_temp: 20,
      measured_alpha: recipe.ingredients.hops.reduce((acc, h) => ({...acc, [h.name]: h.alpha_acid?.value || 5}), {})
    },
    bottling: {
      date: undefined,
      target_co2: 2.4,
      sugar_type: 'table_sugar',
      sugar_amount: 0,
      bottling_volume: recipe.batch_size.value
    }
  });

  // Calculate dynamic stats based on current overrides in the log
  const currentStats = useMemo(() => {
    return calculateRecipeStats(recipe, entry.measurements.measured_alpha, equipment);
  }, [recipe, entry.measurements.measured_alpha, equipment]);

  const currentAbvDisplay = useMemo(() => {
    const isActuallyBottled = entry.status === 'bottled';
    const isInBottlingStep = activeTab === 'bottle';
    // A force-carbonated keg gets no priming sugar, so no extra alcohol
    const includePriming = (isActuallyBottled || isInBottlingStep) && entry.bottling?.method !== 'keg';
    
    return calculateABV(
      entry.measurements.actual_og, 
      entry.measurements.actual_fg, 
      includePriming, 
      entry.bottling?.sugar_amount, 
      entry.bottling?.bottling_volume || entry.measurements.actual_volume || recipe.batch_size.value
    );
  }, [entry.measurements, entry.status, entry.bottling, recipe, activeTab]);

  useEffect(() => {
    if (entry.bottling) {
      const vol = entry.bottling.bottling_volume || entry.measurements.actual_volume || recipe.batch_size.value;
      const temp = entry.measurements.fermentation_temp || 20;
      const co2 = entry.bottling.target_co2;
      const type = entry.bottling.sugar_type;
      const newSugar = calculatePrimingSugar(co2, vol, temp, type);
      if (newSugar !== entry.bottling.sugar_amount) {
        setEntry(prev => ({
          ...prev,
          bottling: { ...prev.bottling!, sugar_amount: newSugar }
        }));
      }
    }
  }, [
    entry.bottling?.target_co2, 
    entry.bottling?.sugar_type, 
    entry.bottling?.bottling_volume, 
    entry.measurements.actual_volume, 
    entry.measurements.fermentation_temp, 
    recipe.batch_size.value
  ]);

  useEffect(() => {
    if (entry.status === 'fermenting') setActiveTab('ferment');
    else if (entry.status === 'lagering') setActiveTab('lager');
    else if (entry.status === 'bottled') setActiveTab('bottle');
    else setActiveTab('brew');
  }, []);

  const triggerAutoSave = (updatedEntry: BrewLogEntry) => {
    onUpdate(updatedEntry);
    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 2000);
  };

  const handleAlphaChange = (hopName: string, alpha: number) => {
    setEntry(prev => {
      const updated = {
        ...prev,
        measurements: {
          ...prev.measurements,
          measured_alpha: {
            ...prev.measurements.measured_alpha,
            [hopName]: alpha
          }
        }
      };
      triggerAutoSave(updated);
      return updated;
    });
  };

  const handleStatusChange = (newStatus: BrewLogEntry['status']) => {
    const today = new Date().toISOString().split('T')[0];
    setEntry(prev => {
      const update: Partial<BrewLogEntry> = { status: newStatus };
      if (newStatus === 'fermenting' && !prev.fermentationDate) update.fermentationDate = today;
      if (newStatus === 'lagering' && !prev.lageringDate) update.lageringDate = today;
      if (newStatus === 'bottled' && !prev.bottling?.date) update.bottling = { ...prev.bottling!, date: today };
      const updatedEntry = { ...prev, ...update };
      triggerAutoSave(updatedEntry);
      return updatedEntry;
    });
    if (newStatus === 'fermenting') setActiveTab('ferment');
    if (newStatus === 'lagering') setActiveTab('lager');
    if (newStatus === 'bottled') setActiveTab('bottle');
  };

  const getStepIcon = (tabName: 'brew' | 'ferment' | 'lager' | 'bottle') => {
    const statusOrder = ['brewing', 'fermenting', 'lagering', 'bottled'];
    const tabOrder = ['brew', 'ferment', 'lager', 'bottle'];
    const currentStatusIdx = statusOrder.indexOf(entry.status);
    const tabIdx = tabOrder.indexOf(tabName);
    if (entry.status === 'bottled' || currentStatusIdx > tabIdx) return <i className="fas fa-check-circle text-green-500 mr-2"></i>;
    if (currentStatusIdx === tabIdx) return <i className="fas fa-dot-circle text-amber-500 mr-2"></i>;
    return <i className="far fa-circle text-stone-300 mr-2"></i>;
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 relative">
      {saveIndicator && <div className="fixed bottom-10 right-10 bg-green-600 text-white px-6 py-3 rounded-full font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-2 z-[100] flex items-center gap-2"><i className="fas fa-cloud-upload-alt"></i> {t('auto_saved')}</div>}
      
      {/* Dynamic Header */}
      <div className="bg-stone-900 text-white p-8 rounded-3xl grid grid-cols-1 md:grid-cols-4 gap-8 shadow-xl border border-stone-800">
        <div className="md:border-r border-stone-800">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('status_label')}</p>
          <p className="text-2xl font-black text-amber-500 uppercase">{t(`status_${entry.status}` as any)}</p>
        </div>
        <div className="md:border-r border-stone-800">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">
            {(activeTab === 'bottle' && entry.status !== 'bottled') ? t('projected_abv') : t('actual_abv')}
          </p>
          <p className="text-4xl font-black text-white">{currentAbvDisplay.toFixed(1)}%</p>
        </div>
        <div className="md:border-r border-stone-800">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('actual_ibu')}</p>
          <p className="text-4xl font-black text-green-500">{currentStats.ibu}</p>
        </div>
        <div>
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('brew_day')}</p>
          <p className="text-2xl font-black text-stone-200">{entry.brewDate}</p>
        </div>
      </div>

      {/* Process Tabs */}
      <div className="flex bg-white rounded-2xl p-1 border border-stone-200 shadow-sm overflow-x-auto">
        <button onClick={() => setActiveTab('brew')} className={`flex-1 min-w-[120px] py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${activeTab === 'brew' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-400'}`}>{getStepIcon('brew')} 1. {t('brew_day')}</button>
        <button onClick={() => setActiveTab('ferment')} className={`flex-1 min-w-[120px] py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${activeTab === 'ferment' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-400'}`}>{getStepIcon('ferment')} 2. {t('fermentation')}</button>
        <button onClick={() => setActiveTab('lager')} className={`flex-1 min-w-[120px] py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${activeTab === 'lager' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-400'}`}>{getStepIcon('lager')} 3. {t('lagering')}</button>
        <button onClick={() => setActiveTab('bottle')} className={`flex-1 min-w-[120px] py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${activeTab === 'bottle' ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-400'}`}>{getStepIcon('bottle')} 4. {t('bottling')}</button>
      </div>

      <section className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-12">
        {activeTab === 'brew' && (
          <div className="space-y-10">
            {/* Log Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label htmlFor="brew_date" className="text-xs font-bold text-stone-400 uppercase">{t('brew_date')}</label>
                <input id="brew_date" name="brew_date" type="date" className="w-full p-4 bg-stone-50 border rounded-xl font-bold" value={entry.brewDate || ''} onChange={e => setEntry({...entry, brewDate: e.target.value})} />
              </div>
              <GravityInput id="actual_og" name="actual_og" label={t('actual_og')} value={entry.measurements.actual_og} onChange={sg => setEntry(prev => ({...prev, measurements: {...prev.measurements, actual_og: sg}}))} />
              <div className="space-y-1">
                <label htmlFor="volume_fermenter" className="text-xs font-bold text-stone-400 uppercase">{t('volume_fermenter')} ({preferences.units === 'imperial' ? 'Gal' : 'L'})</label>
                <input
                  id="volume_fermenter"
                  name="actual_volume"
                  type="number"
                  step="0.1"
                  className="w-full p-4 bg-stone-50 border rounded-xl font-bold text-lg"
                  value={preferences.units === 'imperial' ? (entry.measurements.actual_volume ? (entry.measurements.actual_volume / 3.78541).toFixed(2) : '') : entry.measurements.actual_volume || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    const liters = preferences.units === 'imperial' ? val * 3.78541 : val;
                    setEntry({...entry, measurements: {...entry.measurements, actual_volume: liters}});
                  }}
                />
              </div>
            </div>

            {/* Mash Schedule Visibility */}
            {recipe.mash && recipe.mash.steps.length > 0 && (
              <div className="space-y-4 pt-6 border-t border-stone-100">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black flex items-center gap-2">
                    <i className="fas fa-thermometer-half text-red-600"></i> {t('mash_profile')}: {recipe.mash.name}
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recipe.mash.steps.map((s, idx) => (
                    <div key={idx} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center font-black text-stone-600 text-xs">{idx + 1}</div>
                      <div>
                        <p className="font-bold text-stone-900 leading-none mb-1">{s.name}</p>
                        <p className="text-[10px] font-black text-stone-400 uppercase">
                          {formatBrewNumber(s.step_temp, 'temp', lang, preferences)}°{preferences.units === 'imperial' ? 'F' : 'C'} • {s.step_time} min • <span className="text-stone-500">{s.type}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ingredients & Schedule Section */}
            <div className="space-y-6 pt-6 border-t border-stone-100">
              <div className="pb-4">
                <h3 className="text-xl font-black flex items-center gap-2"><i className="fas fa-list-check text-amber-600"></i> {t('additions')}</h3>
              </div>

              {/* Fermentables View */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('grains')}</h4>
                {recipe.ingredients.fermentables.map((f, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <div className="font-bold text-stone-900">{f.name}</div>
                    <div className="text-sm font-black text-stone-400 uppercase">{formatBrewNumber(f.amount.value, 'kg', lang, preferences)} {f.amount.unit === 'pounds' ? 'lb' : 'kg'}</div>
                  </div>
                ))}
              </div>

              {/* Hops View with Alpha override */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('hops')} - {t('actual_batch_values')}</h4>
                <div className="grid grid-cols-1 gap-3">
                  {recipe.ingredients.hops.map((h, i) => (
                    <div key={i} className="flex flex-col md:flex-row md:items-center gap-4 p-5 bg-white border border-stone-200 rounded-2xl shadow-sm">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                           <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${h.use === 'boil' ? 'bg-red-500' : h.use === 'dry_hop' ? 'bg-green-600' : 'bg-stone-500'}`}>{h.use}</span>
                           <div className="font-bold text-stone-900">{h.name}</div>
                        </div>
                        <div className="text-[10px] font-bold text-stone-400 uppercase mt-1">
                          <i className="fas fa-clock mr-1"></i> {h.time?.value ?? 0} min • {formatBrewNumber(h.amount.value, 'g', lang, preferences)} {h.amount.unit === 'ounces' ? 'oz' : 'g'}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 bg-stone-50 p-2 rounded-xl border border-stone-100">
                <label htmlFor={`alpha-override-${i}`} className="text-[10px] font-black text-stone-400 uppercase pl-2">Alpha %</label>
                        <input 
                  id={`alpha-override-${i}`}
                  name={`alpha_${h.name}`}
                          type="number" 
                          step="0.1" 
                          className="w-20 p-2 bg-white border border-stone-200 rounded-lg text-right font-black text-stone-900"
                          value={entry.measurements.measured_alpha?.[h.name] ?? (h.alpha_acid?.value || 5)} 
                          onChange={e => handleAlphaChange(h.name, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Yeast View */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('yeast_lib')}</h4>
                {recipe.ingredients.cultures.map((c, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <div className="flex items-center gap-2">
                       <i className="fas fa-flask text-purple-600 text-xs"></i>
                       <div className="font-bold text-stone-900">{c.name}</div>
                    </div>
                    <div className="text-sm font-black text-stone-400 uppercase">{c.attenuation}% {c.form}</div>
                  </div>
                ))}
              </div>
            </div>

            <WaterPlanCard recipe={recipe} equipment={equipment} og={currentStats.plannedOg} />
            <WaterChemistryCard recipe={recipe} library={library} equipment={equipment} />

            {recipe.ingredients.cultures.length > 0 && (
              <YeastPitch
                cultures={recipe.ingredients.cultures}
                og={entry.measurements.actual_og || recipe.specifications?.og?.value || currentStats.og}
                volumeL={entry.measurements.actual_volume || (recipe.batch_size.unit === 'gallons' ? recipe.batch_size.value * 3.78541 : recipe.batch_size.value)}
                value={entry.yeast_pitch}
                onChange={yeast_pitch => setEntry(prev => ({ ...prev, yeast_pitch }))}
                disabled={!canEdit}
              />
            )}

            <label htmlFor="brew_notes" className="sr-only">{t('brew_notes')}</label>
            <textarea id="brew_notes" name="notes" className="w-full p-4 bg-stone-50 border rounded-xl min-h-[120px]" placeholder={t('brew_notes')} value={entry.notes} onChange={e => setEntry({...entry, notes: e.target.value})} maxLength={2000} />
            {entry.status === 'brewing' && canEdit && <button onClick={() => handleStatusChange('fermenting')} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black text-lg shadow-xl uppercase">{t('next_step')} <i className="fas fa-arrow-right ml-2"></i></button>}
          </div>
        )}

        {activeTab === 'ferment' && (
          <div className="space-y-6">
            <h3 className="text-xl font-black">{t('fermentation')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GravityInput id="actual_fg" name="actual_fg" label={t('actual_fg')} kind="fg" originalGravity={entry.measurements.actual_og} disabled={!canEdit} value={entry.measurements.actual_fg} onChange={sg => setEntry(prev => ({...prev, measurements: {...prev.measurements, actual_fg: sg}}))} />
              <div className="space-y-1">
                <label htmlFor="fermentation_temp" className="text-xs font-bold text-stone-400 uppercase">Max Fermentation Temp (°{preferences.units === 'imperial' ? 'F' : 'C'})</label>
                <input
                  id="fermentation_temp"
                  name="fermentation_temp"
                  disabled={!canEdit}
                  type="number"
                  className="w-full p-4 bg-stone-50 border rounded-xl font-bold text-lg disabled:opacity-50"
                  value={preferences.units === 'imperial' ? (entry.measurements.fermentation_temp ? Math.round((entry.measurements.fermentation_temp * 9/5) + 32) : '') : entry.measurements.fermentation_temp || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    const celsius = preferences.units === 'imperial' ? (val - 32) * 5/9 : val;
                    setEntry({...entry, measurements: {...entry.measurements, fermentation_temp: celsius}});
                  }}
                />
              </div>
            </div>
            {entry.status === 'fermenting' && canEdit && <button onClick={() => handleStatusChange('lagering')} className="w-full py-5 bg-stone-900 text-white rounded-2xl font-black text-lg uppercase shadow-xl">{t('next_step')} <i className="fas fa-snowflake ml-2"></i></button>}
          </div>
        )}

        {activeTab === 'lager' && (
          <div className="space-y-6">
            <h3 className="text-xl font-black">{t('lagering')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label htmlFor="lagering_date" className="text-xs font-bold text-stone-400 uppercase">{t('lagering_date')}</label>
                <input id="lagering_date" name="lagering_date" disabled={!canEdit} type="date" className="w-full p-4 bg-stone-50 border rounded-xl font-bold disabled:opacity-50" value={entry.lageringDate || ''} onChange={e => setEntry({...entry, lageringDate: e.target.value})} />
              </div>
            </div>
            {entry.status === 'lagering' && canEdit && <button onClick={() => setActiveTab('bottle')} className="w-full py-5 bg-stone-900 text-white rounded-2xl font-black text-lg uppercase shadow-xl">{t('next_step')} <i className="fas fa-flask ml-2"></i></button>}
          </div>
        )}

        {activeTab === 'bottle' && (
          <div className="space-y-6">
            <h3 className="text-xl font-black">{t('bottling')}</h3>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('packaging_method')}>
              {(['bottle', 'keg'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={(entry.bottling?.method ?? 'bottle') === m}
                  disabled={!canEdit}
                  onClick={() => setEntry(prev => ({ ...prev, bottling: { ...prev.bottling!, method: m } }))}
                  className={`py-3 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all disabled:opacity-50 ${(entry.bottling?.method ?? 'bottle') === m ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'}`}
                >
                  <i className={`fas ${m === 'keg' ? 'fa-database' : 'fa-wine-bottle'} mr-2`} aria-hidden="true"></i>{t(m === 'keg' ? 'method_keg' : 'method_bottle')}
                </button>
              ))}
            </div>
            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex justify-between items-center">
              {entry.bottling?.method === 'keg' ? (() => {
                const kegTemp = entry.bottling?.keg_temp ?? 4;
                const p = kegPressure(entry.bottling?.target_co2 || 2.4, kegTemp);
                return (
                  <div>
                    <p className="text-xs font-black text-amber-800 uppercase tracking-widest">{t('keg_pressure')}</p>
                    <p className="text-4xl font-black text-amber-900">
                      {preferences.units === 'imperial' ? `${formatBrewNumber(p.psi, 'abv', lang)} psi` : `${formatBrewNumber(p.bar, 'default', lang)} bar`}
                    </p>
                    <p className="text-[10px] font-bold text-amber-800">
                      {preferences.units === 'imperial' ? `${formatBrewNumber(p.bar, 'default', lang)} bar` : `${formatBrewNumber(p.psi, 'abv', lang)} psi`} · {t('keg_pressure_hint')}
                    </p>
                  </div>
                );
              })() : (
              <div>
                <p className="text-xs font-black text-amber-800 uppercase tracking-widest">{t('calculate_sugar')}</p>
                <p className="text-4xl font-black text-amber-900">{entry.bottling?.sugar_amount} g</p>
              </div>
              )}
              <div className="text-right">
                <p className="text-xs font-black text-amber-800 uppercase tracking-widest">{t('projected_abv')}</p>
                <p className="text-2xl font-black text-amber-900">{currentAbvDisplay.toFixed(1)}%</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-1">
                <label htmlFor="bottling_date" className="text-xs font-bold text-stone-400 uppercase">{t('bottling_date')}</label>
                <input id="bottling_date" name="bottling_date" disabled={!canEdit} type="date" className="w-full p-4 bg-stone-50 border rounded-xl font-bold disabled:opacity-50" value={entry.bottling?.date || ''} onChange={e => setEntry({...entry, bottling: {...entry.bottling!, date: e.target.value}})} />
              </div>
              <div className="space-y-1">
                <label htmlFor="bottling_volume" className="text-xs font-bold text-stone-400 uppercase">{t('bottling_volume')} ({preferences.units === 'imperial' ? 'Gal' : 'L'})</label>
                <input
                  id="bottling_volume"
                  name="bottling_volume"
                  disabled={!canEdit}
                  type="number"
                  step="0.1"
                  className="w-full p-4 bg-stone-50 border rounded-xl font-bold disabled:opacity-50"
                  value={preferences.units === 'imperial' ? (entry.bottling?.bottling_volume ? (entry.bottling.bottling_volume / 3.78541).toFixed(2) : '') : entry.bottling?.bottling_volume || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    const liters = preferences.units === 'imperial' ? val * 3.78541 : val;
                    setEntry({...entry, bottling: {...entry.bottling!, bottling_volume: liters}});
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label htmlFor="target_co2" className="text-xs font-bold text-stone-400 uppercase">{t('co2_volume')}</label>
                <select id="target_co2" name="target_co2" disabled={!canEdit} className="w-full p-4 bg-white border border-stone-200 rounded-xl font-bold disabled:opacity-50" value={entry.bottling?.target_co2} onChange={e => setEntry({...entry, bottling: {...entry.bottling!, target_co2: parseFloat(e.target.value)}})}>
                  {/* A stored value outside the presets (default 2.4) would otherwise show as the first option */}
                  {entry.bottling?.target_co2 !== undefined && ![2.0, 2.3, 2.6, 3.2].includes(entry.bottling.target_co2) && (
                    <option value={entry.bottling.target_co2}>{formatBrewNumber(entry.bottling.target_co2, 'default', lang)} vol</option>
                  )}
                  <option value="2.0">{t('carb_standard_ale')}</option>
                  <option value="2.3">{t('carb_pale_ale')}</option>
                  <option value="2.6">{t('carb_blond')}</option>
                  <option value="3.2">{t('carb_wheat')}</option>
                </select>
              </div>
              {entry.bottling?.method === 'keg' ? (
              <div className="space-y-1">
                <label htmlFor="keg_temp" className="text-xs font-bold text-stone-400 uppercase">{t('keg_temp')} (°{preferences.units === 'imperial' ? 'F' : 'C'})</label>
                <input
                  id="keg_temp"
                  name="keg_temp"
                  disabled={!canEdit}
                  type="number"
                  step="0.5"
                  min={preferences.units === 'imperial' ? 28 : -2}
                  max={preferences.units === 'imperial' ? 77 : 25}
                  className="w-full p-4 bg-stone-50 border rounded-xl font-bold disabled:opacity-50"
                  value={preferences.units === 'imperial' ? Math.round((entry.bottling?.keg_temp ?? 4) * 9 / 5 + 32) : (entry.bottling?.keg_temp ?? 4)}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val)) return;
                    const celsius = preferences.units === 'imperial' ? Math.round((val - 32) * 5 / 9 * 10) / 10 : val;
                    setEntry(prev => ({ ...prev, bottling: { ...prev.bottling!, keg_temp: celsius } }));
                  }}
                />
              </div>
              ) : (
              <div className="space-y-1">
                <label htmlFor="sugar_type" className="text-xs font-bold text-stone-400 uppercase">{t('sugar_type')}</label>
                <select id="sugar_type" name="sugar_type" disabled={!canEdit} className="w-full p-4 bg-white border border-stone-200 rounded-xl font-bold disabled:opacity-50" value={entry.bottling?.sugar_type} onChange={e => setEntry({...entry, bottling: {...entry.bottling!, sugar_type: e.target.value as any}})}>
                  <option value="table_sugar">{t('sugar_sucrose')}</option>
                  <option value="glucose">{t('sugar_dextrose')}</option>
                  <option value="dme">{t('sugar_dme')}</option>
                </select>
              </div>
              )}
            </div>
            {entry.status !== 'bottled' && canEdit && (
              <button onClick={() => handleStatusChange('bottled')} disabled={!entry.measurements.actual_fg} className="w-full py-5 bg-green-600 text-white rounded-2xl font-black text-lg shadow-xl disabled:opacity-50">
                {entry.measurements.actual_fg ? t('finish_bottling') : t('fill_fg_first')}
              </button>
            )}
          </div>
        )}

        <div className="pt-8 border-t border-stone-100 flex gap-4">
          <button disabled={!canEdit} onClick={() => triggerAutoSave(entry)} className="flex-1 bg-stone-100 text-stone-900 py-4 rounded-xl font-bold uppercase text-xs disabled:opacity-50">{t('manual_save')}</button>
          <button onClick={() => onSaveAndExit(entry)} className="flex-1 bg-stone-900 text-white py-4 rounded-xl font-bold uppercase text-xs">{t('save_exit')}</button>
        </div>
      </section>
    </div>
  );
};

export default BrewLog;

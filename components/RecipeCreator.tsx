import React, { useState, useMemo } from 'react';
import { Recipe, Fermentable, Hop, Culture, LibraryIngredient, MashStep, Misc } from '../types';
import { GeminiService } from '../services/geminiService';
import { calculateRecipeStats, getSRMColor, formatBrewNumber } from '../services/calculations';
import { useTranslation } from '../App';

interface RecipeCreatorProps {
  onSave: (recipe: Recipe) => void;
  onDelete?: (id: string) => void;
  initialRecipe?: Recipe;
  library: LibraryIngredient[];
}

const RecipeCreator: React.FC<RecipeCreatorProps> = ({ onSave, onDelete, initialRecipe, library }) => {
  const { t, lang } = useTranslation();
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe || {
    name: '',
    type: 'all_grain',
    author: '',
    notes: '',
    batch_size: { unit: 'liters', value: 20 },
    ingredients: {
      fermentables: [],
      hops: [],
      cultures: [],
      miscellaneous: []
    },
    efficiency: { brewhouse: 75 },
    boil_time: { unit: 'minutes', value: 60 },
    mash: {
      name: 'Single Infusion',
      steps: [{ name: 'Mash In', type: 'infusion', step_temp: 67, step_time: 60, infuse_amount: 15 }]
    }
  });

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const gemini = new GeminiService();

  const handleAiGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const generatedRecipe = await gemini.generateRecipe(prompt);
      if (generatedRecipe && generatedRecipe.name) {
        setRecipe({
          ...recipe,
          ...generatedRecipe,
          id: recipe.id
        });
        setPrompt('');
      }
    } catch (error) {
      console.error("AI Generation failed:", error);
      alert("Failed to generate recipe. Please check your API key.");
    } finally {
      setIsGenerating(false);
    }
  };

  const stats = useMemo(() => calculateRecipeStats(recipe), [recipe]);
  
  const selectedStyleGuideline = useMemo(() => {
    if (!recipe.style?.libraryId) return null;
    return library.find(l => l.id === recipe.style?.libraryId);
  }, [recipe.style?.libraryId, library]);

  const checkInRange = (val: number, min?: number, max?: number) => {
    if (min === undefined || max === undefined) return true;
    return val >= min && val <= max;
  };

  const getStatColor = (val: number, min?: number, max?: number) => {
    if (min === undefined && max === undefined) return 'text-white';
    return checkInRange(val, min, max) ? 'text-green-500' : 'text-red-500';
  };

  const addIngredient = (type: 'fermentable' | 'hop' | 'culture' | 'misc') => {
    setRecipe(prev => {
      const newIngredients = { ...prev.ingredients };
      if (type === 'fermentable') {
        newIngredients.fermentables = [...prev.ingredients.fermentables, { name: '', type: 'grain', amount: { unit: 'kilograms', value: 0 }, color: { value: 2 } }];
      } else if (type === 'hop') {
        newIngredients.hops = [...prev.ingredients.hops, { name: '', amount: { unit: 'grams', value: 0 }, use: 'boil', time: { unit: 'minutes', value: 60 }, alpha_acid: { value: 5 } }];
      } else if (type === 'culture') {
        newIngredients.cultures = [...prev.ingredients.cultures, { name: '', type: 'ale', form: 'dry', attenuation: 75 }];
      } else if (type === 'misc') {
        newIngredients.miscellaneous = [...(prev.ingredients.miscellaneous || []), { name: '', type: 'spice', use: 'boil', amount: { unit: 'grams', value: 0 }, time: { unit: 'minutes', value: 10 } }];
      }
      return { ...prev, ingredients: newIngredients };
    });
  };

  const handleLibrarySelect = (type: 'fermentable' | 'hop' | 'culture' | 'misc' | 'style' | 'mash_profile', idx: number, libId: string) => {
    const item = library.find(i => i.id === libId);
    if (!item) return;

    setRecipe(prev => {
      if (type === 'style') return { ...prev, style: { name: item.name, category: item.category, libraryId: item.id } };
      if (type === 'mash_profile') return { ...prev, mash: { name: item.name, steps: item.steps ? item.steps.map(s => ({ ...s })) : [] } };
      
      const newIngredients = { ...prev.ingredients };
      if (type === 'fermentable') {
        const list = [...prev.ingredients.fermentables];
        const potential = 1 + (item.yield || 75) / 100 * 0.046; 
        list[idx] = { ...list[idx], name: item.name, libraryId: item.id, color: { value: item.color || 2 }, yield: { potential: { value: potential } } };
        newIngredients.fermentables = list;
      } else if (type === 'hop') {
        const list = [...prev.ingredients.hops];
        list[idx] = { ...list[idx], name: item.name, libraryId: item.id, alpha_acid: { value: item.alpha || 5 } };
        newIngredients.hops = list;
      } else if (type === 'culture') {
        const list = [...prev.ingredients.cultures];
        list[idx] = { ...list[idx], name: item.name, libraryId: item.id, type: item.type as any, form: item.form as any, attenuation: item.attenuation || 75 };
        newIngredients.cultures = list;
      } else if (type === 'misc') {
        const list = [...(prev.ingredients.miscellaneous || [])];
        list[idx] = { ...list[idx], name: item.name, libraryId: item.id, type: item.misc_type || 'spice', use: item.misc_use || 'boil' };
        newIngredients.miscellaneous = list;
      }
      return { ...prev, ingredients: newIngredients };
    });
  };

  const updateField = (type: 'fermentable' | 'hop' | 'culture' | 'misc', idx: number, field: string, val: any) => {
    setRecipe(prev => {
      const newIngredients = { ...prev.ingredients };
      if (type === 'fermentable') {
        const list = [...prev.ingredients.fermentables];
        if (field === 'amount') list[idx] = { ...list[idx], amount: { ...list[idx].amount, value: val } };
        else list[idx] = { ...list[idx], [field]: val };
        newIngredients.fermentables = list;
      } else if (type === 'hop') {
        const list = [...prev.ingredients.hops];
        if (field === 'amount') list[idx] = { ...list[idx], amount: { ...list[idx].amount, value: val } };
        else if (field === 'time') list[idx] = { ...list[idx], time: { ...list[idx].time, value: val } };
        else list[idx] = { ...list[idx], [field]: val };
        newIngredients.hops = list;
      } else if (type === 'culture') {
        const list = [...prev.ingredients.cultures];
        list[idx] = { ...list[idx], [field]: val };
        newIngredients.cultures = list;
      } else if (type === 'misc') {
        const list = [...(prev.ingredients.miscellaneous || [])];
        if (field === 'amount') list[idx] = { ...list[idx], amount: { ...list[idx].amount, value: val } };
        else if (field === 'time') list[idx] = { ...list[idx], time: { ...list[idx].time, value: val } };
        else list[idx] = { ...list[idx], [field]: val };
        newIngredients.miscellaneous = list;
      }
      return { ...prev, ingredients: newIngredients };
    });
  };

  const removeIngredient = (type: any, index: number) => {
    setRecipe(prev => {
      const newIngredients = { ...prev.ingredients };
      if (type === 'fermentable') newIngredients.fermentables = prev.ingredients.fermentables.filter((_, i) => i !== index);
      else if (type === 'hop') newIngredients.hops = prev.ingredients.hops.filter((_, i) => i !== index);
      else if (type === 'culture') newIngredients.cultures = prev.ingredients.cultures.filter((_, i) => i !== index);
      else if (type === 'misc') newIngredients.miscellaneous = prev.ingredients.miscellaneous?.filter((_, i) => i !== index);
      return { ...prev, ingredients: newIngredients };
    });
  };

  const addMashStep = () => {
    setRecipe(prev => ({
      ...prev,
      mash: {
        ...prev.mash || { name: 'Custom Mash', steps: [] },
        steps: [...(prev.mash?.steps || []), { name: 'New Step', type: 'infusion', step_temp: 67, step_time: 60 }]
      }
    }));
  };

  const removeMashStep = (idx: number) => {
    setRecipe(prev => ({
      ...prev,
      mash: prev.mash ? { ...prev.mash, steps: prev.mash.steps.filter((_, i) => i !== idx) } : undefined
    }));
  };

  const updateMashStep = (idx: number, field: keyof MashStep, val: any) => {
    setRecipe(prev => {
      if (!prev.mash) return prev;
      const steps = [...prev.mash.steps];
      steps[idx] = { ...steps[idx], [field]: val };
      return { ...prev, mash: { ...prev.mash, steps } };
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* AI Bot Section */}
      <section className="bg-gradient-to-br from-indigo-900 to-stone-900 p-8 rounded-3xl shadow-2xl border border-indigo-500/30 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-amber-500/20 transition-all duration-700"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-500 p-2.5 rounded-xl shadow-lg shadow-amber-500/20 animate-pulse">
              <i className="fas fa-robot text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight uppercase">brewbindr <span className="text-amber-500">AI</span></h2>
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Recipe Innovation Bot</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <input 
              className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-white font-medium placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              placeholder="e.g., A Hazy IPA with mango and Citra hops, 20L batch"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
            />
            <button 
              onClick={handleAiGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-amber-900/40 flex items-center justify-center gap-3 min-w-[200px]"
            >
              {isGenerating ? <><i className="fas fa-circle-notch fa-spin"></i> Brewing Idea...</> : <><i className="fas fa-magic"></i> Generate Recipe</>}
            </button>
          </div>
        </div>
      </section>

      {/* Target Stats Section */}
      <section className="bg-stone-900 text-white p-8 rounded-3xl shadow-xl grid grid-cols-2 lg:grid-cols-4 gap-8 sticky top-24 z-40 border border-stone-800">
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('target_abv')}</p>
          <p className={`text-4xl font-black ${getStatColor(stats.abv, selectedStyleGuideline?.abv_min, selectedStyleGuideline?.abv_max)}`}>
            {formatBrewNumber(stats.abv, 'abv', lang)}%
          </p>
          {selectedStyleGuideline?.abv_min !== undefined && (
            <p className="text-[10px] text-stone-500 font-bold mt-1">Range: {selectedStyleGuideline.abv_min}-{selectedStyleGuideline.abv_max}%</p>
          )}
        </div>
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('target_ibu')}</p>
          <p className={`text-4xl font-black ${getStatColor(stats.ibu, selectedStyleGuideline?.ibu_min, selectedStyleGuideline?.ibu_max)}`}>
            {stats.ibu}
          </p>
          {selectedStyleGuideline?.ibu_min !== undefined && (
            <p className="text-[10px] text-stone-500 font-bold mt-1">Range: {selectedStyleGuideline.ibu_min}-{selectedStyleGuideline.ibu_max}</p>
          )}
        </div>
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('color')}</p>
          <div className="flex items-center gap-3">
            <p className={`text-4xl font-black ${getStatColor(stats.color, selectedStyleGuideline?.color_min, selectedStyleGuideline?.color_max)}`}>
              {formatBrewNumber(stats.color, 'default', lang)}
            </p>
            <div className="w-10 h-6 rounded border border-stone-700 shadow-inner" style={{ backgroundColor: getSRMColor(stats.color) }}></div>
          </div>
          {selectedStyleGuideline?.color_min !== undefined && (
            <p className="text-[10px] text-stone-500 font-bold mt-1">Range: {selectedStyleGuideline.color_min}-{selectedStyleGuideline.color_max} SRM</p>
          )}
        </div>
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('est_og')}</p>
          <p className={`text-4xl font-black ${getStatColor(stats.og, selectedStyleGuideline?.og_min, selectedStyleGuideline?.og_max)}`}>
            {formatBrewNumber(stats.og, 'og', lang)}
          </p>
          {selectedStyleGuideline?.og_min !== undefined && (
            <p className="text-[10px] text-stone-500 font-bold mt-1">Range: {selectedStyleGuideline.og_min}-{selectedStyleGuideline.og_max}</p>
          )}
        </div>
      </section>

      {/* Main Form Section */}
      <section className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-stone-400 uppercase">{t('recipe_name')}</label>
            <input className="w-full p-3 bg-stone-50 border rounded-xl text-stone-900 font-bold" value={recipe.name} onChange={e => setRecipe({...recipe, name: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-stone-400 uppercase">{t('style_label')}</label>
            <select className="w-full p-3 bg-stone-50 border rounded-xl font-bold" value={recipe.style?.libraryId || ""} onChange={e => handleLibrarySelect('style', 0, e.target.value)}>
              <option value="">-- Choose Style --</option>
              {library.filter(l => l.type === 'style').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-400 uppercase">{t('batch_size')}</label>
            <div className="flex items-center gap-2">
              <input type="number" className="flex-1 p-3 bg-stone-50 border rounded-xl font-bold" value={recipe.batch_size.value} onChange={e => setRecipe({...recipe, batch_size: {...recipe.batch_size, value: parseFloat(e.target.value) || 0}})} />
              <span className="text-xs font-bold text-stone-400">L</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-400 uppercase">{t('efficiency')}</label>
            <div className="flex items-center gap-2">
              <input type="number" className="flex-1 p-3 bg-stone-50 border rounded-xl font-bold" value={recipe.efficiency.brewhouse} onChange={e => setRecipe({...recipe, efficiency: {brewhouse: parseFloat(e.target.value) || 0}})} />
              <span className="text-xs font-bold text-stone-400">%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-400 uppercase">{t('boil_time')}</label>
            <div className="flex items-center gap-2">
              <input type="number" className="flex-1 p-3 bg-stone-50 border rounded-xl font-bold" value={recipe.boil_time.value} onChange={e => setRecipe({...recipe, boil_time: {...recipe.boil_time, value: parseFloat(e.target.value) || 0}})} />
              <span className="text-xs font-bold text-stone-400">min</span>
            </div>
          </div>
        </div>

        {/* Ingredients Sections */}
        <div>
          <div className="flex justify-between items-center mb-4"><h4 className="font-bold uppercase text-stone-900"><i className="fas fa-seedling text-amber-700"></i> {t('grains')}</h4><button onClick={() => addIngredient('fermentable')} className="text-amber-600 font-bold text-xs uppercase">+ {t('add_ingredient')}</button></div>
          <div className="space-y-3">
            {recipe.ingredients.fermentables.map((f, i) => (
              <div key={i} className="flex gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-100 items-center">
                <select className="flex-1 p-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 text-sm font-medium" value={f.libraryId || ""} onChange={e => handleLibrarySelect('fermentable', i, e.target.value)}>
                  <option value="">{f.name || '-- Select Malt --'}</option>
                  {library.filter(l => l.type === 'fermentable').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input className="w-20 p-2 bg-white border rounded-xl text-right font-black" type="number" step="0.001" value={f.amount?.value ?? 0} onChange={e => updateField('fermentable', i, 'amount', parseFloat(e.target.value) || 0)} />
                  <span className="text-[10px] font-black text-stone-400 uppercase">kg</span>
                </div>
                <button onClick={() => removeIngredient('fermentable', i)}><i className="fas fa-trash-alt text-stone-300"></i></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4"><h4 className="font-bold uppercase text-stone-900"><i className="fas fa-leaf text-green-700"></i> {t('hops')}</h4><button onClick={() => addIngredient('hop')} className="text-amber-600 font-bold text-xs uppercase">+ {t('add_ingredient')}</button></div>
          <div className="space-y-3">
            {recipe.ingredients.hops.map((h, i) => (
              <div key={i} className="flex gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-100 items-center">
                <select className="flex-1 p-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 text-sm font-medium" value={h.libraryId || ""} onChange={e => handleLibrarySelect('hop', i, e.target.value)}>
                  <option value="">{h.name || '-- Select Hop --'}</option>
                  {library.filter(l => l.type === 'hop').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input className="w-16 p-2 bg-white border rounded-xl text-right font-black" type="number" value={Math.round(h.amount?.value ?? 0)} onChange={e => updateField('hop', i, 'amount', parseFloat(e.target.value) || 0)} />
                  <span className="text-[10px] font-black text-stone-400 uppercase">g</span>
                </div>
                <div className="flex items-center gap-2">
                  <input className="w-16 p-2 bg-white border rounded-xl text-right font-black" type="number" value={h.time?.value ?? 0} onChange={e => updateField('hop', i, 'time', parseFloat(e.target.value) || 0)} />
                  <span className="text-[10px] font-black text-stone-400 uppercase">min</span>
                </div>
                <button onClick={() => removeIngredient('hop', i)}><i className="fas fa-trash-alt text-stone-300"></i></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4"><h4 className="font-bold uppercase text-stone-900"><i className="fas fa-flask text-purple-700"></i> {t('yeast_lib')}</h4><button onClick={() => addIngredient('culture')} className="text-amber-600 font-bold text-xs uppercase">+ {t('add_ingredient')}</button></div>
          <div className="space-y-3">
            {recipe.ingredients.cultures.map((c, i) => (
              <div key={i} className="flex gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-100 items-center">
                <select className="flex-1 p-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 text-sm font-medium" value={c.libraryId || ""} onChange={e => handleLibrarySelect('culture', i, e.target.value)}>
                  <option value="">{c.name || '-- Select Yeast --'}</option>
                  {library.filter(l => l.type === 'culture').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input className="w-16 p-2 bg-white border rounded-xl text-right font-black" type="number" value={c.attenuation ?? 75} onChange={e => updateField('culture', i, 'attenuation', parseFloat(e.target.value) || 0)} />
                  <span className="text-[10px] font-black text-stone-400 uppercase">%</span>
                </div>
                <button onClick={() => removeIngredient('culture', i)}><i className="fas fa-trash-alt text-stone-300"></i></button>
              </div>
            ))}
          </div>
        </div>

        {/* Mash Profile Editor */}
        <div className="pt-6 border-t border-stone-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h4 className="font-bold uppercase text-stone-900 flex items-center gap-2"><i className="fas fa-thermometer-half text-red-600"></i> {t('mash_profile')}</h4>
            <div className="flex flex-wrap gap-3">
              <select className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-stone-600" value="" onChange={e => handleLibrarySelect('mash_profile', 0, e.target.value)}>
                <option value="">Load From Library</option>
                {library.filter(l => l.type === 'mash_profile').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button onClick={addMashStep} className="bg-stone-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-black transition-all">+ {t('add_mash_step')}</button>
            </div>
          </div>
          <div className="space-y-4 bg-stone-50 p-6 rounded-3xl border border-stone-100">
            <div className="mb-4">
               <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">Profile Name</label>
               <input className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm font-bold shadow-sm" value={recipe.mash?.name || ""} onChange={e => setRecipe({...recipe, mash: { ...(recipe.mash || { steps: [] }), name: e.target.value}})} placeholder="e.g., Single Infusion" />
            </div>
            <div className="space-y-3">
              {(recipe.mash?.steps || []).map((s, idx) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm relative group">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">{t('step_name')}</label>
                      <input className="w-full p-2.5 bg-stone-50 border border-stone-100 rounded-lg text-xs font-bold" value={s.name} onChange={e => updateMashStep(idx, 'name', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">{t('step_temp')}</label>
                      <div className="flex items-center gap-2">
                        <input type="number" className="flex-1 p-2.5 bg-stone-50 border border-stone-100 rounded-lg text-xs font-bold" value={s.step_temp} onChange={e => updateMashStep(idx, 'step_temp', parseFloat(e.target.value) || 0)} />
                        <span className="text-xs font-bold text-stone-400">°C</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-stone-400 uppercase mb-1 block">{t('step_time')}</label>
                      <div className="flex items-center gap-2">
                        <input type="number" className="flex-1 p-2.5 bg-stone-50 border border-stone-100 rounded-lg text-xs font-bold" value={s.step_time} onChange={e => updateMashStep(idx, 'step_time', parseFloat(e.target.value) || 0)} />
                        <span className="text-xs font-bold text-stone-400">min</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pb-1">
                      <select className="p-2 bg-stone-100 border border-stone-200 rounded-lg text-[10px] font-black uppercase tracking-tight text-stone-500" value={s.type} onChange={e => updateMashStep(idx, 'type', e.target.value as any)}>
                        <option value="infusion">Infusion</option>
                        <option value="temperature">Temp</option>
                        <option value="decoction">Decoc</option>
                      </select>
                      <button onClick={() => removeMashStep(idx)} className="text-stone-300 hover:text-red-500 transition-colors p-2"><i className="fas fa-trash-alt"></i></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recipe Notes */}
        <div className="pt-6 border-t border-stone-100">
          <h4 className="font-bold uppercase text-stone-900 mb-4 flex items-center gap-2"><i className="fas fa-sticky-note text-stone-400"></i> {t('notes')}</h4>
          <textarea 
            className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl min-h-[120px] text-sm font-medium focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            placeholder="Brewing tips, profile notes, or general thoughts..."
            value={recipe.notes || ""}
            onChange={e => setRecipe({...recipe, notes: e.target.value})}
          />
        </div>

        <div className="flex gap-4">
          {onDelete && recipe.id && (
            <button 
              onClick={() => { if(confirm(t('confirm_delete'))) onDelete(recipe.id!); }}
              className="flex-none bg-stone-100 text-red-600 px-8 py-5 rounded-3xl font-black shadow-sm hover:bg-red-50 transition-all uppercase tracking-widest text-lg"
            >
              <i className="fas fa-trash-alt"></i>
            </button>
          )}
          <button onClick={() => onSave({...recipe, specifications: { og: {value: stats.og}, fg: {value: stats.fg}, abv: {value: stats.abv}, ibu: {value: stats.ibu}, color: {value: stats.color}}})} className="flex-1 bg-stone-900 text-white py-5 rounded-3xl font-black shadow-xl hover:bg-black transition-all uppercase tracking-widest text-lg">{t('save_recipe')}</button>
        </div>
      </section>
    </div>
  );
};

export default RecipeCreator;
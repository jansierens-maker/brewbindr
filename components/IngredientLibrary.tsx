
import React, { useState } from 'react';
import { LibraryIngredient, MashStep } from '../types';
import { useTranslation } from '../App';

interface LibraryProps {
  ingredients: LibraryIngredient[];
  onUpdate: (ingredients: LibraryIngredient[]) => void;
}

const IngredientLibrary: React.FC<LibraryProps> = ({ 
  ingredients, 
  onUpdate
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'fermentable' | 'hop' | 'culture' | 'misc' | 'mash_profile' | 'style'>('fermentable');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LibraryIngredient>>({});
  const [itemToDelete, setItemToDelete] = useState<LibraryIngredient | null>(null);

  const handleAddNew = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    
    let defaultName = "";
    switch(filter) {
      case 'fermentable': defaultName = t('malt'); break;
      case 'hop': defaultName = t('hops'); break;
      case 'culture': defaultName = t('yeast_lib'); break;
      case 'misc': defaultName = "New Ingredient"; break;
      case 'mash_profile': defaultName = t('mash_profile'); break;
      case 'style': defaultName = "New beer style"; break;
      default: defaultName = t('new_btn');
    }

    const newItem: LibraryIngredient = {
      id: newId,
      name: (filter === 'misc' || filter === 'style') ? defaultName : `${t('new_btn')} ${defaultName}`,
      type: filter as string,
      color: filter === 'fermentable' ? 2 : undefined,
      yield: filter === 'fermentable' ? 75 : undefined,
      alpha: filter === 'hop' ? 5 : undefined,
      attenuation: filter === 'culture' ? 75 : undefined,
      form: filter === 'culture' ? 'dry' : undefined,
      steps: filter === 'mash_profile' ? [{ name: 'Step 1', type: 'infusion', step_temp: 67, step_time: 60 }] : undefined,
      misc_type: filter === 'misc' ? 'spice' : undefined,
      misc_use: filter === 'misc' ? 'boil' : undefined
    };
    onUpdate([...ingredients, newItem]);
    startEditing(newItem);
  };

  const startEditing = (item: LibraryIngredient) => {
    setEditingId(item.id);
    setEditForm(item);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEditing = () => {
    if (!editForm.name) return;
    onUpdate(ingredients.map(i => i.id === editingId ? { ...i, ...editForm } as LibraryIngredient : i));
    setEditingId(null);
    setEditForm({});
  };

  const deleteItem = (item: LibraryIngredient) => {
    setItemToDelete(item);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      onUpdate(ingredients.filter(i => i.id !== itemToDelete.id));
      setEditingId(null);
      setEditForm({});
      setItemToDelete(null);
    }
  };

  const addMashStep = () => {
    const currentSteps = editForm.steps || [];
    setEditForm({ ...editForm, steps: [...currentSteps, { name: 'New Step', type: 'infusion', step_temp: 67, step_time: 60 }] });
  };

  const updateMashStep = (idx: number, field: keyof MashStep, val: any) => {
    const steps = [...(editForm.steps || [])];
    steps[idx] = { ...steps[idx], [field]: val };
    setEditForm({ ...editForm, steps });
  };

  const removeMashStep = (idx: number) => {
    const steps = (editForm.steps || []).filter((_, i) => i !== idx);
    setEditForm({ ...editForm, steps });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {itemToDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-md w-full shadow-2xl animate-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-trash-alt text-2xl text-red-600"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900 mb-2">{t('delete_ingredient')}?</h3>
            <p className="text-stone-500 font-medium mb-1 text-sm">"{itemToDelete.name}"</p>
            <p className="text-stone-400 text-xs mb-8">
              {t('confirm_delete')}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setItemToDelete(null)} 
                className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black text-sm hover:bg-stone-200 transition-all uppercase tracking-widest"
              >
                {t('cancel_btn')}
              </button>
              <button 
                onClick={confirmDelete} 
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100 uppercase tracking-widest"
              >
                {t('delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
        <div className="w-full">
          <div className="flex flex-wrap gap-1">
            {['fermentable', 'hop', 'culture', 'misc', 'mash_profile', 'style'].map((f: any) => (
              <button 
                key={f}
                onClick={() => { setFilter(f); cancelEditing(); }} 
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${filter === f ? 'bg-amber-600 text-white shadow-lg' : 'text-stone-400 hover:bg-stone-50'}`}
              >
                {f === 'fermentable' ? t('malt') : f === 'hop' ? t('hops') : f === 'culture' ? t('yeast_lib') : f === 'mash_profile' ? t('mash_profile') : f === 'misc' ? t('miscs_label') : t('style_label')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-end px-2">
        <div>
          <h3 className="text-2xl font-black capitalize text-stone-900">
            {filter === 'fermentable' ? t('malt') : filter === 'hop' ? t('hops') : filter === 'culture' ? t('yeast_lib') : filter === 'mash_profile' ? t('mash_profile') : filter === 'misc' ? t('miscs_label') : t('style_label')}
          </h3>
          <p className="text-stone-400 text-xs font-bold">{ingredients.filter(i => i.type === filter).length} {t('items_in_collection')}</p>
        </div>
        <button 
          onClick={handleAddNew}
          className="bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:bg-black transition-all flex items-center gap-2"
        >
          <i className="fas fa-plus"></i> {t('new_btn')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ingredients.filter(i => i.type === filter).length === 0 ? (
          <div className="col-span-full py-20 text-center text-stone-300 font-medium bg-white rounded-3xl border-2 border-dashed border-stone-100">
            {t('no_brews')}
          </div>
        ) : (
          ingredients.filter(i => i.type === filter).map(item => (
            <div key={item.id} className={`bg-white p-8 rounded-3xl border shadow-sm relative transition-all ${editingId === item.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-stone-200'}`}>
              {editingId === item.id ? (
                <div className="space-y-4 animate-in zoom-in-95 duration-200">
                  <div>
                    <label className="text-[10px] font-black text-stone-400 uppercase">{t('name_label')}</label>
                    <input className="w-full p-2 bg-stone-50 border rounded-lg text-sm font-bold" value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                  </div>
                  
                  {filter === 'misc' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black text-stone-400 uppercase">{t('misc_type')}</label>
                        <select className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.misc_type} onChange={e => setEditForm({...editForm, misc_type: e.target.value as any})}>
                          <option value="spice">Spice</option>
                          <option value="fining">Fining</option>
                          <option value="water_agent">Water Agent</option>
                          <option value="herb">Herb</option>
                          <option value="flavor">Flavor</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-stone-400 uppercase">{t('misc_use')}</label>
                        <select className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.misc_use} onChange={e => setEditForm({...editForm, misc_use: e.target.value as any})}>
                          <option value="boil">Boil</option>
                          <option value="mash">Mash</option>
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                          <option value="bottling">Bottling</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {filter === 'style' && (
                    <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                      <div className="col-span-2">
                        <label className="text-[10px] font-black text-stone-400 uppercase">{t('style_category')}</label>
                        <input className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.category || ""} onChange={e => setEditForm({...editForm, category: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-stone-400 uppercase">OG Min</label>
                        <input type="number" step="0.001" className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.og_min || ""} onChange={e => setEditForm({...editForm, og_min: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-stone-400 uppercase">OG Max</label>
                        <input type="number" step="0.001" className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.og_max || ""} onChange={e => setEditForm({...editForm, og_max: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-stone-400 uppercase">IBU Min</label>
                        <input type="number" className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.ibu_min || ""} onChange={e => setEditForm({...editForm, ibu_min: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-stone-400 uppercase">IBU Max</label>
                        <input type="number" className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold" value={editForm.ibu_max || ""} onChange={e => setEditForm({...editForm, ibu_max: parseFloat(e.target.value)})} />
                      </div>
                    </div>
                  )}

                  {filter === 'mash_profile' && (
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between items-center">
                         <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('mash_steps')}</p>
                         <button onClick={addMashStep} className="text-amber-600 font-black text-[10px] uppercase">+ {t('add_mash_step')}</button>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {(editForm.steps || []).map((s, idx) => (
                          <div key={idx} className="p-3 bg-stone-50 rounded-xl border border-stone-100 space-y-2 relative">
                            <button onClick={() => removeMashStep(idx)} className="absolute top-2 right-2 text-stone-300 hover:text-red-500">
                              <i className="fas fa-times"></i>
                            </button>
                            <input className="w-full p-1.5 bg-white border rounded text-[10px] font-bold" placeholder="Step Name" value={s.name} onChange={e => updateMashStep(idx, 'name', e.target.value)} />
                            <div className="grid grid-cols-3 gap-2">
                              <input type="number" className="p-1.5 bg-white border rounded text-[10px] font-bold" placeholder="Temp" value={s.step_temp} onChange={e => updateMashStep(idx, 'step_temp', parseFloat(e.target.value) || 0)} />
                              <input type="number" className="p-1.5 bg-white border rounded text-[10px] font-bold" placeholder="Time" value={s.step_time} onChange={e => updateMashStep(idx, 'step_time', parseFloat(e.target.value) || 0)} />
                              <select className="p-1.5 bg-white border rounded text-[10px] font-bold" value={s.type} onChange={e => updateMashStep(idx, 'type', e.target.value as any)}>
                                <option value="infusion">Infusion</option>
                                <option value="temperature">Temp</option>
                                <option value="decoction">Decoc</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    <div className="flex gap-2">
                      <button onClick={saveEditing} className="flex-1 bg-amber-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-amber-700">{t('save_btn')}</button>
                      <button onClick={cancelEditing} className="px-4 bg-stone-100 text-stone-400 py-2.5 rounded-xl text-xs font-bold hover:bg-stone-200">{t('cancel_btn')}</button>
                    </div>
                    <button onClick={() => deleteItem(item)} className="w-full mt-2 py-2 text-red-500 text-[10px] font-black uppercase hover:bg-red-50 rounded-xl transition-all">
                      <i className="fas fa-trash-alt mr-2"></i> {t('delete_ingredient')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-black text-lg text-stone-900 leading-tight">{item.name}</h4>
                    <button onClick={() => startEditing(item)} className="text-stone-300 hover:text-amber-500 transition-colors">
                      <i className="fas fa-edit text-xs"></i>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-[10px] font-black uppercase tracking-widest text-stone-400">
                    {item.type === 'misc' && (
                      <div className="flex justify-between"><span>{item.misc_type}</span><span>{item.misc_use}</span></div>
                    )}
                    {item.type === 'style' && (
                      <div className="space-y-1">
                        <p>{item.category}</p>
                        <div className="flex flex-wrap gap-2 text-[8px] text-stone-900">
                          <span className="bg-stone-100 px-1 rounded">OG: {item.og_min}-{item.og_max}</span>
                          <span className="bg-stone-100 px-1 rounded">IBU: {item.ibu_min}-{item.ibu_max}</span>
                        </div>
                      </div>
                    )}
                    {item.type === 'fermentable' && (
                      <div className="flex justify-between"><span>{t('color')}: <span className="text-stone-900">{item.color} SRM</span></span><span>{t('efficiency')}: <span className="text-stone-900">{item.yield}%</span></span></div>
                    )}
                    {item.type === 'hop' && (
                      <div>Alpha: <span className="text-stone-900">{item.alpha}%</span></div>
                    )}
                    {item.type === 'culture' && (
                      <div className="flex justify-between"><span>Atten: <span className="text-stone-900">{item.attenuation}%</span></span><span>{t('form_label')}: <span className="text-stone-900">{item.form}</span></span></div>
                    )}
                    {item.type === 'mash_profile' && (
                      <div className="space-y-1">
                        <p>{(item.steps || []).length} {t('mash_steps')}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default IngredientLibrary;

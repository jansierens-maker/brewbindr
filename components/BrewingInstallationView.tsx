
import React, { useState } from 'react';
import { LibraryIngredient, MashStep } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { supabaseService } from '../services/supabaseService';

interface Props {
  library: LibraryIngredient[];
  onUpdate: (newLibrary: LibraryIngredient[]) => void;
}

const BrewingInstallationView: React.FC<Props> = ({ library, onUpdate }) => {
  const { t } = useTranslation();
  const { user, profile, breweryRole } = useUser();
  const [activeTab, setActiveTab] = useState<'equipment' | 'mash'>('equipment');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LibraryIngredient>>({});
  const [itemToDelete, setItemToDelete] = useState<LibraryIngredient | null>(null);

  const canEdit = breweryRole === 'admin' || breweryRole === 'brewmaster' || !breweryRole;

  const equipment = library.filter(i => i.type === 'equipment' && (i.brewery_id === profile?.brewery_id || i.user_id === user?.id));
  const mashProfiles = library.filter(i => i.type === 'mash_profile' && (i.brewery_id === profile?.brewery_id || i.user_id === user?.id));

  const startEditing = (item: LibraryIngredient) => {
    setEditingId(item.id);
    setEditForm(item);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEditing = async () => {
    if (!editForm.name) return;
    const updatedItem = { ...editForm } as LibraryIngredient;

    // Optimistic update
    onUpdate(library.map(i => i.id === editingId ? updatedItem : i));

    if (user?.id) {
      await supabaseService.saveLibraryIngredient(updatedItem, user.id, profile?.brewery_id);
    }

    setEditingId(null);
    setEditForm({});
  };

  const handleAddNewEquipment = () => {
    const newItem: LibraryIngredient = {
      id: crypto.randomUUID(),
      name: t('add_equipment'),
      type: 'equipment',
      user_id: user?.id,
      brewery_id: profile?.brewery_id,
      status: 'private',
      boil_size: 25,
      efficiency: 75,
      boil_time: 60,
      trub_chiller_loss: 2,
      description: ""
    };
    onUpdate([...library, newItem]);
    startEditing(newItem);
  };

  const handleAddNewMash = () => {
    const newItem: LibraryIngredient = {
      id: crypto.randomUUID(),
      name: t('add_mash_profile'),
      type: 'mash_profile',
      user_id: user?.id,
      brewery_id: profile?.brewery_id,
      status: 'private',
      steps: [{ name: t('infusion'), type: 'infusion', step_temp: 67, step_time: 60 }]
    };
    onUpdate([...library, newItem]);
    startEditing(newItem);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      onUpdate(library.filter(i => i.id !== itemToDelete.id));
      await supabaseService.deleteLibraryIngredient(itemToDelete.id, itemToDelete.type);
      setItemToDelete(null);
    }
  };

  const addMashStep = () => {
    const currentSteps = editForm.steps || [];
    setEditForm({ ...editForm, steps: [...currentSteps, { name: 'Nieuwe stap', type: 'infusion', step_temp: 67, step_time: 60 }] });
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
            <h3 className="text-2xl font-black text-stone-900 mb-2">{t('confirm_delete')}?</h3>
            <p className="text-stone-500 font-medium mb-8 text-sm">"{itemToDelete.name}"</p>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black text-sm uppercase tracking-widest">{t('cancel_btn')}</button>
              <button onClick={confirmDelete} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-red-100">{t('delete_btn')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div>
          <h2 className="text-4xl font-black text-stone-900">{t('nav_installation')}</h2>
          <p className="text-stone-400 text-xs font-bold mt-1 uppercase tracking-widest">{t('installation_subtitle')}</p>
        </div>
        <div className="flex bg-stone-100 p-1 rounded-2xl w-fit">
          <button
            onClick={() => { setActiveTab('equipment'); cancelEditing(); }}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'equipment' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
          >
            {t('tab_equipment')}
          </button>
          <button
            onClick={() => { setActiveTab('mash'); cancelEditing(); }}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'mash' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
          >
            {t('tab_mash_profiles')}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center px-2">
        <h3 className="text-2xl font-black text-stone-900">
          {activeTab === 'equipment' ? t('tab_equipment') : t('tab_mash_profiles')}
        </h3>
        {canEdit && (
          <button
            onClick={activeTab === 'equipment' ? handleAddNewEquipment : handleAddNewMash}
            className="bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:bg-black transition-all flex items-center gap-2"
          >
            <i className="fas fa-plus"></i> {activeTab === 'equipment' ? t('add_equipment') : t('add_mash_profile')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(activeTab === 'equipment' ? equipment : mashProfiles).map(item => (
          <div key={item.id} className={`bg-white p-8 rounded-3xl border shadow-sm relative transition-all ${editingId === item.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-stone-200'}`}>
            {editingId !== item.id && (
              <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
                {canEdit && (
                  <>
                    <button onClick={() => startEditing(item)} className="text-stone-300 hover:text-amber-500 transition-colors" title={t('edit_btn')}>
                      <i className="fas fa-edit text-xs"></i>
                    </button>
                    <button onClick={() => setItemToDelete(item)} className="text-stone-300 hover:text-red-500 transition-colors" title={t('delete_btn')}>
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </>
                )}
              </div>
            )}

            {editingId === item.id ? (
              <div className="space-y-4 animate-in zoom-in-95 duration-200">
                <div>
                  <label htmlFor={`name-${item.id}`} className="text-[10px] font-black text-stone-400 uppercase">{t('name_label')}</label>
                  <input
                    id={`name-${item.id}`}
                    className="w-full p-2 bg-stone-50 border rounded-lg text-sm font-bold mt-1 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    value={editForm.name || ""}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    maxLength={100}
                    placeholder="Naam"
                  />
                </div>

                {activeTab === 'equipment' ? (
                  <>
                    <div>
                      <label htmlFor={`desc-${item.id}`} className="text-[10px] font-black text-stone-400 uppercase">{t('description_label')}</label>
                      <textarea
                        id={`desc-${item.id}`}
                        className="w-full p-2 bg-stone-50 border rounded-lg text-xs font-bold mt-1 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none h-20 resize-none"
                        value={editForm.description || ""}
                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="Beschrijving van de installatie..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`boil-size-${item.id}`} className="text-[10px] font-black text-stone-400 uppercase">{t('boil_size_label')} (L)</label>
                        <input
                          id={`boil-size-${item.id}`}
                          type="number"
                          className="w-full p-2 bg-stone-50 border rounded-lg text-sm font-bold mt-1"
                          value={editForm.boil_size || ""}
                          onChange={e => setEditForm({ ...editForm, boil_size: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`efficiency-${item.id}`} className="text-[10px] font-black text-stone-400 uppercase">{t('efficiency')} (%)</label>
                        <input
                          id={`efficiency-${item.id}`}
                          type="number"
                          className="w-full p-2 bg-stone-50 border rounded-lg text-sm font-bold mt-1"
                          value={editForm.efficiency || ""}
                          onChange={e => setEditForm({ ...editForm, efficiency: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`boil-time-${item.id}`} className="text-[10px] font-black text-stone-400 uppercase">{t('boil_time')} (min)</label>
                        <input
                          id={`boil-time-${item.id}`}
                          type="number"
                          className="w-full p-2 bg-stone-50 border rounded-lg text-sm font-bold mt-1"
                          value={editForm.boil_time || ""}
                          onChange={e => setEditForm({ ...editForm, boil_time: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`trub-${item.id}`} className="text-[10px] font-black text-stone-400 uppercase">{t('trub_loss_label')} (L)</label>
                        <input
                          id={`trub-${item.id}`}
                          type="number"
                          className="w-full p-2 bg-stone-50 border rounded-lg text-sm font-bold mt-1"
                          value={editForm.trub_chiller_loss || ""}
                          onChange={e => setEditForm({ ...editForm, trub_chiller_loss: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 pt-2">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('mash_steps')}</p>
                      <button onClick={addMashStep} className="text-amber-600 font-black text-[10px] uppercase hover:underline">+ {t('add_mash_step')}</button>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {(editForm.steps || []).map((s, idx) => (
                        <div key={idx} className="p-3 bg-stone-50 rounded-xl border border-stone-100 space-y-2 relative">
                          <button onClick={() => removeMashStep(idx)} className="absolute top-2 right-2 text-stone-300 hover:text-red-500 transition-colors">
                            <i className="fas fa-times"></i>
                          </button>
                          <input
                            className="w-full p-1.5 bg-white border rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-amber-500"
                            placeholder="Naam van de stap"
                            value={s.name}
                            onChange={e => updateMashStep(idx, 'name', e.target.value)}
                            maxLength={100}
                            name={`step_name_${idx}`}
                            id={`step_name_${idx}_${item.id}`}
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="sr-only">Temp</label>
                              <input
                                type="number"
                                className="p-1.5 bg-white border rounded text-[10px] font-bold w-full"
                                placeholder="Temp"
                                value={s.step_temp}
                                onChange={e => updateMashStep(idx, 'step_temp', parseFloat(e.target.value) || 0)}
                                name={`step_temp_${idx}`}
                              />
                            </div>
                            <div>
                              <label className="sr-only">Tijd</label>
                              <input
                                type="number"
                                className="p-1.5 bg-white border rounded text-[10px] font-bold w-full"
                                placeholder="Tijd"
                                value={s.step_time}
                                onChange={e => updateMashStep(idx, 'step_time', parseFloat(e.target.value) || 0)}
                                name={`step_time_${idx}`}
                              />
                            </div>
                            <div>
                              <label className="sr-only">Type</label>
                              <select
                                className="p-1.5 bg-white border rounded text-[10px] font-bold w-full outline-none"
                                value={s.type}
                                onChange={e => updateMashStep(idx, 'type', e.target.value as any)}
                                name={`step_type_${idx}`}
                              >
                                <option value="infusion">{t('infusion')}</option>
                                <option value="temperature">{t('temperature')}</option>
                                <option value="decoction">{t('decoction')}</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button onClick={saveEditing} className="flex-1 bg-amber-600 text-white py-3 rounded-xl text-xs font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">{t('save_btn')}</button>
                  <button onClick={cancelEditing} className="px-6 bg-stone-100 text-stone-400 py-3 rounded-xl text-xs font-bold hover:bg-stone-200 transition-all">{t('cancel_btn')}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex flex-col">
                    <h4 className="font-black text-xl text-stone-900 leading-tight">{item.name}</h4>
                    {item.description && <p className="text-[10px] text-stone-400 font-bold mt-1 line-clamp-2">{item.description}</p>}
                  </div>
                </div>

                {activeTab === 'equipment' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 rounded-2xl p-3">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">{t('boil_size_label')}</p>
                      <p className="text-sm font-black text-stone-900">{item.boil_size} L</p>
                    </div>
                    <div className="bg-stone-50 rounded-2xl p-3">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">{t('efficiency')}</p>
                      <p className="text-sm font-black text-stone-900">{item.efficiency}%</p>
                    </div>
                    <div className="bg-stone-50 rounded-2xl p-3">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">{t('boil_time')}</p>
                      <p className="text-sm font-black text-stone-900">{item.boil_time} min</p>
                    </div>
                    <div className="bg-stone-50 rounded-2xl p-3">
                      <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">{t('trub_loss_label')}</p>
                      <p className="text-sm font-black text-stone-900">{item.trub_chiller_loss} L</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{(item.steps || []).length} {t('mash_steps')}</p>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {(item.steps || []).map((step, sIdx) => (
                        <div key={sIdx} className="flex items-center justify-between p-2 bg-stone-50 rounded-xl border border-stone-100">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-lg bg-white border border-stone-100 flex items-center justify-center text-[8px] font-black text-stone-400">{sIdx + 1}</div>
                            <div>
                              <p className="text-[10px] font-black text-stone-900">{step.name}</p>
                              <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{t(step.type as any)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-amber-600">{step.step_temp}°C</p>
                            <p className="text-[8px] font-bold text-stone-400">{step.step_time} min</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {(activeTab === 'equipment' ? equipment : mashProfiles).length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-stone-100 px-6">
            <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
               <i className={`fas ${activeTab === 'equipment' ? 'fa-temperature-half' : 'fa-list-ol'} text-2xl text-stone-200`}></i>
            </div>
            <p className="text-stone-400 font-bold text-sm">{t('no_items_found')}</p>
            {canEdit && (
              <button
                onClick={activeTab === 'equipment' ? handleAddNewEquipment : handleAddNewMash}
                className="mt-4 text-amber-600 font-black text-[10px] uppercase tracking-widest hover:underline"
              >
                + {activeTab === 'equipment' ? t('add_equipment') : t('add_mash_profile')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrewingInstallationView;

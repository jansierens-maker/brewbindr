
import React, { useState } from 'react';
import { LibraryIngredient, MashStep } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { supabaseService } from '../services/supabaseService';

const TABLE_MAP: Record<string, string> = {
  'fermentable': 'fermentables',
  'hop': 'hops',
  'culture': 'cultures',
  'style': 'styles',
  'misc': 'miscs',
  'mash_profile': 'mash_profiles',
  'equipment': 'equipment',
  'water': 'waters'
};

interface LibraryProps {
  ingredients: LibraryIngredient[];
  libraryView: 'personal' | 'public';
  onUpdate: (ingredients: LibraryIngredient[]) => void;
}

const IngredientLibrary: React.FC<LibraryProps> = ({ 
  ingredients, 
  libraryView,
  onUpdate
}) => {
  const { t } = useTranslation();
  const { user, preferences, profile, breweryRole } = useUser();

  const canEdit = breweryRole === 'admin' || breweryRole === 'brewmaster' || !breweryRole;
  const [filter, setFilter] = useState<'fermentable' | 'hop' | 'culture' | 'misc' | 'mash_profile' | 'style'>('fermentable');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LibraryIngredient>>({});
  const [itemToDelete, setItemToDelete] = useState<LibraryIngredient | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkAction = async () => {
    if (selectedIds.length === 0 || !user?.id) return;

    if (libraryView === 'personal') {
      // Bulk Submit to Public - Clone items to keep originals private
      const selectedItems = ingredients.filter(i => selectedIds.includes(i.id));
      const submittedClones = selectedItems.map(item => ({
        ...item,
        id: crypto.randomUUID(),
        user_id: user.id,
        status: 'submitted' as const,
        stock: undefined // Remove stock for public submission
      }));
      await supabaseService.batchSaveLibraryIngredients(submittedClones, user.id, profile?.brewery_id);
      alert(`${selectedIds.length} items submitted for review!`);
    } else {
      // Bulk Import to Personal
      const selectedItems = ingredients.filter(i => selectedIds.includes(i.id));
      const newItems = selectedItems.map(item => ({
        ...item,
        id: crypto.randomUUID(),
        user_id: user.id,
        status: 'private' as const
      }));
      await supabaseService.batchSaveLibraryIngredients(newItems, user.id, profile?.brewery_id);
      alert(`${selectedIds.length} items added to your collection!`);
    }

    // Refresh parent data
    const remoteData = await supabaseService.fetchAppData(user.id, profile?.brewery_id);
    if (remoteData) {
      onUpdate(remoteData.library);
    }
    setSelectedIds([]);
  };

  const handleAddNew = () => {
    const newId = crypto.randomUUID();
    
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
      user_id: user?.id,
      brewery_id: profile?.brewery_id,
      status: 'private',
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
          <div className="bg-[var(--color-bg)] rounded-[var(--radius)] p-8 max-md w-full shadow-[var(--shadow)] animate-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-trash-alt text-2xl text-red-600"></i>
            </div>
            <h3 className="text-2xl font-black text-[var(--color-text)] mb-2">{t('delete_ingredient')}?</h3>
            <p className="text-[var(--color-text-muted)] font-medium mb-1 text-sm">"{itemToDelete.name}"</p>
            <p className="text-[var(--color-text-xmuted)] text-xs mb-8">
              {t('confirm_delete')}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setItemToDelete(null)} 
                className="flex-1 py-4 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-black text-sm hover:bg-[var(--color-bg-hover)] transition-all uppercase tracking-widest"
              >
                {t('cancel_btn')}
              </button>
              <button 
                onClick={confirmDelete} 
                className="flex-1 py-4 bg-red-600 text-white rounded-[var(--radius-sm)] font-black text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100 uppercase tracking-widest"
              >
                {t('delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-[var(--color-bg)] p-6 rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-[var(--color-border)]">
        <div className="w-full">
          <div className="flex flex-wrap gap-1">
            {['fermentable', 'hop', 'culture', 'misc', 'mash_profile', 'style'].map((f: any) => (
              <button 
                key={f}
                onClick={() => { setFilter(f); cancelEditing(); setSelectedIds([]); }}
                className={`px-5 py-2.5 rounded-[var(--radius-sm)] font-bold text-xs transition-all ${filter === f ? 'bg-[var(--color-accent)] text-white shadow-lg' : 'text-[var(--color-text-xmuted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-muted)]'}`}
              >
                {f === 'fermentable' ? t('malt') : f === 'hop' ? t('hops') : f === 'culture' ? t('yeast_lib') : f === 'mash_profile' ? t('mash_profile') : f === 'misc' ? t('miscs_label') : t('style_label')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end px-2 gap-4">
        <div>
          <h3 className="text-2xl font-black capitalize text-[var(--color-text)] font-[var(--font-display)]">
            {filter === 'fermentable' ? t('malt') : filter === 'hop' ? t('hops') : filter === 'culture' ? t('yeast_lib') : filter === 'mash_profile' ? t('mash_profile') : filter === 'misc' ? t('miscs_label') : t('style_label')}
          </h3>
          <p className="text-[var(--color-text-xmuted)] text-xs font-bold">
            {ingredients.filter(i => i.type === filter && (
              libraryView === 'public'
                ? i.status === 'approved'
                : (
                   (i.status === 'private' || i.status === 'submitted') &&
                   ((!i.user_id || i.user_id === user?.id) || (profile?.brewery_id && i.brewery_id === profile.brewery_id))
                  )
            )).length} {t('items_in_collection')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {selectedIds.length > 0 && user && canEdit && (
            <div className="flex items-center gap-3 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 animate-in slide-in-from-right-4 duration-300 mr-auto md:mr-0">
               <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{selectedIds.length} {t('selected')}</span>
               <button
                onClick={handleBulkAction}
                className="bg-amber-600 text-white px-4 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-amber-700 transition-all shadow-sm"
               >
                 {libraryView === 'personal' ? t('bulk_submit') : t('bulk_import')}
               </button>
               <button
                onClick={() => setSelectedIds([])}
                className="text-amber-400 hover:text-amber-600 transition-colors"
                aria-label="Clear Selection"
                title="Clear Selection"
               >
                 <i className="fas fa-times text-xs"></i>
               </button>
            </div>
          )}

          {libraryView === 'personal' && canEdit && (
            <button
              onClick={handleAddNew}
              className="bg-[var(--color-text)] text-white px-6 py-2.5 rounded-[var(--radius-sm)] font-bold text-xs shadow-lg hover:opacity-90 transition-all flex items-center gap-2"
            >
              <i className="fas fa-plus"></i> {t('new_btn')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ingredients.filter(i => i.type === filter && (
          libraryView === 'public'
            ? i.status === 'approved'
            : (
                (i.status === 'private' || i.status === 'submitted') &&
                ((!i.user_id || i.user_id === user?.id) || (profile?.brewery_id && i.brewery_id === profile.brewery_id))
              )
        )).length === 0 ? (
          <div className="col-span-full py-20 text-center text-[var(--color-text-xmuted)] font-medium bg-[var(--color-bg)] rounded-[var(--radius)] border-2 border-dashed border-[var(--color-border)] shadow-[var(--shadow-sm)]">
            {t('no_items_found')}
          </div>
        ) : (
          ingredients
            .filter(i => i.type === filter && (
              libraryView === 'public'
                ? i.status === 'approved'
                : (
                    (i.status === 'private' || i.status === 'submitted') &&
                    ((!i.user_id || i.user_id === user?.id) || (profile?.brewery_id && i.brewery_id === profile.brewery_id))
                  )
            ))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(item => (
            <div key={item.id} className={`bg-[var(--color-bg)] p-8 rounded-[var(--radius)] border shadow-[var(--shadow-sm)] relative transition-all ${editingId === item.id ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent-light)]' : selectedIds.includes(item.id) ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent-light)]' : 'border-[var(--color-border)]'}`}>

              {editingId !== item.id && (
                <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
                   <button
                    onClick={() => toggleSelection(item.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(item.id) ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-stone-200 text-transparent'}`}
                   >
                     <i className="fas fa-check text-[10px]"></i>
                   </button>
                   {((!item.user_id || item.user_id === user?.id) || (item.brewery_id === profile?.brewery_id)) && canEdit && (
                      <button onClick={() => startEditing(item)} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-accent)] transition-colors">
                        <i className="fas fa-edit text-xs"></i>
                      </button>
                    )}
                </div>
              )}

              {editingId === item.id ? (
                <div className="space-y-4 animate-in zoom-in-95 duration-200">
                  <div>
                    <label htmlFor={`ing-name-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">{t('name_label')}</label>
                    <input id={`ing-name-${item.id}`} name="name" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold" value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} maxLength={100} />
                  </div>
                  
                  {filter === 'misc' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={`ing-misc-type-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">{t('misc_type')}</label>
                        <select id={`ing-misc-type-${item.id}`} name="misc_type" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.misc_type} onChange={e => setEditForm({...editForm, misc_type: e.target.value as any})}>
                          <option value="spice">Spice</option>
                          <option value="fining">Fining</option>
                          <option value="water_agent">Water Agent</option>
                          <option value="herb">Herb</option>
                          <option value="flavor">Flavor</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`ing-misc-use-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">{t('misc_use')}</label>
                        <select id={`ing-misc-use-${item.id}`} name="misc_use" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.misc_use} onChange={e => setEditForm({...editForm, misc_use: e.target.value as any})}>
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
                        <label htmlFor={`ing-style-cat-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">{t('style_category')}</label>
                        <input id={`ing-style-cat-${item.id}`} name="category" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.category || ""} onChange={e => setEditForm({...editForm, category: e.target.value})} maxLength={100} />
                      </div>
                      <div>
                        <label htmlFor={`ing-style-og-min-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">OG Min</label>
                        <input id={`ing-style-og-min-${item.id}`} name="og_min" type="number" step="0.001" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.og_min || ""} onChange={e => setEditForm({...editForm, og_min: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                        <label htmlFor={`ing-style-og-max-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">OG Max</label>
                        <input id={`ing-style-og-max-${item.id}`} name="og_max" type="number" step="0.001" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.og_max || ""} onChange={e => setEditForm({...editForm, og_max: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                        <label htmlFor={`ing-style-ibu-min-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">IBU Min</label>
                        <input id={`ing-style-ibu-min-${item.id}`} name="ibu_min" type="number" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.ibu_min || ""} onChange={e => setEditForm({...editForm, ibu_min: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                        <label htmlFor={`ing-style-ibu-max-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">IBU Max</label>
                        <input id={`ing-style-ibu-max-${item.id}`} name="ibu_max" type="number" className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold" value={editForm.ibu_max || ""} onChange={e => setEditForm({...editForm, ibu_max: parseFloat(e.target.value)})} />
                      </div>
                    </div>
                  )}

                  {filter === 'mash_profile' && (
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between items-center">
                         <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('mash_steps')}</p>
                         <button onClick={addMashStep} className="text-[var(--color-accent-dark)] font-black text-[10px] uppercase tracking-wider">+ {t('add_mash_step')}</button>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {(editForm.steps || []).map((s, idx) => (
                          <div key={idx} className="p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] border border-[var(--color-border)] space-y-2 relative">
                            <button onClick={() => removeMashStep(idx)} className="absolute top-2 right-2 text-[var(--color-text-xmuted)] hover:text-red-500">
                              <i className="fas fa-times"></i>
                            </button>
                            <label htmlFor={`ing-step-name-${item.id}-${idx}`} className="sr-only">Step Name</label>
                            <input id={`ing-step-name-${item.id}-${idx}`} name={`step_name_${idx}`} className="w-full p-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[10px] font-bold" placeholder="Step Name" value={s.name} onChange={e => updateMashStep(idx, 'name', e.target.value)} maxLength={100} />
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label htmlFor={`ing-step-temp-${item.id}-${idx}`} className="sr-only">Temp</label>
                                <input id={`ing-step-temp-${item.id}-${idx}`} name={`step_temp_${idx}`} type="number" className="p-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[10px] font-bold w-full" placeholder="Temp" value={s.step_temp} onChange={e => updateMashStep(idx, 'step_temp', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div>
                                <label htmlFor={`ing-step-time-${item.id}-${idx}`} className="sr-only">Time</label>
                                <input id={`ing-step-time-${item.id}-${idx}`} name={`step_time_${idx}`} type="number" className="p-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[10px] font-bold w-full" placeholder="Time" value={s.step_time} onChange={e => updateMashStep(idx, 'step_time', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div>
                                <label htmlFor={`ing-step-type-${item.id}-${idx}`} className="sr-only">Type</label>
                                <select id={`ing-step-type-${item.id}-${idx}`} name={`step_type_${idx}`} className="p-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[10px] font-bold w-full" value={s.type} onChange={e => updateMashStep(idx, 'type', e.target.value as any)}>
                                  <option value="infusion">Infusion</option>
                                  <option value="temperature">Temp</option>
                                  <option value="decoction">Decoc</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {preferences.enableStockManagement && editForm.status === 'private' && ['fermentable', 'hop', 'culture', 'misc'].includes(filter) && (
                    <div className="pt-2 border-t border-[var(--color-border)]">
                      <label htmlFor={`ing-stock-${item.id}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase">{t('stock_label')}</label>
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <input
                          id={`ing-stock-${item.id}`}
                          name="stock_amount"
                          type="number"
                          step="0.01"
                          className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold"
                          placeholder={t('stock_amount')}
                          value={editForm.stock?.amount ?? ""}
                          onChange={e => setEditForm({...editForm, stock: { amount: parseFloat(e.target.value) || 0, unit: editForm.stock?.unit || (filter === 'hop' || filter === 'misc' ? 'g' : 'kg') }})}
                        />
                        <select
                          id={`ing-stock-unit-${item.id}`}
                          aria-label="Stock Unit"
                          className="w-full p-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold"
                          value={editForm.stock?.unit || (filter === 'hop' || filter === 'misc' ? 'g' : 'kg')}
                          onChange={e => setEditForm({...editForm, stock: { amount: editForm.stock?.amount || 0, unit: e.target.value }})}
                        >
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="lb">lb</option>
                          <option value="oz">oz</option>
                          <option value="items">items</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    <div className="flex gap-2">
                      <button onClick={saveEditing} className="flex-1 bg-[var(--color-accent)] text-white py-2.5 rounded-[var(--radius-sm)] text-xs font-bold hover:opacity-90">{t('save_btn')}</button>
                      <button onClick={cancelEditing} className="px-4 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] py-2.5 rounded-[var(--radius-sm)] text-xs font-bold hover:bg-[var(--color-bg-hover)]">{t('cancel_btn')}</button>
                    </div>

                    <button onClick={() => deleteItem(item)} className="w-full mt-2 py-2 text-red-500 text-[10px] font-black uppercase hover:bg-red-50 rounded-[var(--radius-sm)] transition-all">
                      <i className="fas fa-trash-alt mr-2"></i> {t('delete_ingredient')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col pr-14">
                      <h4 className="font-black text-lg text-[var(--color-text)] leading-tight">{item.name}</h4>
                      {item.status === 'approved' && <span className="text-[8px] font-black text-green-600 uppercase tracking-widest mt-1"><i className="fas fa-check-circle mr-1"></i>Public Library</span>}
                      {item.status === 'submitted' && <span className="text-[8px] font-black text-[var(--color-accent)] uppercase tracking-widest mt-1"><i className="fas fa-clock mr-1"></i>Pending Review</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">
                    {item.type === 'misc' && (
                      <div className="flex justify-between"><span>{item.misc_type}</span><span>{item.misc_use}</span></div>
                    )}
                    {item.type === 'style' && (
                      <div className="space-y-1">
                        <p>{item.category}</p>
                        <div className="flex flex-wrap gap-2 text-[8px] text-[var(--color-text)]">
                          <span className="bg-[var(--color-bg-subtle)] px-1 rounded border border-[var(--color-border)]">OG: {item.og_min}-{item.og_max}</span>
                          <span className="bg-[var(--color-bg-subtle)] px-1 rounded border border-[var(--color-border)]">IBU: {item.ibu_min}-{item.ibu_max}</span>
                        </div>
                      </div>
                    )}
                    {item.type === 'fermentable' && (
                      <div className="flex justify-between"><span>{t('color')}: <span className="text-[var(--color-text)]">{item.color} SRM</span></span><span>{t('efficiency')}: <span className="text-[var(--color-text)]">{item.yield}%</span></span></div>
                    )}
                    {item.type === 'hop' && (
                      <div>Alpha: <span className="text-[var(--color-text)]">{item.alpha}%</span></div>
                    )}
                    {item.type === 'culture' && (
                      <div className="flex justify-between"><span>Atten: <span className="text-[var(--color-text)]">{item.attenuation}%</span></span><span>{t('form_label')}: <span className="text-[var(--color-text)]">{item.form}</span></span></div>
                    )}
                    {item.type === 'mash_profile' && (
                      <div className="space-y-1">
                        <p>{(item.steps || []).length} {t('mash_steps')}</p>
                      </div>
                    )}
                  </div>

                  {preferences.enableStockManagement && item.status === 'private' && item.stock && ['fermentable', 'hop', 'culture', 'misc'].includes(item.type) && (
                    <div className="mt-4 p-3 bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] border border-[var(--color-border)] flex justify-between items-center">
                      <span className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('stock_label')}</span>
                      <span className={`text-xs font-black ${item.stock.amount > 0 ? 'text-[var(--color-text)]' : 'text-red-500'}`}>
                        {item.stock.amount} {item.stock.unit}
                      </span>
                    </div>
                  )}

                  <div className="mt-6 pt-6 border-t border-[var(--color-border)] flex flex-col gap-2">
                    {user && libraryView === 'personal' && ((item.user_id === user.id || !item.user_id) || item.brewery_id === profile?.brewery_id) && item.status === 'private' && canEdit && (
                       <button
                        onClick={async () => {
                          const clone = {
                            ...item,
                            id: crypto.randomUUID(),
                            user_id: user.id,
                            brewery_id: profile?.brewery_id,
                            status: 'submitted' as const,
                            stock: undefined
                          };
                          await supabaseService.saveLibraryIngredient(clone, user.id, profile?.brewery_id);
                          const remoteData = await supabaseService.fetchAppData(user.id, profile?.brewery_id);
                          if (remoteData) onUpdate(remoteData.library);
                          alert(`${item.name} submitted for review!`);
                        }}
                        className="w-full bg-[var(--color-accent-light)] text-[var(--color-accent-dark)] py-2.5 rounded-[var(--radius-sm)] text-[10px] font-black uppercase hover:opacity-80 transition-all tracking-widest"
                       >
                         <i className="fas fa-cloud-upload-alt mr-2"></i>
                         {t('submit_to_public')}
                       </button>
                    )}

                    {libraryView === 'public' && (
                       <button
                        onClick={async () => {
                          const newItem = { ...item, id: crypto.randomUUID(), user_id: user?.id, brewery_id: profile?.brewery_id, status: 'private' as const };
                          onUpdate([...ingredients, newItem]);
                          if (user?.id) {
                            await supabaseService.saveLibraryIngredient(newItem, user.id, profile?.brewery_id);
                          }
                          alert(`${item.name} added to your collection!`);
                        }}
                        className="w-full bg-[var(--color-text)] text-white py-2.5 rounded-[var(--radius-sm)] text-[10px] font-black uppercase hover:opacity-90 transition-all tracking-widest"
                       >
                         <i className="fas fa-plus-circle mr-2"></i>
                         {t('add_to_collection')}
                       </button>
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

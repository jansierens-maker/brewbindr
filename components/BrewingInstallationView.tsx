
import React, { useState, useMemo } from 'react';
import { LibraryIngredient, MashStep, Vessel } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { supabaseService } from '../services/supabaseService';

interface Props {
  library: LibraryIngredient[];
  onUpdate: (newLibrary: LibraryIngredient[]) => void;
}

type EquipmentPreset = {
  name: string;
  type: LibraryIngredient['equipment_type'];
  batch: number;
  efficiency: number;
  vessels: Vessel[];
  trub_loss: number;
};

const PRESETS: EquipmentPreset[] = [
  {
    name: "Brewie",
    type: 'two_vessel',
    batch: 23,
    efficiency: 70,
    trub_loss: 2,
    vessels: [
      { name: "Maischketel", role: 'combined', volume: 27, heating: 'electric', pump: true },
      { name: "Kookketel", role: 'boil', volume: 23, heating: 'electric', pump: true }
    ]
  },
  {
    name: "Grainfather G30",
    type: 'all_in_one',
    batch: 25,
    efficiency: 72,
    trub_loss: 2,
    vessels: [{ name: "G30", role: 'combined', volume: 30, heating: 'electric', pump: true }]
  },
  {
    name: "Grainfather G40",
    type: 'all_in_one',
    batch: 35,
    efficiency: 72,
    trub_loss: 2,
    vessels: [{ name: "G40", role: 'combined', volume: 40, heating: 'electric', pump: true }]
  },
  {
    name: "Robobrew / BrewZilla",
    type: 'all_in_one',
    batch: 30,
    efficiency: 70,
    trub_loss: 2,
    vessels: [{ name: "BrewZilla", role: 'combined', volume: 35, heating: 'electric', pump: true }]
  },
  {
    name: "BIAB 20L",
    type: 'biab',
    batch: 20,
    efficiency: 65,
    trub_loss: 2,
    vessels: [{ name: "Ketel", role: 'combined', volume: 30, heating: 'gas', pump: false }]
  },
  {
    name: "BIAB 30L",
    type: 'biab',
    batch: 30,
    efficiency: 65,
    trub_loss: 2,
    vessels: [{ name: "Ketel", role: 'combined', volume: 45, heating: 'gas', pump: false }]
  },
  {
    name: "Klassiek 3-vatten 20L",
    type: 'three_vessel',
    batch: 20,
    efficiency: 75,
    trub_loss: 1,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 30, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 30, heating: 'none', pump: false },
      { name: "Kookketel", role: 'boil', volume: 30, heating: 'gas', pump: true }
    ]
  },
  {
    name: "Klassiek 3-vatten 30L",
    type: 'three_vessel',
    batch: 30,
    efficiency: 75,
    trub_loss: 2,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 40, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 40, heating: 'none', pump: false },
      { name: "Kookketel", role: 'boil', volume: 40, heating: 'gas', pump: true }
    ]
  },
  {
    name: "RIMS 20L",
    type: 'rims',
    batch: 20,
    efficiency: 78,
    trub_loss: 1,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 30, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 30, heating: 'none', pump: true },
      { name: "Kookketel", role: 'boil', volume: 30, heating: 'gas', pump: true }
    ]
  },
  {
    name: "HERMS 20L",
    type: 'herms',
    batch: 20,
    efficiency: 80,
    trub_loss: 1,
    vessels: [
      { name: "HLT", role: 'hlt', volume: 30, heating: 'electric', pump: true },
      { name: "MLT", role: 'mash', volume: 30, heating: 'none', pump: true },
      { name: "Kookketel", role: 'boil', volume: 30, heating: 'gas', pump: true }
    ]
  }
];

const BrewingInstallationView: React.FC<Props> = ({ library, onUpdate }) => {
  const { t } = useTranslation();
  const { user, profile, breweryRole } = useUser();
  const [activeTab, setActiveTab] = useState<'equipment' | 'mash'>('equipment');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LibraryIngredient>>({});
  const [itemToDelete, setItemToDelete] = useState<LibraryIngredient | null>(null);
  const [creationStep, setCreationStep] = useState<1 | 2>(1);

  const canEdit = breweryRole === 'admin' || breweryRole === 'brewmaster' || !breweryRole;

  const equipment = useMemo(() => library.filter(i => i.type === 'equipment' && (i.brewery_id === profile?.brewery_id || i.user_id === user?.id)), [library, profile?.brewery_id, user?.id]);
  const mashProfiles = useMemo(() => library.filter(i => i.type === 'mash_profile' && (i.brewery_id === profile?.brewery_id || i.user_id === user?.id)), [library, profile?.brewery_id, user?.id]);

  const startEditing = (item: LibraryIngredient) => {
    setEditingId(item.id);
    setEditForm(item);
    setCreationStep(2);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
    setCreationStep(1);
  };

  const saveEditing = async () => {
    if (!editForm.name) return;
    const updatedItem = { ...editForm, type: activeTab === 'equipment' ? 'equipment' : 'mash_profile' } as LibraryIngredient;

    if (editingId === 'new') {
        onUpdate([...library, updatedItem]);
    } else {
        onUpdate(library.map(i => i.id === editingId ? updatedItem : i));
    }

    if (user?.id) {
      await supabaseService.saveLibraryIngredient(updatedItem, user.id, profile?.brewery_id);
    }

    setEditingId(null);
    setEditForm({});
    setCreationStep(1);
  };

  const handleAddNewEquipment = () => {
    setEditingId("new");
    setEditForm({
        id: crypto.randomUUID(),
        type: 'equipment',
        equipment_type: 'custom',
        user_id: user?.id,
        brewery_id: profile?.brewery_id,
        status: 'private',
        vessels: [],
        batch_size: 20,
        efficiency: 70,
        boil_time: 60,
        trub_chiller_loss: 2,
        fermenter_loss: 1,
        evap_rate: 2,
        top_up_water: 0
    });
    setCreationStep(1);
  };

  const applyPreset = (preset: EquipmentPreset | 'custom') => {
    if (preset === 'custom') {
        setEditForm({ ...editForm, preset: t('custom'), equipment_type: 'custom' });
    } else {
        setEditForm({
            ...editForm,
            name: preset.name,
            preset: preset.name,
            equipment_type: preset.type,
            batch_size: preset.batch,
            efficiency: preset.efficiency,
            trub_chiller_loss: preset.trub_loss,
            vessels: preset.vessels
        });
    }
    setCreationStep(2);
  };

  const handleAddNewMash = () => {
    const newItem: LibraryIngredient = {
      id: crypto.randomUUID(),
      name: t('add_mash_profile'),
      type: 'mash_profile',
      user_id: user?.id,
      brewery_id: profile?.brewery_id,
      status: 'private',
      steps: [{ name: t('infusion'), type: 'infusion', temperature: 67, duration: 60 }]
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
    setEditForm({ ...editForm, steps: [...currentSteps, { name: 'Nieuwe stap', type: 'infusion', temperature: 67, duration: 60 }] });
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

  const moveMashStep = (idx: number, direction: 'up' | 'down') => {
    const steps = [...(editForm.steps || [])];
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= steps.length) return;
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    setEditForm({ ...editForm, steps });
  };

  const addVessel = () => {
    const vessels = editForm.vessels || [];
    setEditForm({ ...editForm, vessels: [...vessels, { name: "Nieuw vat", role: 'mash', volume: 30, heating: 'none', pump: false }] });
  };

  const updateVessel = (idx: number, field: keyof Vessel, val: any) => {
    const vessels = [...(editForm.vessels || [])];
    vessels[idx] = { ...vessels[idx], [field]: val };
    setEditForm({ ...editForm, vessels });
  };

  const removeVessel = (idx: number) => {
    const vessels = (editForm.vessels || []).filter((_, i) => i !== idx);
    setEditForm({ ...editForm, vessels });
  };

  const showField = (fieldName: string) => {
    const type = editForm.equipment_type;
    if (type === 'custom') return true;
    switch(fieldName) {
      case 'mash_volume': return ['all_in_one', 'two_vessel', 'three_vessel', 'rims', 'herms'].includes(type as any);
      case 'hlt_volume': return ['three_vessel', 'rims', 'herms'].includes(type as any);
      case 'lauter_deadspace': return ['two_vessel', 'three_vessel', 'rims', 'herms'].includes(type as any);
      case 'tun_specific_heat': return ['rims', 'herms'].includes(type as any);
      case 'pump': return ['all_in_one', 'two_vessel', 'three_vessel', 'rims', 'herms'].includes(type as any);
      default: return true;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {itemToDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-[var(--color-bg)] rounded-[var(--radius)] p-8 max-md w-full shadow-[var(--shadow)] animate-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-trash-alt text-2xl text-red-600"></i>
            </div>
            <h3 className="text-2xl font-black text-[var(--color-text)] mb-2">{t('confirm_delete')}?</h3>
            <p className="text-[var(--color-text-muted)] font-medium mb-8 text-sm">"{itemToDelete.name}"</p>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 py-4 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-black text-sm uppercase tracking-widest">{t('cancel_btn')}</button>
              <button onClick={confirmDelete} className="flex-1 py-4 bg-red-600 text-white rounded-[var(--radius-sm)] font-black text-sm uppercase tracking-widest shadow-lg shadow-red-100">{t('delete_btn')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div>
          <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('nav_installation')}</h2>
          <p className="text-[var(--color-text-xmuted)] text-xs font-bold mt-1 uppercase tracking-widest">{t('installation_subtitle')}</p>
        </div>
        <div className="flex bg-[var(--color-bg-subtle)] p-1 rounded-[var(--radius)] w-fit border border-[var(--color-border)]">
          <button
            onClick={() => { setActiveTab('equipment'); cancelEditing(); }}
            className={`px-6 py-2 rounded-[var(--radius-sm)] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'equipment' ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'}`}
          >
            {t('tab_equipment')}
          </button>
          <button
            onClick={() => { setActiveTab('mash'); cancelEditing(); }}
            className={`px-6 py-2 rounded-[var(--radius-sm)] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'mash' ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'}`}
          >
            {t('tab_mash_profiles')}
          </button>
        </div>
      </div>

      {!editingId ? (
        <>
          <div className="flex justify-between items-center px-2">
            <h3 className="text-2xl font-black text-[var(--color-text)] font-[var(--font-display)]">
              {activeTab === 'equipment' ? t('tab_equipment') : t('tab_mash_profiles')}
            </h3>
            {canEdit && (
              <button
                onClick={activeTab === 'equipment' ? handleAddNewEquipment : handleAddNewMash}
                className="bg-[var(--color-text)] text-white px-6 py-2.5 rounded-[var(--radius-sm)] font-bold text-xs shadow-lg hover:opacity-90 transition-all flex items-center gap-2"
              >
                <i className="fas fa-plus"></i> {activeTab === 'equipment' ? t('add_equipment') : t('add_mash_profile')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(activeTab === 'equipment' ? equipment : mashProfiles).map(item => (
              <div key={item.id} className="bg-[var(--color-bg)] p-8 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] relative group hover:shadow-[var(--shadow)] transition-all">
                <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
                    {canEdit && (
                        <>
                            <button onClick={() => startEditing(item)} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-accent)] transition-colors"><i className="fas fa-edit text-xs"></i></button>
                            <button onClick={() => setItemToDelete(item)} className="text-[var(--color-text-xmuted)] hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                        </>
                    )}
                </div>
                <div className="mb-4">
                    <h4 className="font-black text-xl text-[var(--color-text)] leading-tight pr-12">{item.name}</h4>
                    {item.equipment_type && <span className="text-[10px] font-black text-[var(--color-accent-dark)] uppercase tracking-widest mt-1 inline-block">{t(item.equipment_type as any)}</span>}
                </div>

                {activeTab === 'equipment' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] p-3">
                      <p className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-0.5">{t('batch_size')}</p>
                      <p className="text-sm font-black text-[var(--color-text)]">{item.batch_size || item.boil_size || 20} L</p>
                    </div>
                    <div className="bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] p-3">
                      <p className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-0.5">{t('efficiency')}</p>
                      <p className="text-sm font-black text-[var(--color-text)]">{item.efficiency}%</p>
                    </div>
                    <div className="bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] p-3 col-span-2">
                        <p className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-0.5">{t('vessels_label')}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {(item.vessels || []).map((v, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[9px] font-bold text-[var(--color-text-muted)]">{v.name} ({v.volume}L)</span>
                            ))}
                            {(!item.vessels || item.vessels.length === 0) && <span className="text-[9px] font-bold text-[var(--color-text-xmuted)] italic">Geen vaten gedefinieerd</span>}
                        </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{(item.steps || []).length} {t('mash_steps')}</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {(item.steps || []).map((s, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-[var(--color-bg-subtle)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                                <span className="text-[10px] font-bold text-[var(--color-text)] truncate pr-2">{s.name}</span>
                                <span className="text-[10px] font-black text-[var(--color-accent-dark)] whitespace-nowrap">{s.temperature || s.step_temp}°C / {s.duration || s.step_time}m</span>
                            </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {(activeTab === 'equipment' ? equipment : mashProfiles).length === 0 && (
                <div className="col-span-full py-20 text-center bg-[var(--color-bg)] rounded-[var(--radius)] border-2 border-dashed border-[var(--color-border)] px-6 shadow-[var(--shadow-sm)]">
                    <div className="w-16 h-16 bg-[var(--color-bg-subtle)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className={`fas ${activeTab === 'equipment' ? 'fa-temperature-half' : 'fa-list-ol'} text-2xl text-[var(--color-text-xmuted)] opacity-20`}></i>
                    </div>
                    <p className="text-[var(--color-text-muted)] font-bold text-sm">{t('no_items_found')}</p>
                </div>
            )}
          </div>
        </>
      ) : (
        <div className="max-w-4xl mx-auto bg-[var(--color-bg)] rounded-[var(--radius)] shadow-[var(--shadow)] border border-[var(--color-border)] overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-[var(--color-text)] p-8 flex justify-between items-center">
            <div>
              <h3 className="text-2xl font-black text-white">{editingId === 'new' ? t('nav_new') : t('edit_btn')} {activeTab === 'equipment' ? t('tab_equipment') : t('tab_mash_profiles')}</h3>
              <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-1">
                {activeTab === 'equipment' ? (creationStep === 1 ? t('step_preset') : t('step_adjust')) : t('tab_mash_profiles')}
              </p>
            </div>
            <button onClick={cancelEditing} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all">
                <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="p-8 md:p-12 space-y-8">
            {activeTab === 'equipment' ? (
                creationStep === 1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {PRESETS.map(p => (
                            <button
                                key={p.name}
                                onClick={() => applyPreset(p)}
                                className="p-6 rounded-3xl border-2 border-stone-100 hover:border-amber-500 hover:bg-amber-50/30 transition-all text-left group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                                    <i className={`fas ${p.type === 'all_in_one' ? 'fa-blender' : 'fa-vials'}`}></i>
                                </div>
                                <h4 className="font-black text-stone-900 text-sm mb-1">{p.name}</h4>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-bold text-stone-400 uppercase">{t(p.type as any)}</span>
                                    <span className="text-[10px] font-bold text-amber-600 uppercase">{p.batch}L</span>
                                </div>
                            </button>
                        ))}
                        <button
                            onClick={() => applyPreset('custom')}
                            className="p-6 rounded-3xl border-2 border-dashed border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition-all text-left"
                        >
                             <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mb-4 shadow-sm text-stone-300">
                                <i className="fas fa-tools"></i>
                            </div>
                            <h4 className="font-black text-stone-900 text-sm mb-1">{t('custom')}</h4>
                            <p className="text-[10px] font-bold text-stone-400 uppercase">Alles handmatig invullen</p>
                        </button>
                    </div>
                ) : (
                    <div className="space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('name_label')}</label>
                                    <input className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('heating_label')}</label>
                                    <select className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.equipment_type} onChange={e => setEditForm({...editForm, equipment_type: e.target.value as any})}>
                                        <option value="biab">{t('biab')}</option>
                                        <option value="all_in_one">{t('all_in_one')}</option>
                                        <option value="two_vessel">{t('two_vessel')}</option>
                                        <option value="three_vessel">{t('three_vessel')}</option>
                                        <option value="rims">{t('rims')}</option>
                                        <option value="herms">{t('herms')}</option>
                                        <option value="custom">{t('custom')}</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('description_label')}</label>
                                <textarea className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none h-[116px] resize-none" value={editForm.description || ""} onChange={e => setEditForm({...editForm, description: e.target.value})} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-black text-[var(--color-text)] uppercase tracking-widest">{t('vessels_label')}</h4>
                                <button onClick={addVessel} className="text-[var(--color-accent-dark)] font-black text-[10px] uppercase hover:underline tracking-wider">+ {t('add_vessel')}</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(editForm.vessels || []).map((v, idx) => (
                                    <div key={idx} className="p-4 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] border border-[var(--color-border)] relative group">
                                        <button onClick={() => removeVessel(idx)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <i className="fas fa-times text-[10px]"></i>
                                        </button>
                                        <input className="w-full bg-transparent font-bold text-sm border-b border-[var(--color-border)] mb-3 pb-1 focus:border-[var(--color-accent)] outline-none" value={v.name} onChange={e => updateVessel(idx, 'name', e.target.value)} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase">Vol (L)</label>
                                                <input type="number" className="w-full bg-[var(--color-bg)] p-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[10px] font-bold" value={v.volume} onChange={e => updateVessel(idx, 'volume', parseFloat(e.target.value) || 0)} />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase">{t('heating_label')}</label>
                                                <select className="w-full bg-[var(--color-bg)] p-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[10px] font-bold" value={v.heating} onChange={e => updateVessel(idx, 'heating', e.target.value as any)}>
                                                    <option value="electric">{t('electric')}</option>
                                                    <option value="gas">{t('gas')}</option>
                                                    <option value="none">{t('none')}</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('batch_size')} (L)</label>
                                <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.batch_size || ""} onChange={e => setEditForm({...editForm, batch_size: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('efficiency')} (%)</label>
                                <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.efficiency || ""} onChange={e => setEditForm({...editForm, efficiency: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('trub_loss_label')} (L)</label>
                                <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.trub_chiller_loss || ""} onChange={e => setEditForm({...editForm, trub_chiller_loss: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('fermenter_loss_label')} (L)</label>
                                <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.fermenter_loss || ""} onChange={e => setEditForm({...editForm, fermenter_loss: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('evap_rate_label')} (L/u)</label>
                                <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.evap_rate || ""} onChange={e => setEditForm({...editForm, evap_rate: parseFloat(e.target.value) || 0})} />
                            </div>
                            {showField('lauter_deadspace') && (
                                <div>
                                    <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('lauter_deadspace_label')} (L)</label>
                                    <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.lauter_deadspace || ""} onChange={e => setEditForm({...editForm, lauter_deadspace: parseFloat(e.target.value) || 0})} />
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('top_up_water_label')} (L)</label>
                                <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.top_up_water || ""} onChange={e => setEditForm({...editForm, top_up_water: parseFloat(e.target.value) || 0})} />
                            </div>
                             {showField('tun_specific_heat') && (
                                <div>
                                    <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('tun_heat_label')}</label>
                                    <input type="number" className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.tun_specific_heat || ""} onChange={e => setEditForm({...editForm, tun_specific_heat: parseFloat(e.target.value) || 0})} />
                                </div>
                            )}
                        </div>
                    </div>
                )
            ) : (
                <div className="space-y-8">
                    <div>
                        <label className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('name_label')}</label>
                        <input className="w-full mt-1 p-4 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-bold focus:ring-2 focus:ring-[var(--color-accent)] outline-none" value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="text-sm font-black text-[var(--color-text)] uppercase tracking-widest">{t('mash_steps')}</h4>
                            <button onClick={addMashStep} className="text-[var(--color-accent-dark)] font-black text-[10px] uppercase hover:underline tracking-wider">+ {t('add_mash_step')}</button>
                        </div>
                        <div className="space-y-3">
                            {(editForm.steps || []).map((s, idx) => (
                                <div key={idx} className="p-4 bg-[var(--color-bg-subtle)] rounded-[var(--radius)] border border-[var(--color-border)] flex flex-col md:flex-row gap-4 items-center relative group">
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col gap-1">
                                            <button onClick={() => moveMashStep(idx, 'up')} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-text)]"><i className="fas fa-chevron-up text-[10px]"></i></button>
                                            <button onClick={() => moveMashStep(idx, 'down')} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-text)]"><i className="fas fa-chevron-down text-[10px]"></i></button>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center text-xs font-black text-[var(--color-text-xmuted)]">{idx + 1}</div>
                                    </div>
                                    <div className="flex-1 w-full md:w-auto">
                                        <input className="w-full bg-[var(--color-bg)] p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs font-bold focus:ring-1 focus:ring-[var(--color-accent)] outline-none" placeholder="Naam stap" value={s.name} onChange={e => updateMashStep(idx, 'name', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
                                        <div>
                                            <label className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase block mb-0.5">Temp (°C)</label>
                                            <input type="number" className="w-full bg-[var(--color-bg)] p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs font-bold" value={s.temperature || s.step_temp} onChange={e => updateMashStep(idx, 'temperature', parseFloat(e.target.value) || 0)} />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase block mb-0.5">Duur (min)</label>
                                            <input type="number" className="w-full bg-[var(--color-bg)] p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs font-bold" value={s.duration || s.step_time} onChange={e => updateMashStep(idx, 'duration', parseFloat(e.target.value) || 0)} />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-black text-[var(--color-text-xmuted)] uppercase block mb-0.5">Type</label>
                                            <select className="w-full bg-[var(--color-bg)] p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs font-bold outline-none" value={s.type} onChange={e => updateMashStep(idx, 'type', e.target.value as any)}>
                                                <option value="infusion">{t('infusion')}</option>
                                                <option value="temperature">{t('temperature')}</option>
                                                <option value="decoction">{t('decoction')}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button onClick={() => removeMashStep(idx)} className="text-stone-300 hover:text-red-500 p-2"><i className="fas fa-trash-alt"></i></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-4 pt-8">
                {activeTab === 'equipment' && creationStep === 2 && (
                    <button onClick={() => setCreationStep(1)} className="flex-1 py-4 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-black text-sm uppercase tracking-widest hover:bg-[var(--color-bg-hover)] transition-all">Terug</button>
                )}
                {(activeTab !== 'equipment' || creationStep === 2) && (
                    <button onClick={saveEditing} className="flex-[2] py-4 bg-[var(--color-accent)] text-white rounded-[var(--radius-sm)] font-black text-sm uppercase tracking-widest hover:opacity-90 transition-all shadow-lg">{t('save_btn')}</button>
                )}
                <button onClick={cancelEditing} className="flex-1 py-4 bg-[var(--color-bg-subtle)] text-[var(--color-text-xmuted)] rounded-[var(--radius-sm)] font-black text-xs uppercase tracking-widest hover:bg-[var(--color-bg-hover)] transition-all">{t('cancel_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrewingInstallationView;

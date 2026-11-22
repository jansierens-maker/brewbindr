import React, { useState, useMemo } from 'react';
import { isListed, receive, stockStatus, StockStatus } from '../services/stockPlanning';
import Combobox from './Combobox';
import ShoppingListDialog from './ShoppingListDialog';
import { matchesQuery, ingredientSearchText } from '../services/search';
import { displayName } from '../services/itemI18n';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { LibraryIngredient, Recipe } from '../types';
import { GlassIndicator, MiniGlassBar } from './GlassIndicator';
import { formatStockAmount } from '../services/calculations';

interface VoorraadViewProps {
  ingredients: LibraryIngredient[];
  onUpdate: (ingredient: LibraryIngredient) => void;
  /** Brewers and tasters see the stock but cannot change it */
  readOnly?: boolean;
  /** The brewery's recipes, for the shopping list */
  recipes?: Recipe[];
}

type ViewMode = 'grid' | 'list';
type SortOption = 'type' | 'name' | 'stock_low' | 'stock_high';

export const VoorraadView: React.FC<VoorraadViewProps> = ({ ingredients, onUpdate, readOnly = false, recipes = [] }) => {
  const { t, lang } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTypes, setActiveTypes] = useState<string[]>(['fermentable', 'hop', 'culture', 'misc']);
  const [sortOption, setSortOption] = useState<SortOption>('type');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [editingIngredient, setEditingIngredient] = useState<LibraryIngredient | null>(null);
  const startEdit = (ing: LibraryIngredient) => { if (!readOnly) setEditingIngredient(ing); };

  // Only the brewery's own items hold stock; shown when there is some, a desired stock or an order
  const [showAll, setShowAll] = useState(false);
  const [shopping, setShopping] = useState(false);
  const ownStockable = useMemo(
    () => ingredients.filter(ing => ['fermentable', 'hop', 'culture', 'misc'].includes(ing.type) && (!ing.status || ing.status === 'private')),
    [ingredients]);
  const stockableIngredients = useMemo(() => (showAll ? ownStockable : ownStockable.filter(isListed)), [ownStockable, showAll]);
  const addable = useMemo(() => ownStockable.filter(i => !isListed(i)), [ownStockable]);

  const filteredIngredients = useMemo(() => {
    let result = stockableIngredients.filter(ing => {
      const matchesSearch = matchesQuery(ingredientSearchText(ing), searchTerm);
      const matchesType = activeTypes.includes(ing.type);
      return matchesSearch && matchesType;
    });

    result.sort((a, b) => {
      if (sortOption === 'type') {
        const typeOrder: Record<string, number> = { fermentable: 1, hop: 2, culture: 3, misc: 4 };
        const diff = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
        if (diff !== 0) return diff;
        return displayName(a, lang).localeCompare(displayName(b, lang));
      } else if (sortOption === 'name') {
        return displayName(a, lang).localeCompare(displayName(b, lang));
      } else if (sortOption === 'stock_low' || sortOption === 'stock_high') {
        const getPct = (ing: LibraryIngredient) => {
          if (!ing.stock?.stock_target) return -1;
          return (ing.stock.amount / ing.stock.stock_target) * 100;
        };
        const pctA = getPct(a);
        const pctB = getPct(b);
        return sortOption === 'stock_low' ? pctA - pctB : pctB - pctA;
      }
      return 0;
    });

    return result;
  }, [stockableIngredients, searchTerm, activeTypes, sortOption]);

  const toggleType = (type: string) => {
    if (type === 'all') {
      if (activeTypes.length === 4) setActiveTypes([]);
      else setActiveTypes(['fermentable', 'hop', 'culture', 'misc']);
      return;
    }
    setActiveTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const getTypeStyle = (type: string, active: boolean) => {
    if (!active) return 'bg-white border-stone-300 text-stone-500';
    switch (type) {
      case 'fermentable': return 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E]';
      case 'hop': return 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]';
      case 'culture': return 'bg-[#EFF6FF] border-[#3B82F6] text-[#1E40AF]';
      case 'misc': return 'bg-[#F5F3FF] border-[#7C3AED] text-[#4C1D95]';
      default: return 'bg-stone-100 border-stone-300 text-stone-700';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'fermentable': return '🌾';
      case 'hop': return '🌿';
      case 'culture': return '🧫';
      case 'misc': return '⚗️';
      default: return '📦';
    }
  };

  const getUnitOptions = (type: string) => {
    switch (type) {
      case 'fermentable': return ['kg', 'g'];
      case 'hop': return ['g'];
      case 'culture': return ['stuk', 'g'];
      case 'misc': return ['kg', 'g', 'liter', 'ml', 'stuk'];
      default: return ['kg', 'g', 'liter', 'ml', 'stuk'];
    }
  };

  const handleSaveStock = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingIngredient) return;
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string) || 0;
    const unit = formData.get('unit') as string;
    const target = parseFloat(formData.get('target') as string) || undefined;
    const ordered = parseFloat(formData.get('ordered') as string) || undefined;
    const orderedAt = (formData.get('ordered_at') as string) || undefined;

    onUpdate({
      ...editingIngredient,
      stock: {
        amount,
        unit,
        stock_target: target,
        ...(ordered && ordered > 0 ? { ordered, ordered_at: orderedAt ?? new Date().toISOString().slice(0, 10) } : {}),
      }
    });
    setEditingIngredient(null);
  };

  return (
    <div className="space-y-6">
      {readOnly && (
        <p className="p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-bold text-[var(--color-text-muted)]">
          <i className="fas fa-lock mr-2" aria-hidden="true"></i>{t('stock_read_only')}
        </p>
      )}
      {/* Filter Bar */}
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] p-4 shadow-[var(--shadow-sm)] flex flex-col md:flex-row items-center gap-4">
        {/* Type Toggles */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleType('all')}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] border text-xs font-bold transition-all cursor-pointer ${
              activeTypes.length === 4
                ? 'bg-[var(--color-text)] border-[var(--color-text)] text-white'
                : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'
            }`}
          >
            {t('filter_all')}
          </button>

          {[
            { id: 'fermentable', key: 'fermentables_label' },
            { id: 'hop', key: 'hops_label' },
            { id: 'culture', key: 'cultures_label' },
            { id: 'misc', key: 'misc_label' }
          ].map(type => (
            <button
              key={type.id}
              onClick={() => toggleType(type.id)}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${getTypeStyle(type.id, activeTypes.includes(type.id))}`}
            >
              <span>{getTypeIcon(type.id)}</span>
              <span className="hidden sm:inline">{t(type.key as any)}</span>
              <span className="sm:hidden">{t(type.key as any).substring(0, 4)}.</span>
            </button>
          ))}
        </div>

        <div className="hidden md:block w-px h-8 bg-[var(--color-border)]"></div>

        {/* Search */}
        <div className="flex-1 w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 flex items-center gap-2 group focus-within:border-[var(--color-accent)] transition-colors">
          <i className="fas fa-search text-[var(--color-text-xmuted)] text-xs"></i>
          <input
            type="text"
            placeholder={t('search_placeholder')}
            className="bg-transparent border-none outline-none text-sm w-full text-[var(--color-text)]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="hidden md:block w-px h-8 bg-[var(--color-border)]"></div>

        {/* Sort */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-bold text-[var(--color-text-xmuted)] whitespace-nowrap">↕ {t('sort_label')}:</span>
          <select
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-bold outline-none flex-1 md:flex-initial text-[var(--color-text)]"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
          >
            <option value="type">{t('misc_type')}</option>
            <option value="name">{t('sort_name_az')}</option>
            <option value="stock_low">{t('sort_stock_low')}</option>
            <option value="stock_high">{t('sort_stock_high')}</option>
          </select>
        </div>

        <div className="hidden md:block w-px h-8 bg-[var(--color-border)]"></div>

        {/* View Toggle */}
        <div className="bg-[var(--color-bg-subtle)] p-1 rounded-[var(--radius-sm)] flex gap-1 border border-[var(--color-border)]">
          <button
            onClick={() => setViewMode('grid')}
            className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-all ${viewMode === 'grid' ? 'bg-[var(--color-bg)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-xmuted)]'}`}
          >
            <i className="fas fa-th-large"></i>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-all ${viewMode === 'list' ? 'bg-[var(--color-bg)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-xmuted)]'}`}
          >
            <i className="fas fa-list"></i>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs font-bold text-[var(--color-text-xmuted)] mr-auto">
          <strong className="text-[var(--color-text)]">{filteredIngredients.length}</strong> {t('ingredients_header')}
        </div>
        {!readOnly && addable.length > 0 && (
          <div className="w-full sm:w-72">
            <Combobox id="stock_add" name="stock_add" label={t('stock_add')} value="" placeholder={`+ ${t('stock_add')}`}
              options={addable.map(i => ({ value: i.id, label: displayName(i, lang), group: t(({ fermentable: 'fermentables_label', hop: 'hops_label', culture: 'cultures_label', misc: 'misc_label' } as Record<string, string>)[i.type] as any) }))}
              onChange={id => { const i = addable.find(x => x.id === id); if (i) startEdit(i); }} />
          </div>
        )}
        <label htmlFor="stock_show_all" className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] cursor-pointer">
          <input id="stock_show_all" name="stock_show_all" type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          {t('stock_show_all')}
        </label>
        <button type="button" onClick={() => setShopping(true)}
          className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-text)] text-white text-xs font-black uppercase tracking-widest">
          <i className="fas fa-cart-shopping mr-1.5" aria-hidden="true"></i>{t('shopping_list')}
        </button>
      </div>

      {/* Main Content: to reorder, ordered, in stock */}
      {SECTIONS.map(sec => {
        const list = filteredIngredients.filter(i => (stockStatus(i) === 'none' ? 'in_stock' : stockStatus(i)) === sec.status);
        if (!list.length) return null;
        return (
          <section key={sec.status} aria-labelledby={`stock-sec-${sec.status}`} className="space-y-3">
            <h3 id={`stock-sec-${sec.status}`} className={`text-xs font-black uppercase tracking-widest ${sec.className}`}>
              <i className={`fas ${sec.icon} mr-2`} aria-hidden="true"></i>{t(sec.label as any)} <span className="tabular-nums">({list.length})</span>
            </h3>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {list.map(ing => {
                const pct = ing.stock?.stock_target ? (ing.stock.amount / ing.stock.stock_target) * 100 : 0;
                const showPct = !!ing.stock?.stock_target;
                return (
                  <button
                    key={ing.id}
                    onClick={() => startEdit(ing)}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] p-4 flex flex-col items-center gap-2 hover:shadow-[var(--shadow)] hover:-translate-y-0.5 transition-all group text-left cursor-pointer"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full self-start mb-1 ${
                      ing.type === 'fermentable' ? 'bg-[#F59E0B]' :
                      ing.type === 'hop' ? 'bg-[#10B981]' :
                      ing.type === 'culture' ? 'bg-[#3B82F6]' : 'bg-[#7C3AED]'
                    }`}></div>
                    <GlassIndicator
                      pct={pct}
                      size={48}
                      showPct={showPct}
                    />
                    <div className="text-center mt-1">
                      <div className="text-xs font-black text-[var(--color-text)] line-clamp-2 leading-tight min-h-[2em]">{displayName(ing, lang)}</div>
                      <div className="text-[10px] font-bold text-[var(--color-text-xmuted)] mt-1">
                        {ing.stock ? `${formatStockAmount(ing.stock.amount, ing.stock.unit, lang)} ${ing.stock.unit}` : '0 -'}
                      </div>
                      {ing.stock?.ordered ? (
                        <div className="text-[10px] font-bold text-sky-700 mt-0.5">{t('stock_ordered_short').replace('{n}', `${formatStockAmount(ing.stock.ordered, ing.stock.unit, lang)} ${ing.stock.unit}`)}</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{t('name_label')}</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{t('misc_type')}</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{t('nav_stock')}</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{t('stock_amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(ing => {
                    const pct = ing.stock?.stock_target ? (ing.stock.amount / ing.stock.stock_target) * 100 : 0;
                    return (
                      <tr
                        key={ing.id}
                        onClick={() => startEdit(ing)}
                        className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)] transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-bold text-[var(--color-text)]">{displayName(ing, lang)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{ing.type}</div>
                        </td>
                        <td className="px-4 py-3 min-w-[150px]">
                          <MiniGlassBar pct={pct} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-bold text-[var(--color-text)]">
                            {ing.stock ? `${formatStockAmount(ing.stock.amount, ing.stock.unit, lang)} ${ing.stock.unit}` : '0 -'}
                            {ing.stock?.stock_target && <span className="text-[var(--color-text-xmuted)] font-medium ml-1">/ {ing.stock.stock_target} {ing.stock.unit}</span>}
                            {ing.stock?.ordered ? <span className="block text-[10px] font-bold text-sky-700">{t('stock_ordered_short').replace('{n}', `${formatStockAmount(ing.stock.ordered, ing.stock.unit, lang)} ${ing.stock.unit}`)}</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </section>
        );
      })}
      {filteredIngredients.length === 0 && (
        <p className="p-6 text-center text-sm text-[var(--color-text-muted)] bg-[var(--color-bg)] border border-dashed border-[var(--color-border)] rounded-[var(--radius)]">{t('stock_empty_hint')}</p>
      )}

      {/* Edit Modal */}
      {editingIngredient && (
        <div className="fixed inset-0 z-[200] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg)] rounded-[var(--radius)] p-6 w-full max-w-sm shadow-[var(--shadow)] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-[var(--color-text)]">{t('edit_stock_title')}</h3>
              <button onClick={() => setEditingIngredient(null)} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-text)]">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-1.5">{t('name_label')}</label>
                <div className="text-sm font-bold text-[var(--color-text)] bg-[var(--color-bg-subtle)] p-3 rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                  {displayName(editingIngredient, lang)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="amount" className="block text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-1.5">{t('stock_amount')}</label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    step="any"
                    defaultValue={editingIngredient.stock?.amount || 0}
                    autoFocus
                    className="w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-4 py-3 text-sm font-bold outline-none focus:border-[var(--color-accent)] transition-colors text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <label htmlFor="unit" className="block text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-1.5">{t('unit_label')}</label>
                  <select
                    id="unit"
                    name="unit"
                    defaultValue={editingIngredient.stock?.unit || getUnitOptions(editingIngredient.type)[0]}
                    className="w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-4 py-3 text-sm font-bold outline-none focus:border-[var(--color-accent)] transition-colors text-[var(--color-text)]"
                  >
                    {getUnitOptions(editingIngredient.type).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="target" className="block text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-1.5">{t('stock_target_label')}</label>
                <input
                  id="target"
                  name="target"
                  type="number"
                  step="any"
                  placeholder={t('optional' as any)}
                  defaultValue={editingIngredient.stock?.stock_target}
                  className="w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-4 py-3 text-sm font-bold outline-none focus:border-[var(--color-accent)] transition-colors text-[var(--color-text)]"
                />
              </div>

              <fieldset className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-border)]">
                <legend className="sr-only">{t('stock_order')}</legend>
                <div>
                  <label htmlFor="ordered" className="block text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-1.5 mt-3">{t('stock_ordered')}</label>
                  <input id="ordered" name="ordered" type="number" step="any" min="0" placeholder={t('optional' as any)} maxLength={10}
                    defaultValue={editingIngredient.stock?.ordered}
                    className="w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-4 py-3 text-sm font-bold outline-none focus:border-[var(--color-accent)] text-[var(--color-text)]" />
                </div>
                <div>
                  <label htmlFor="ordered_at" className="block text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest mb-1.5 mt-3">{t('stock_ordered_at')}</label>
                  <input id="ordered_at" name="ordered_at" type="date" maxLength={10}
                    defaultValue={editingIngredient.stock?.ordered_at ?? new Date().toISOString().slice(0, 10)}
                    className="w-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-3 text-sm font-bold outline-none focus:border-[var(--color-accent)] text-[var(--color-text)]" />
                </div>
                <p className="col-span-2 text-[10px] text-[var(--color-text-xmuted)] -mt-2">{t('stock_ordered_hint')}</p>
              </fieldset>

              {editingIngredient.stock?.ordered ? (
                <div className="p-3 rounded-[var(--radius-sm)] bg-sky-50 border border-sky-200 space-y-2">
                  <label htmlFor="received" className="block text-[10px] font-black text-sky-800 uppercase tracking-widest">{t('stock_received')}</label>
                  <div className="flex gap-2">
                    <input id="received" name="received" type="number" step="any" min="0" maxLength={10} defaultValue={editingIngredient.stock.ordered}
                      className="flex-1 min-w-0 bg-white border border-sky-200 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-bold text-[var(--color-text)]" />
                    <button type="button"
                      onClick={e => {
                        const field = (e.currentTarget.form?.elements.namedItem('received') as HTMLInputElement | null);
                        const qty = parseFloat(field?.value ?? '');
                        if (!(qty > 0) || !editingIngredient) return;
                        onUpdate(receive(editingIngredient, qty));
                        setEditingIngredient(null);
                      }}
                      className="px-3 py-2 rounded-[var(--radius-sm)] bg-sky-700 text-white text-xs font-black uppercase tracking-widest">
                      {t('stock_receive')}
                    </button>
                  </div>
                  <p className="text-[10px] text-sky-800">{t('stock_received_hint')}</p>
                </div>
              ) : null}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingIngredient(null)}
                  className="flex-1 py-3 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-black text-xs uppercase tracking-widest hover:bg-[var(--color-bg-hover)] transition-all"
                >
                  {t('cancel_btn')}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[var(--color-text)] text-white rounded-[var(--radius-sm)] font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-lg"
                >
                  {t('save_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {shopping && (
        <ShoppingListDialog ingredients={ownStockable} recipes={recipes} readOnly={readOnly} onClose={() => setShopping(false)}
          onMarkOrdered={items => items.forEach(onUpdate)} />
      )}
    </div>
  );
};

const SECTIONS: { status: StockStatus; label: string; icon: string; className: string }[] = [
  { status: 'reorder', label: 'stock_sec_reorder', icon: 'fa-triangle-exclamation', className: 'text-amber-700' },
  { status: 'ordered', label: 'stock_sec_ordered', icon: 'fa-truck', className: 'text-sky-700' },
  { status: 'in_stock', label: 'stock_sec_in_stock', icon: 'fa-box', className: 'text-[var(--color-text-muted)]' },
];

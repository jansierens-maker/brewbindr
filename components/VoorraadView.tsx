import React, { useState, useMemo } from 'react';
import { LibraryIngredient } from '../types';
import { useTranslation } from '../App';
import { GlassIndicator, MiniGlassBar } from './GlassIndicator';

interface VoorraadViewProps {
  ingredients: LibraryIngredient[];
  onUpdateStock: (id: string, type: string, stock: { amount: number; unit: string; max_amount?: number }) => void;
}

type SortOption = 'type' | 'name-az' | 'name-za' | 'stock-up' | 'stock-down';
type ViewMode = 'grid' | 'list';

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
  fermentable: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: '🌾', label: 'grains' },
  hop: { bg: '#ECFDF5', border: '#10B981', text: '#065F46', icon: '🌿', label: 'hops' },
  culture: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF', icon: '🧫', label: 'yeast' },
  misc: { bg: '#F5F3FF', border: '#7C3AED', text: '#4C1D95', icon: '⚗️', label: 'miscs_label' },
};

const UNITS_PER_TYPE: Record<string, string[]> = {
  fermentable: ['kg', 'g'],
  hop: ['g'],
  culture: ['stuk', 'g'],
  misc: ['kg', 'g', 'liter', 'ml', 'stuk'],
};

export const VoorraadView: React.FC<VoorraadViewProps> = ({ ingredients, onUpdateStock }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('type');
  const [activeTypes, setActiveTypes] = useState<string[]>(['fermentable', 'hop', 'culture', 'misc']);
  const [editingItem, setEditingItem] = useState<LibraryIngredient | null>(null);

  // Form state
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editUnit, setEditUnit] = useState<string>('g');
  const [editMaxAmount, setEditMaxAmount] = useState<number | undefined>(undefined);

  const filteredItems = useMemo(() => {
    return ingredients
      .filter(item => ['fermentable', 'hop', 'culture', 'misc'].includes(item.type))
      .filter(item => activeTypes.includes(item.type))
      .filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'type') {
          const typeOrder = ['fermentable', 'hop', 'culture', 'misc'];
          const diff = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        if (sortBy === 'name-az') return a.name.localeCompare(b.name);
        if (sortBy === 'name-za') return b.name.localeCompare(a.name);

        const getPct = (item: LibraryIngredient) => {
          if (!item.stock?.max_amount) return -1;
          return (item.stock.amount / item.stock.max_amount) * 100;
        };

        if (sortBy === 'stock-up') return getPct(a) - getPct(b);
        if (sortBy === 'stock-down') return getPct(b) - getPct(a);
        return 0;
      });
  }, [ingredients, activeTypes, search, sortBy]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleOpenEdit = (item: LibraryIngredient) => {
    setEditingItem(item);
    setEditAmount(item.stock?.amount || 0);
    setEditUnit(item.stock?.unit || UNITS_PER_TYPE[item.type]?.[0] || 'g');
    setEditMaxAmount(item.stock?.max_amount);
  };

  const handleSave = () => {
    if (editingItem) {
      onUpdateStock(editingItem.id, editingItem.type, {
        amount: editAmount,
        unit: editUnit,
        max_amount: editMaxAmount || undefined
      });
      setEditingItem(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4">
        {/* Filter Bar */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 shadow-sm">
          {/* Type Toggles */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPE_COLORS).map(([type, colors]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                style={{
                  backgroundColor: activeTypes.includes(type) ? colors.bg : 'white',
                  borderColor: activeTypes.includes(type) ? colors.border : '#CBD5E1',
                  color: activeTypes.includes(type) ? colors.text : '#64748B'
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
              >
                <span>{colors.icon}</span>
                <span className="hidden sm:inline">{t(colors.label as any)}</span>
                <span className="sm:hidden">{t(colors.label as any).substring(0, 4)}.</span>
              </button>
            ))}
          </div>

          <div className="hidden md:block w-px h-8 bg-stone-100" />

          {/* Search */}
          <div className="flex-1 flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 w-full">
            <i className="fas fa-search text-stone-400 text-sm"></i>
            <input
              type="text"
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-stone-900 w-full font-medium"
            />
          </div>

          <div className="hidden md:block w-px h-8 bg-stone-100" />

          {/* Sort & View Toggles */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest hidden lg:block">{t('sort_label')}:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-bold text-stone-600 outline-none hover:border-stone-300 transition-colors"
              >
                <option value="type">{t('misc_type')}</option>
                <option value="name-az">{t('sort_name_az')}</option>
                <option value="name-za">{t('sort_name_za')}</option>
                <option value="stock-up">{t('sort_stock_up')}</option>
                <option value="stock-down">{t('sort_stock_down')}</option>
              </select>
            </div>

            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                aria-label="Grid view"
              >
                <i className="fas fa-th-large"></i>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                aria-label="List view"
              >
                <i className="fas fa-list"></i>
              </button>
            </div>
          </div>
        </div>

        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-1">
          <strong>{filteredItems.length}</strong> {t('total_ingredients')}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredItems.map(item => {
            const pct = item.stock?.max_amount ? Math.round((item.stock.amount / item.stock.max_amount) * 100) : 0;
            const hasStockConfig = !!item.stock?.max_amount;
            return (
              <div
                key={item.id}
                onClick={() => handleOpenEdit(item)}
                className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col items-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
              >
                <div
                  className="w-2 h-2 rounded-full mb-1"
                  style={{ backgroundColor: TYPE_COLORS[item.type]?.border || '#CBD5E1' }}
                />
                <GlassIndicator
                  pct={hasStockConfig ? pct : 0}
                  size={48}
                  showPct={hasStockConfig}
                />
                <div className="text-center">
                  <p className="text-xs font-bold text-stone-900 line-clamp-2 leading-snug group-hover:text-amber-600 transition-colors">{item.name}</p>
                  <p className="text-[10px] text-stone-400 font-medium mt-1">
                    {item.stock ? `${item.stock.amount} ${item.stock.unit}` : `0 ${UNITS_PER_TYPE[item.type]?.[0] || 'g'}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('name_label')}</th>
                <th className="px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest hidden sm:table-cell">{t('misc_type')}</th>
                <th className="px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('stock_label')}</th>
                <th className="px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest text-right">{t('stock_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const pct = item.stock?.max_amount ? Math.round((item.stock.amount / item.stock.max_amount) * 100) : 0;
                const hasStockConfig = !!item.stock?.max_amount;
                return (
                  <tr
                    key={item.id}
                    onClick={() => handleOpenEdit(item)}
                    className="border-b border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TYPE_COLORS[item.type]?.border || '#CBD5E1' }}
                        />
                        <span className="text-sm font-bold text-stone-900">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t(TYPE_COLORS[item.type]?.label as any)}</span>
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <MiniGlassBar pct={hasStockConfig ? pct : 0} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-stone-600">
                        {item.stock ? `${item.stock.amount} ${item.stock.unit}` : `0 ${UNITS_PER_TYPE[item.type]?.[0] || 'g'}`}
                      </span>
                      {item.stock?.max_amount && (
                        <span className="text-[10px] text-stone-400 font-medium ml-1">
                          / {item.stock.max_amount} {item.stock.unit}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-stone-900">{t('adjust_stock')}</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-stone-300 hover:text-stone-900 transition-colors"
                aria-label="Close"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: TYPE_COLORS[editingItem.type]?.border || '#CBD5E1' }}
                >
                  <span className="text-xl">{TYPE_COLORS[editingItem.type]?.icon}</span>
                </div>
                <div>
                  <p className="text-xs font-black text-stone-400 uppercase tracking-widest leading-none mb-1">{t(TYPE_COLORS[editingItem.type]?.label as any)}</p>
                  <p className="text-lg font-bold text-stone-900 leading-tight">{editingItem.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="stock-amount" className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-1">{t('stock_amount')}</label>
                  <input
                    id="stock-amount"
                    name="stock_amount"
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value))}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="stock-unit" className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-1">{t('unit_label')}</label>
                  <select
                    id="stock-unit"
                    name="stock_unit"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  >
                    {UNITS_PER_TYPE[editingItem.type]?.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="max-amount" className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-1">{t('max_amount_label')} (100%)</label>
                <div className="relative">
                  <input
                    id="max-amount"
                    name="max_amount"
                    type="number"
                    placeholder="bijv. 5000"
                    value={editMaxAmount || ''}
                    onChange={(e) => setEditMaxAmount(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-900 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm pointer-events-none">
                    {editUnit}
                  </div>
                </div>
                <p className="text-[10px] text-stone-400 font-medium px-1">De maximale voorraad bepaalt hoe vol het glas getoond wordt.</p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  {t('cancel_btn')}
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                >
                  {t('save_btn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

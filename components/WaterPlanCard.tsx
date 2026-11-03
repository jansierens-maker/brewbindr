import React from 'react';
import { LibraryIngredient, Recipe } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { waterPlan, formatBrewNumber, formatGravity } from '../services/calculations';

interface WaterPlanCardProps {
  recipe: Recipe;
  equipment: LibraryIngredient | undefined;
  og: number | undefined;
  /** Editor only: choose the installation. Without it the card just shows the plan. */
  equipmentOptions?: LibraryIngredient[];
  onEquipmentChange?: (id: string | undefined) => void;
  /** The installation used when the recipe names none (the brewery's only one) */
  defaultEquipment?: LibraryIngredient;
}

/** Water volumes and strike temperature for brew day, from the recipe and the installation. */
const WaterPlanCard: React.FC<WaterPlanCardProps> = ({ recipe, equipment, og, equipmentOptions, onEquipmentChange, defaultEquipment }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const imperial = preferences.units === 'imperial';
  const vol = (l: number) => imperial ? `${formatBrewNumber(l / 3.78541, 'vol', lang, preferences, 'gallons')} gal` : `${formatBrewNumber(l, 'vol', lang)} L`;
  const temp = (c: number) => imperial ? `${Math.round(c * 9 / 5 + 32)} °F` : `${formatBrewNumber(c, 'temp', lang)} °C`;
  const plan = equipment ? waterPlan(recipe, equipment, og) : undefined;

  const Item: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className={`p-3 rounded-xl ${strong ? 'bg-sky-100' : 'bg-white'} border border-sky-100`}>
      <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{label}</p>
      <p className={`font-black ${strong ? 'text-xl text-sky-900' : 'text-lg text-stone-900'}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-4 p-5 bg-sky-50/50 rounded-2xl border border-sky-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h4 className="font-bold uppercase text-stone-900 flex items-center gap-2">
          <i className="fas fa-tint text-sky-600" aria-hidden="true"></i> {t('water_plan')}
        </h4>
        {equipmentOptions && onEquipmentChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="recipe_equipment" className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('brewing_installation')}</label>
            <select
              id="recipe_equipment"
              name="recipe_equipment"
              className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-700"
              value={recipe.equipmentId ?? ''}
              onChange={e => onEquipmentChange(e.target.value || undefined)}
            >
              <option value="">{defaultEquipment ? t('equipment_default').replace('{name}', defaultEquipment.name) : t('equipment_none')}</option>
              {equipmentOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {!plan ? (
        <p className="text-xs font-bold text-stone-500">{t('water_needs_equipment')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Item label={t('water_mash')} value={vol(plan.mashWaterL)} strong />
            <Item label={t('water_sparge')} value={vol(plan.spargeWaterL)} strong />
            <Item label={t('water_total')} value={vol(plan.totalWaterL)} />
            <Item label={t('strike_temp')} value={plan.strikeTempC !== undefined ? temp(plan.strikeTempC) : '-'} strong />
            <Item label={t('pre_boil_volume')} value={vol(plan.preBoilL)} />
            <Item label={t('pre_boil_gravity')} value={formatGravity(plan.preBoilSg, lang, preferences.gravityUnit)} />
            <Item label={t('post_boil_volume')} value={vol(plan.postBoilL)} />
            <Item label={t('grain_bill')} value={`${formatBrewNumber(plan.grainKg, 'kg', lang, preferences)} ${imperial ? 'lb' : 'kg'}`} />
          </div>
          <p className="text-[10px] text-stone-500">
            {t('water_plan_hint')
              .replace('{name}', equipment!.name)
              .replace('{grain}', temp(plan.grainTempC))
              .replace('{mash}', plan.mashTempC !== undefined ? temp(plan.mashTempC) : '-')}
          </p>
        </>
      )}
    </div>
  );
};

export default WaterPlanCard;

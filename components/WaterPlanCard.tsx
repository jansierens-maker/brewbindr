import React from 'react';
import { LibraryIngredient, Recipe } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { waterPlan, equipmentCapacity, formatBrewNumber, formatGravity, roundTo, WaterWarning } from '../services/calculations';

type RecipeWater = NonNullable<Recipe['water']>;

interface WaterPlanCardProps {
  recipe: Recipe;
  equipment: LibraryIngredient | undefined;
  og: number | undefined;
  /** Editor only: choose the installation and set the water by hand. Without these the card only shows the plan. */
  equipmentOptions?: LibraryIngredient[];
  onEquipmentChange?: (id: string | undefined) => void;
  onWaterChange?: (water: RecipeWater | undefined) => void;
  /** The installation used when the recipe names none (the brewery's only one) */
  defaultEquipment?: LibraryIngredient;
  /** Installation chosen in the picker (default: the recipe's) */
  selectedEquipmentId?: string;
}

const WARNING_KEYS = {
  mash_capped: 'water_warn_mash_capped',
  too_much_grain: 'water_warn_too_much_grain',
  grain_over_capacity: 'water_warn_grain_over_capacity',
  mash_over_capacity: 'water_warn_mash_over_capacity',
  boil_over_capacity: 'water_warn_boil_over_capacity',
} as const satisfies Record<WaterWarning, string>;

/** Water volumes and strike temperature for brew day, from the recipe and the installation. */
const WaterPlanCard: React.FC<WaterPlanCardProps> = ({ recipe, equipment, og, equipmentOptions, onEquipmentChange, onWaterChange, defaultEquipment, selectedEquipmentId }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const imperial = preferences.units === 'imperial';
  const GAL = 3.78541;
  const vol = (l: number) => imperial ? `${formatBrewNumber(l / GAL, 'vol', lang, preferences, 'gallons')} gal` : `${formatBrewNumber(l, 'vol', lang)} L`;
  const temp = (c: number) => imperial ? `${Math.round(c * 9 / 5 + 32)} °F` : `${formatBrewNumber(c, 'temp', lang)} °C`;
  const toDisplay = (l: number) => roundTo(imperial ? l / GAL : l, imperial ? 2 : 1);
  const plan = equipment ? waterPlan(recipe, equipment, og) : undefined;
  const water = recipe.water ?? {};
  const editable = !!onWaterChange;

  const setWater = (patch: Partial<RecipeWater>) => {
    const next = { ...water, ...patch };
    (Object.keys(next) as (keyof RecipeWater)[]).forEach(k => next[k] === undefined && delete next[k]);
    onWaterChange?.(Object.keys(next).length ? next : undefined);
  };
  const parseVolume = (raw: string) => {
    const n = parseFloat(raw);
    return isNaN(n) || n < 0 ? undefined : roundTo(imperial ? n * GAL : n, 1);
  };

  const item = (label: string, value: string, strong?: boolean) => (
    <div key={label} className={`p-3 rounded-xl ${strong ? 'bg-sky-100' : 'bg-white'} border border-sky-100`}>
      <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{label}</p>
      <p className={`font-black ${strong ? 'text-xl text-sky-900' : 'text-lg text-stone-900'}`}>{value}</p>
    </div>
  );

  const volumeInput = (id: 'mash_l' | 'sparge_l', label: string, suggested: number) => (
    <div key={id} className="p-3 rounded-xl bg-sky-100 border border-sky-100">
      <label htmlFor={`water_${id}`} className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{label} ({imperial ? 'gal' : 'L'})</label>
      <input
        id={`water_${id}`}
        name={`water_${id}`}
        type="number"
        inputMode="decimal"
        step={imperial ? 0.05 : 0.1}
        min={0}
        max={imperial ? 50 : 200}
        placeholder={String(toDisplay(suggested))}
        className={`w-full mt-1 p-2 rounded-lg border text-xl font-black ${water[id] !== undefined ? 'bg-white border-sky-400 text-sky-900' : 'bg-sky-50 border-sky-200 text-sky-900 placeholder:text-sky-900'}`}
        defaultValue={water[id] !== undefined ? toDisplay(water[id]!) : ''}
        key={`${id}-${water[id] ?? 'auto'}`}
        onBlur={e => setWater({ [id]: parseVolume(e.target.value) })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      />
      <p className="text-[10px] font-bold text-stone-500 mt-1">
        {water[id] !== undefined ? `${t('water_suggested')}: ${vol(suggested)}` : t('water_calculated')}
      </p>
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
              value={(selectedEquipmentId !== undefined ? selectedEquipmentId : recipe.equipmentId) ?? ''}
              onChange={e => onEquipmentChange(e.target.value || undefined)}
            >
              <option value="">{defaultEquipment ? t('equipment_default').replace('{name}', defaultEquipment.name) : t('equipment_none')}</option>
              {equipmentOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {!plan ? (
        <p className="text-xs font-bold text-stone-500">{t(equipmentOptions?.length && onEquipmentChange ? 'water_needs_equipment' : 'water_no_equipment')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {editable ? (
              <>
                {volumeInput('mash_l', t('water_mash'), plan.suggestedMashL)}
                {volumeInput('sparge_l', t('water_sparge'), plan.suggestedSpargeL)}
              </>
            ) : (
              <>
                {item(t('water_mash'), vol(plan.mashWaterL), true)}
                {item(t('water_sparge'), vol(plan.spargeWaterL), true)}
              </>
            )}
            {item(t('water_total'), vol(plan.totalWaterL))}
            {item(t('strike_temp'), plan.strikeTempC !== undefined ? temp(plan.strikeTempC) : '-', true)}
            {item(t('pre_boil_volume'), vol(plan.preBoilL))}
            {item(t('pre_boil_gravity'), formatGravity(plan.preBoilSg, lang, preferences.gravityUnit))}
            {item(t('into_fermenter'), vol(plan.intoFermenterL))}
            {plan.manual
              ? item(t('expected_og'), formatGravity(plan.expectedOg, lang, preferences.gravityUnit))
              : item(t('grain_bill'), `${formatBrewNumber(plan.grainKg, 'kg', lang, preferences)} ${imperial ? 'lb' : 'kg'}`)}
          </div>

          {editable && (
            <div className="flex flex-wrap items-center gap-4">
              <label htmlFor="water_drain_all" className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
                <input id="water_drain_all" name="water_drain_all" type="checkbox" className="w-4 h-4 accent-sky-600"
                  checked={!!water.drain_all} onChange={e => setWater({ drain_all: e.target.checked || undefined })} />
                {t('drain_all').replace('{loss}', vol(equipment!.trub_chiller_loss || 0))}
              </label>
              {plan.manual && (
                <button type="button" onClick={() => setWater({ mash_l: undefined, sparge_l: undefined })}
                  className="text-xs font-black uppercase text-sky-700 underline">
                  {t('water_use_calculated')}
                </button>
              )}
            </div>
          )}
          {!editable && water.drain_all && <p className="text-xs font-bold text-stone-600">{t('drain_all_on')}</p>}

          {plan.warnings.length > 0 && (
            <ul className="space-y-1" role="status">
              {plan.warnings.map(w => (
                <li key={w} className="text-xs font-bold text-amber-800 flex gap-2">
                  <i className="fas fa-exclamation-triangle mt-0.5" aria-hidden="true"></i>
                  {t(WARNING_KEYS[w])
                    .replace('{max}', plan.maxMashL !== undefined ? vol(plan.maxMashL) : '-')
                    .replace('{boil}', vol(equipmentCapacity(equipment!).boilCapacity ?? 0))
                    .replace('{kg}', formatBrewNumber(equipmentCapacity(equipment!).maxGrainKg ?? 0, 'kg', lang))}
                </li>
              ))}
            </ul>
          )}

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

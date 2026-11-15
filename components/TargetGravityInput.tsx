import React, { useEffect, useState } from 'react';
import { useUser } from '../services/userContext';
import { sgToPlato, platoToSg, roundTo } from '../services/calculations';

interface Props {
  id: string;
  name: string;
  label: string;
  /** Always SG; undefined: no target */
  value: number | undefined;
  onChange: (sg: number | undefined) => void;
  disabled?: boolean;
}

const toText = (sg: number | undefined, plato: boolean) =>
  sg === undefined ? '' : plato ? String(roundTo(sgToPlato(sg), 1)) : String(roundTo(sg, 3));

/** A gravity to aim for, entered in SG or °P (user preference) and stored as SG. Empty: none. */
const TargetGravityInput: React.FC<Props> = ({ id, name, label, value, onChange, disabled }) => {
  const { preferences } = useUser();
  const plato = preferences.gravityUnit === 'plato';
  // Keep what the user types (e.g. "1.05") instead of reformatting on every key
  const [text, setText] = useState(toText(value, plato));

  useEffect(() => {
    const typed = parseFloat(text.replace(',', '.'));
    const typedSg = isNaN(typed) ? undefined : plato ? platoToSg(typed) : typed;
    const same = typedSg === undefined ? value === undefined : value !== undefined && Math.abs(typedSg - value) < (plato ? 0.0002 : 0.0005);
    if (!same) setText(toText(value, plato));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, plato]);

  const handle = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw.replace(',', '.'));
    if (isNaN(n)) return onChange(undefined);
    const sg = plato ? roundTo(platoToSg(n), 4) : n;
    onChange(sg > 1 && sg < 1.2 ? sg : undefined);
  };

  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-stone-400 uppercase">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} name={name} type="text" inputMode="decimal" maxLength={6} disabled={disabled}
          className="flex-1 min-w-0 p-3 bg-stone-50 border rounded-xl font-bold" placeholder={plato ? '12.5' : '1.050'}
          value={text} onChange={e => handle(e.target.value)} />
        <span className="text-xs font-bold text-stone-400">{plato ? '°P' : 'SG'}</span>
      </div>
    </div>
  );
};

export default TargetGravityInput;

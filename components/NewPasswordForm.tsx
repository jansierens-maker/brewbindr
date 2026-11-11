import React, { useState } from 'react';
import { useTranslation } from '../App';
import { MIN_PASSWORD_LENGTH, newPasswordProblem, pwnedCount } from '../services/passwordCheck';

interface Props {
  /** Ask for the current password too (changing it while signed in) */
  askCurrent?: boolean;
  /** Checks the current password; resolve false when it is wrong */
  verifyCurrent?: (current: string) => Promise<boolean>;
  /** Stores the new password; throw to show the error */
  onSubmit: (password: string) => Promise<void>;
  submitLabel: string;
  idPrefix: string;
}

/** New password twice (and optionally the current one), with the sign-up rules. */
const NewPasswordForm: React.FC<Props> = ({ askCurrent, verifyCurrent, onSubmit, submitLabel, idPrefix }) => {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = newPasswordProblem(password, confirm, askCurrent ? current : undefined);
    if (problem === 'short') return setError(t('auth_error_password_short').replace('{n}', String(MIN_PASSWORD_LENGTH)));
    if (problem === 'mismatch') return setError(t('password_error_mismatch'));
    if (problem === 'same') return setError(t('password_error_same'));
    setBusy(true);
    try {
      if (askCurrent && verifyCurrent && !(await verifyCurrent(current))) {
        setError(t('password_error_current_wrong'));
        return;
      }
      const breached = await pwnedCount(password);
      if (breached && breached > 0) {
        setError(t('auth_error_password_pwned').replace('{n}', breached.toLocaleString()));
        return;
      }
      await onSubmit(password);
      setCurrent(''); setPassword(''); setConfirm('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('auth_error_generic'));
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string, hint?: string) => (
    <div>
      <label htmlFor={`${idPrefix}-${id}`} className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{label}</label>
      <input
        id={`${idPrefix}-${id}`}
        name={id}
        type="password"
        required
        maxLength={100}
        autoComplete={autoComplete}
        value={value}
        onChange={e => set(e.target.value)}
        aria-describedby={hint ? `${idPrefix}-${id}-hint` : undefined}
        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500/20 outline-none"
      />
      {hint && <p id={`${idPrefix}-${id}-hint`} className="text-[10px] text-stone-400 mt-1 font-bold italic">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {askCurrent && field('current_password', t('password_current_label'), current, setCurrent, 'current-password')}
      {field('new_password', t('password_new_label'), password, setPassword, 'new-password', t('auth_password_hint').replace('{n}', String(MIN_PASSWORD_LENGTH)))}
      {field('confirm_password', t('password_confirm_label'), confirm, setConfirm, 'new-password')}
      {error && (
        <p role="alert" className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold">{error}</p>
      )}
      <button type="submit" disabled={busy} className="w-full py-3 bg-stone-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-black disabled:opacity-50">
        {busy ? <i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i> : submitLabel}
      </button>
    </form>
  );
};

export default NewPasswordForm;

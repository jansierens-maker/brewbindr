import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useTranslation } from '../App';

interface AuthProps {
  onSuccess?: () => void;
  initialIsSignUp?: boolean;
}

const Auth: React.FC<AuthProps> = ({ onSuccess, initialIsSignUp = false }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp);

  useEffect(() => {
    setIsSignUp(initialIsSignUp);
  }, [initialIsSignUp]);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!email.includes('@')) {
      setError(t('auth_error_invalid_email' as any));
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError(t('auth_error_password_short' as any));
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        await authService.signUp(email, password, inviteCode.trim() || undefined);
        alert(t('auth_signup_confirm' as any));
      } else {
        await authService.signIn(email, password);
        if (inviteCode.trim()) {
           localStorage.setItem('pending_invite_code', inviteCode.trim());
        }
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setError(err.message || t('auth_error_generic' as any));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-3xl border border-stone-200 shadow-xl animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-8">
        <div className="bg-amber-500 w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
          <i className="fas fa-beer-mug-empty text-3xl"></i>
        </div>
        <h2 className="text-3xl font-black text-stone-900 uppercase italic">brewbindr</h2>
        <p className="text-stone-400 font-bold text-xs uppercase tracking-widest mt-1">
          {isSignUp ? t('auth_signup_title' as any) : t('auth_signin_title' as any)}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-email" className="block text-[10px] font-black text-stone-400 uppercase mb-1 ml-1">{t('auth_email_label' as any)}</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            required
            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="brewmaster@example.com"
            maxLength={255}
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="block text-[10px] font-black text-stone-400 uppercase mb-1 ml-1">{t('auth_password_label' as any)}</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            required
            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            maxLength={100}
          />
        </div>

        {isSignUp && (
          <div>
            <label htmlFor="auth-invite-code" className="block text-[10px] font-black text-stone-400 uppercase mb-1 ml-1">{t('auth_invite_code_label' as any)}</label>
            <input
              id="auth-invite-code"
              name="invite_code"
              type="text"
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500/20 outline-none transition-all uppercase placeholder:normal-case"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              maxLength={20}
            />
            <p className="text-[9px] text-stone-400 mt-1 ml-1 font-bold italic">{t('auth_invite_code_hint' as any)}</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg disabled:opacity-50 mt-2"
        >
          {loading ? (
            <i className="fas fa-circle-notch fa-spin"></i>
          ) : (
            isSignUp ? t('auth_signup_btn' as any) : t('auth_signin_btn' as any)
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-stone-100 text-center">
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-stone-400 hover:text-amber-600 font-bold text-xs uppercase tracking-widest transition-colors"
        >
          {isSignUp ? t('auth_switch_to_signin' as any) : t('auth_switch_to_signup' as any)}
        </button>
      </div>
    </div>
  );
};

export default Auth;

import React, { useState } from 'react';
import { authService } from '../services/authService';

interface AuthProps {
  onSuccess?: () => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        await authService.signUp(email, password);
        alert('Check your email for the confirmation link!');
      } else {
        await authService.signIn(email, password);
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
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
          {isSignUp ? 'Create an account' : 'Sign in to your brewery'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-stone-400 uppercase mb-1 ml-1">Email Address</label>
          <input
            type="email"
            required
            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="brewmaster@example.com"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-stone-400 uppercase mb-1 ml-1">Password</label>
          <input
            type="password"
            required
            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

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
            isSignUp ? 'Sign Up' : 'Sign In'
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-stone-100 text-center">
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-stone-400 hover:text-amber-600 font-bold text-xs uppercase tracking-widest transition-colors"
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  );
};

export default Auth;

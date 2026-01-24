import React from 'react';
import { useUser } from '../services/userContext';
import { useTranslation } from '../App';

const Settings: React.FC = () => {
  const { preferences, updatePreferences, signOut, user } = useUser();
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-4xl font-black text-stone-900">Settings</h2>
        <p className="text-stone-500 font-medium mt-1">Manage your brewing preferences and account.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Unit Preferences */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
              <i className="fas fa-ruler-combined text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">Units & Measurement</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Unit System</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updatePreferences({ units: 'metric' })}
                  className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all ${
                    preferences.units === 'metric'
                      ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm'
                      : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                  }`}
                >
                  Metric (kg, L, °C)
                </button>
                <button
                  onClick={() => updatePreferences({ units: 'imperial' })}
                  className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all ${
                    preferences.units === 'imperial'
                      ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm'
                      : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                  }`}
                >
                  Imperial (lb, gal, °F)
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Color Scale</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updatePreferences({ colorScale: 'srm' })}
                  className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all ${
                    preferences.colorScale === 'srm'
                      ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm'
                      : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                  }`}
                >
                  SRM
                </button>
                <button
                  onClick={() => updatePreferences({ colorScale: 'ebc' })}
                  className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all ${
                    preferences.colorScale === 'ebc'
                      ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm'
                      : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                  }`}
                >
                  EBC
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8 flex flex-col">
          <div className="flex items-center gap-3">
            <div className="bg-stone-100 p-3 rounded-2xl text-stone-600">
              <i className="fas fa-user-circle text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">Account</h3>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Signed in as</p>
              <p className="font-bold text-stone-900">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-100 transition-all"
          >
            <i className="fas fa-sign-out-alt mr-2"></i> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;

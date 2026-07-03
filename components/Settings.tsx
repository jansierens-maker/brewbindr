import React, { useState } from 'react';
import { useUser } from '../services/userContext';
import { useTranslation } from '../App';
import { Language } from '../services/i18n';
import BrewerySettings from './BrewerySettings';

const Settings: React.FC = () => {
  const { preferences, updatePreferences, signOut, user } = useUser();
  const { t } = useTranslation();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setLoggingOut(true);
    await signOut();
    // No need to setLoggingOut(false) here because the component might unmount or state will change
  };

  const [settingsTab, setSettingsTab] = useState<'preferences' | 'brewery'>('preferences');

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-stone-900">{t('settings_label')}</h2>
          <p className="text-stone-500 font-medium mt-1">{t('settings_desc')}</p>
        </div>

        {user && (
          <div className="flex bg-stone-100 p-1 rounded-2xl w-fit">
            <button
              onClick={() => setSettingsTab('preferences')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsTab === 'preferences' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
            >
              Preferences
            </button>
            <button
              onClick={() => setSettingsTab('brewery')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsTab === 'brewery' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
            >
              Brewery
            </button>
          </div>
        )}
      </div>

      {settingsTab === 'brewery' ? (
        <BrewerySettings />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Unit Preferences */}
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
                <i className="fas fa-ruler-combined text-2xl"></i>
              </div>
              <h3 className="text-2xl font-black text-stone-900">{t('units_color_title')}</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('unit_system_label')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => updatePreferences({ units: 'metric' })}
                    className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all ${
                      preferences.units === 'metric'
                        ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm'
                        : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                    }`}
                  >
                    {t('metric_desc')}
                  </button>
                  <button
                    onClick={() => updatePreferences({ units: 'imperial' })}
                    className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all ${
                      preferences.units === 'imperial'
                        ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm'
                        : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                    }`}
                  >
                    {t('imperial_desc')}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('color_scale_label')}</p>
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

          {/* Stock Management Setting */}
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-stone-100 p-3 rounded-2xl text-stone-600">
                  <i className="fas fa-boxes text-2xl"></i>
                </div>
                <h3 className="text-2xl font-black text-stone-900">{t('enable_stock_title')}</h3>
              </div>

              <button
                onClick={() => updatePreferences({ enableStockManagement: !preferences.enableStockManagement })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none ${
                  preferences.enableStockManagement ? 'bg-amber-500 shadow-sm shadow-amber-200' : 'bg-stone-200'
                }`}
                aria-label={t('enable_stock_title')}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ${
                    preferences.enableStockManagement ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex-1">
              <p className="text-sm text-stone-500 font-medium leading-relaxed">
                {t('enable_stock_desc')}
              </p>
            </div>
          </div>

          {/* Language Preferences */}
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                <i className="fas fa-language text-2xl"></i>
              </div>
              <h3 className="text-2xl font-black text-stone-900">{t('language_label')}</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('select_language_label')}</p>
                <div className="grid grid-cols-1 gap-3">
                  {(['en', 'nl', 'fr'] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => updatePreferences({ language: l })}
                      className={`py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest border-2 transition-all flex items-center justify-between ${
                        preferences.language === l
                          ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm'
                          : 'bg-white border-stone-100 text-stone-400 hover:border-stone-200'
                      }`}
                    >
                      <span>{l === 'en' ? t('english') : l === 'nl' ? t('nederlands') : t('français')}</span>
                      {preferences.language === l && <i className="fas fa-check-circle"></i>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8 flex flex-col">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl text-white ${user ? 'bg-amber-500' : 'bg-stone-400'}`}>
                <i className={`fas ${user ? 'fa-user-check' : 'fa-user-circle'} text-2xl`}></i>
              </div>
              <h3 className="text-2xl font-black text-stone-900">{t('account_label')}</h3>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{user ? t('signed_in_as') : t('guest_mode')}</p>
                <p className="font-bold text-stone-900">{user?.email || t('guest_user')}</p>
              </div>
            </div>

            {user && (
              <button
                onClick={handleSignOut}
                disabled={loggingOut}
                className={`w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2 ${loggingOut ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loggingOut ? (
                  <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <i className="fas fa-sign-out-alt"></i>
                )}
                {loggingOut ? t('signing_out') || 'Signing out...' : t('sign_out_btn')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

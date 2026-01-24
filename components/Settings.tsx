import React from 'react';
import { useUser } from '../services/userContext';
import { useTranslation } from '../App';
import { Language } from '../services/i18n';

const Settings: React.FC = () => {
  const { preferences, updatePreferences, signOut, user } = useUser();
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-4xl font-black text-stone-900">{t('settings_label')}</h2>
        <p className="text-stone-500 font-medium mt-1">{t('settings_desc')}</p>
      </div>

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
            <div className="bg-stone-100 p-3 rounded-2xl text-stone-600">
              <i className="fas fa-user-circle text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-stone-900">{t('account_label')}</h3>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{t('signed_in_as')}</p>
              <p className="font-bold text-stone-900">{user?.email || 'Guest'}</p>
            </div>
          </div>

          {user && (
            <button
              onClick={signOut}
              className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-100 transition-all"
            >
              <i className="fas fa-sign-out-alt mr-2"></i> {t('sign_out_btn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;

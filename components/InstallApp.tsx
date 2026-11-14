import React, { useEffect, useState } from 'react';
import { useTranslation } from '../App';
import { canPromptInstall, isInstalled, isIos, onInstallChange, promptInstall } from '../services/installPrompt';

/** Settings: install BrewBindr as an app on the phone, tablet or computer. */
const InstallApp: React.FC = () => {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  useEffect(() => onInstallChange(() => setTick(n => n + 1)), []);

  const installed = isInstalled();
  const ios = isIos();
  const canPrompt = canPromptInstall();

  return (
    <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
          <i className="fas fa-mobile-screen-button text-2xl" aria-hidden="true"></i>
        </div>
        <h3 className="text-2xl font-black text-stone-900">{t('install_title')}</h3>
      </div>

      {installed ? (
        <p className="text-sm text-stone-600"><i className="fas fa-check-circle text-green-600 mr-2" aria-hidden="true"></i>{t('install_done')}</p>
      ) : (
        <>
          <p className="text-sm text-stone-600">{t('install_intro')}</p>
          {canPrompt && (
            <button type="button" onClick={() => promptInstall()}
              className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-700 transition-all">
              <i className="fas fa-download mr-2" aria-hidden="true"></i>{t('install_button')}
            </button>
          )}
          {ios ? (
            <ol className="list-decimal pl-5 space-y-1 text-sm text-stone-700">
              <li>{t('install_ios_1')}</li>
              <li>{t('install_ios_2')}</li>
              <li>{t('install_ios_3')}</li>
            </ol>
          ) : !canPrompt && (
            <p className="text-sm text-stone-700">{t('install_android')}</p>
          )}
        </>
      )}
    </div>
  );
};

export default InstallApp;

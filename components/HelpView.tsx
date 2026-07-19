import React from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';

const HelpView: React.FC = () => {
  const { t, lang } = useTranslation();
  const { isAdmin } = useUser();

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-500">
      <div className="text-center">
        <h2 className="text-4xl font-black text-stone-900 mb-2">{t('help_title')}</h2>
        <p className="text-stone-500 font-medium">{t('help_subtitle')}</p>
      </div>

      <section className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
            <i className="fas fa-book text-2xl"></i>
          </div>
          <h3 className="text-2xl font-black text-stone-900">{t('user_manual')}</h3>
        </div>
        <div className="space-y-4 text-stone-600 leading-relaxed">
          <p>{t('user_manual_desc')}</p>

          <div className="pt-2">
            <a
              href="/manual.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-amber-500 text-white font-bold px-5 py-3 rounded-2xl hover:bg-amber-600 transition-colors shadow-sm"
            >
              <i className="fas fa-book-open"></i>
              {t('open_full_manual')}
              {lang !== 'en' && (
                <span className="text-stone-400 text-xs ml-1">(EN)</span>
              )}
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="space-y-2">
              <h4 className="font-bold text-stone-900 uppercase text-[10px] tracking-widest">{t('nav_recipes')}</h4>
              <p className="text-sm">{t('help_recipes_desc')}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-stone-900 uppercase text-[10px] tracking-widest">{t('nav_brews')}</h4>
              <p className="text-sm">{t('help_brews_desc')}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-stone-900 uppercase text-[10px] tracking-widest">{t('nav_library')}</h4>
              <p className="text-sm">{t('help_library_desc')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-emerald-50/50 p-8 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600">
            <i className="fas fa-lightbulb text-2xl"></i>
          </div>
          <h3 className="text-2xl font-black text-stone-900">{t('help_tips_title')}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-sm">1</div>
            <p className="text-sm text-stone-600">{t('help_tips_library')}</p>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-sm">2</div>
            <p className="text-sm text-stone-600">{t('help_tips_efficiency')}</p>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-sm">3</div>
            <p className="text-sm text-stone-600">{t('help_tips_import')}</p>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-sm">4</div>
            <p className="text-sm text-stone-600">{t('help_tips_ai')}</p>
          </div>
          <div className="flex gap-4 md:col-span-2">
            <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-sm">5</div>
            <p className="text-sm text-stone-600">{t('help_tips_stock')}</p>
          </div>
        </div>
      </section>

      <section className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
            <i className="fas fa-calculator text-2xl"></i>
          </div>
          <h3 className="text-2xl font-black text-stone-900">{t('calculations_manual')}</h3>
        </div>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h4 className="font-bold text-stone-900">{t('calc_abv_title')}</h4>
              <p className="text-sm text-stone-600">
                {t('calc_abv_desc')}
                <code className="block mt-2 p-2 bg-stone-50 rounded text-amber-700 font-mono text-xs">ABV = (OG - FG) * 131.25</code>
                <span className="text-[10px] block mt-1 italic text-stone-400">{t('calc_abv_bottling')}</span>
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-stone-900">{t('calc_ibu_title')}</h4>
              <p className="text-sm text-stone-600">
                {t('calc_ibu_desc')}
                <code className="block mt-2 p-2 bg-stone-50 rounded text-amber-700 font-mono text-xs">Utilization = Bigness * TimeFactor</code>
                <span className="text-[10px] block mt-1 italic text-stone-400">Bigness = 1.65 * 0.000125^(OG-1)</span>
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-stone-900">{t('calc_color_title')}</h4>
              <p className="text-sm text-stone-600">
                {t('calc_color_desc')}
                <code className="block mt-2 p-2 bg-stone-50 rounded text-amber-700 font-mono text-xs">SRM = 1.4922 * MCU^0.6859</code>
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-stone-900">{t('calc_og_title')}</h4>
              <p className="text-sm text-stone-600">
                {t('calc_og_desc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="bg-stone-900 p-8 rounded-3xl text-white space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-stone-800 p-3 rounded-2xl text-amber-500">
              <i className="fas fa-user-shield text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black">{t('admin_manual')}</h3>
          </div>
          <div className="space-y-4 text-stone-400 leading-relaxed">
            <p>{t('admin_manual_desc')}</p>
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li>{t('admin_step_submissions')}</li>
              <li>{t('admin_step_data')}</li>
              <li>{t('admin_step_sync')}</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

export default HelpView;

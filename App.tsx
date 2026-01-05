
import React, { useState, useEffect, createContext, useContext } from 'react';
import RecipeCreator from './components/RecipeCreator';
import BrewLog from './components/BrewLog';
import TastingNotes from './components/TastingNotes';
import IngredientLibrary from './components/IngredientLibrary';
import BrewHistory from './components/BrewHistory';
import PrintView from './components/PrintView';
import AdminView from './components/AdminView';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from './types';
import { getSRMColor, formatBrewNumber } from './services/calculations';
import { parseBeerXml, BeerXmlImportResult } from './services/beerXmlService';
import { exportToBeerXml, exportLibraryToBeerXml } from './services/beerXmlExportService';
import { translations, Language } from './services/i18n';

type View = 'recipes' | 'create' | 'log' | 'tasting' | 'library' | 'brews' | 'admin';
type ImportStatus = 'idle' | 'fetching' | 'parsing' | 'resolving';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useTranslation must be used within a LanguageProvider");
  return context;
};

const EXAMPLES: LibraryIngredient[] = [
  { id: 'g1', name: 'Pilsner Malt', type: 'fermentable', color: 1.6, yield: 80 },
  { id: 'h1', name: 'Cascade', type: 'hop', alpha: 5.5 },
  { id: 'y1', name: 'US-05 SafAle', type: 'culture', form: 'dry', attenuation: 78 },
  { 
    id: 'm1', 
    name: 'Single Infusion (67°C)', 
    type: 'mash_profile', 
    steps: [
      { name: 'Mash In', type: 'infusion', step_temp: 67, step_time: 60, infuse_amount: 15 },
      { name: 'Mash Out', type: 'temperature', step_temp: 76, step_time: 10 }
    ] 
  },
];

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('brew_lang') as Language) || 'en');
  const [view, setView] = useState<View>('recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [brewLogs, setBrewLogs] = useState<BrewLogEntry[]>([]);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
  const [library, setLibrary] = useState<LibraryIngredient[]>(EXAMPLES);
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedBrewLog, setSelectedBrewLog] = useState<BrewLogEntry | null>(null);
  
  const [xmlUrl, setXmlUrl] = useState('');
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importQueue, setImportQueue] = useState<{ type: 'recipe' | 'library', data: any }[]>([]);
  const [currentDuplicate, setCurrentDuplicate] = useState<{ type: 'recipe' | 'library', data: any } | null>(null);

  const [printData, setPrintData] = useState<{ recipe?: Recipe, log?: BrewLogEntry, tastingNote?: TastingNote } | null>(null);

  useEffect(() => {
    if (printData) {
      const handleAfterPrint = () => {
        setPrintData(null);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      const timer = setTimeout(() => {
        window.print();
      }, 300);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
    }
  }, [printData]);

  useEffect(() => {
    localStorage.setItem('brew_lang', lang);
  }, [lang]);

  const t = (key: keyof typeof translations['en']): string => {
    return translations[lang][key] || translations['en'][key] || key;
  };

  useEffect(() => {
    const saved = localStorage.getItem('brewmaster_data_v3');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.recipes) setRecipes(data.recipes);
      if (data.brewLogs) setBrewLogs(data.brewLogs);
      if (data.tastingNotes) setTastingNotes(data.tastingNotes);
      if (data.library) setLibrary(data.library);
    }
  }, []);

  useEffect(() => {
    const data = { recipes, brewLogs, tastingNotes, library };
    localStorage.setItem('brewmaster_data_v3', JSON.stringify(data));
  }, [recipes, brewLogs, tastingNotes, library]);

  const handleSaveRecipe = (recipe: Recipe) => {
    if (selectedRecipe && selectedRecipe.id) {
      setRecipes(prev => prev.map(r => r.id === selectedRecipe.id ? { ...recipe, id: selectedRecipe.id } : r));
    } else {
      const newRecipe = { ...recipe, id: Math.random().toString(36).substr(2, 9) };
      setRecipes(prev => [...prev, newRecipe]);
    }
    setSelectedRecipe(null);
    setView('recipes');
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
    setSelectedRecipe(null);
    setView('recipes');
  };

  const handleUpdateBrewLog = (entry: BrewLogEntry) => {
    setBrewLogs(prev => {
      const exists = prev.find(l => l.id === entry.id);
      if (exists) return prev.map(l => l.id === entry.id ? entry : l);
      return [entry, ...prev];
    });
  };

  const handleSaveAndExitBrewLog = (entry: BrewLogEntry) => {
    handleUpdateBrewLog(entry);
    setSelectedBrewLog(null);
    setView('brews');
  };

  const handleExportData = () => {
    const data = { version: 1, exportDate: new Date().toISOString(), recipes, brewLogs, tastingNotes, library };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brewmaster-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportRecipeBeerXml = (recipe: Recipe) => {
    const xml = exportToBeerXml(recipe);
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.name.replace(/\s+/g, '-').toLowerCase()}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintRecipe = (recipe: Recipe) => {
    setPrintData({ recipe });
  };

  const handlePrintBrewReport = (log: BrewLogEntry) => {
    const recipe = recipes.find(r => r.id === log.recipeId);
    const tastingNote = tastingNotes.find(n => n.brewLogId === log.id);
    if (recipe) {
      setPrintData({ recipe, log, tastingNote });
    }
  };

  const handleExportLibraryBeerXml = () => {
    const xml = exportLibraryToBeerXml(library);
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brewmaster-library-${new Date().toISOString().split('T')[0]}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestoreData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.recipes) setRecipes(data.recipes);
        if (data.brewLogs) setBrewLogs(data.brewLogs);
        if (data.tastingNotes) setTastingNotes(data.tastingNotes);
        if (data.library) setLibrary(data.library);
        alert("Backup succesvol hersteld!");
        setView('recipes');
      } catch (err) {
        alert("Fout bij het laden van backup. Ongeldig JSON bestand.");
      }
    };
    reader.readAsText(file);
  };

  const startImportFlow = (result: BeerXmlImportResult) => {
    const queue: { type: 'recipe' | 'library', data: any }[] = [];
    result.recipes.forEach(r => queue.push({ type: 'recipe', data: r }));
    result.fermentables.forEach(f => queue.push({ type: 'library', data: f }));
    result.hops.forEach(h => queue.push({ type: 'library', data: h }));
    result.cultures.forEach(c => queue.push({ type: 'library', data: c }));
    result.mashes.forEach(m => queue.push({ type: 'library', data: m }));
    result.styles.forEach(s => queue.push({ type: 'library', data: s }));
    result.miscs.forEach(mi => queue.push({ type: 'library', data: mi }));
    
    if (queue.length === 0) {
      alert("No data found in the XML.");
      setImportStatus('idle');
      return;
    }
    setImportQueue(queue);
    setImportStatus('resolving');
    processQueue(queue, recipes, library);
  };

  const processQueue = (currentQueue: typeof importQueue, currentRecipes: Recipe[], currentLib: LibraryIngredient[]) => {
    if (currentQueue.length === 0) {
      setImportStatus('idle');
      return;
    }
    const next = currentQueue[0];
    let isDuplicate = false;
    if (next.type === 'recipe') {
      isDuplicate = currentRecipes.some(r => r.name.toLowerCase() === next.data.name.toLowerCase());
    } else {
      isDuplicate = currentLib.some(l => l.name.toLowerCase() === next.data.name.toLowerCase() && l.type === next.data.type);
    }
    if (isDuplicate) {
      if (next.type === 'recipe') {
        const nextQ = currentQueue.slice(1);
        setImportQueue(nextQ);
        processQueue(nextQ, currentRecipes, currentLib);
      } else {
        setCurrentDuplicate(next);
      }
    } else {
      let newRecipes = [...currentRecipes];
      let newLib = [...currentLib];
      if (next.type === 'recipe') {
        const linked = linkIngredientsToLibrary(next.data, newLib);
        newRecipes.push(linked);
        setRecipes(newRecipes);
        setLibrary(newLib);
      } else {
        const newItem = { ...next.data, id: Math.random().toString(36).substr(2, 9) };
        newLib.push(newItem);
        setLibrary(newLib);
      }
      const nextQ = currentQueue.slice(1);
      setImportQueue(nextQ);
      processQueue(nextQ, newRecipes, newLib);
    }
  };

  const linkIngredientsToLibrary = (recipe: Recipe, tempLib: LibraryIngredient[]) => {
    const getLibId = (name: string, type: string, props: Partial<LibraryIngredient>): string => {
      const existing = tempLib.find(i => i.type === type && i.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing.id;
      const newId = Math.random().toString(36).substr(2, 9);
      tempLib.push({ id: newId, name, type, ...props } as LibraryIngredient);
      return newId;
    };
    return {
      ...recipe,
      ingredients: {
        fermentables: recipe.ingredients.fermentables.map(f => ({ 
          ...f, 
          libraryId: getLibId(f.name, 'fermentable', { 
            color: f.color?.value || 2, 
            yield: f.yield?.potential?.value ? Math.round((f.yield.potential.value - 1) / 0.046 * 100) : 75 
          }) 
        })),
        hops: recipe.ingredients.hops.map(h => ({ 
          ...h, 
          libraryId: getLibId(h.name, 'hop', { alpha: h.alpha_acid?.value || 5 }) 
        })),
        cultures: recipe.ingredients.cultures.map(c => ({ 
          ...c, 
          libraryId: getLibId(c.name, 'culture', { attenuation: c.attenuation || 75, form: c.form || 'dry' }) 
        }))
      }
    };
  };

  const resolveConflict = (action: 'cancel' | 'skip' | 'overwrite' | 'copy') => {
    if (!currentDuplicate) return;
    if (action === 'cancel') { setImportQueue([]); setCurrentDuplicate(null); setImportStatus('idle'); return; }
    let updatedRecipes = [...recipes];
    let updatedLib = [...library];
    const nextQueue = importQueue.slice(1);
    if (action === 'overwrite') {
      if (currentDuplicate.type === 'recipe') {
        const linked = linkIngredientsToLibrary(currentDuplicate.data, updatedLib);
        updatedRecipes = recipes.map(r => r.name.toLowerCase() === linked.name.toLowerCase() ? { ...linked, id: r.id } : r);
        setRecipes(updatedRecipes);
        setLibrary(updatedLib);
      } else {
        updatedLib = library.map(l => (l.name.toLowerCase() === currentDuplicate.data.name.toLowerCase() && l.type === currentDuplicate.data.type) ? { ...currentDuplicate.data, id: l.id } : l);
        setLibrary(updatedLib);
      }
    } else if (action === 'copy') {
      if (currentDuplicate.type === 'recipe') {
        const linked = linkIngredientsToLibrary({ ...currentDuplicate.data, name: `${currentDuplicate.data.name} (Kopie)` }, updatedLib);
        linked.id = Math.random().toString(36).substr(2, 9);
        updatedRecipes = [...recipes, linked];
        setRecipes(updatedRecipes);
        setLibrary(updatedLib);
      } else {
        const newItem = { ...currentDuplicate.data, name: `${currentDuplicate.data.name} (Kopie)`, id: Math.random().toString(36).substr(2, 9) };
        updatedLib = [...library, newItem];
        setLibrary(updatedLib);
      }
    }
    setImportQueue(nextQueue);
    setCurrentDuplicate(null);
    processQueue(nextQueue, updatedRecipes, updatedLib);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('parsing');
    const reader = new FileReader();
    reader.onload = (event) => startImportFlow(parseBeerXml(event.target?.result as string));
    reader.readAsText(file);
  };

  const handleUrlImport = async (urlInput?: any) => {
    const targetUrl = typeof urlInput === 'string' ? urlInput : xmlUrl;
    if (!targetUrl) return;
    setImportStatus('fetching');
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Network response was not ok");
      const xmlText = await response.text();
      if (!xmlText) throw new Error("Received empty content from URL");
      setImportStatus('parsing');
      startImportFlow(parseBeerXml(xmlText));
      if (targetUrl === xmlUrl) setXmlUrl('');
    } catch (err) {
      console.error("Import failed:", err);
      alert("Import failed. Please verify the URL and your connection.");
      setImportStatus('idle');
    }
  };

  const handleImportDemoData = () => {
    handleUrlImport('http://www.beerxml.com/recipes.xml');
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      <div className="min-h-screen bg-stone-50 text-stone-900 print:bg-white print:p-0">
        {printData && (
          <div className="absolute inset-0 z-[300] bg-white pointer-events-none print:pointer-events-auto">
            <PrintView recipe={printData.recipe} log={printData.log} tastingNote={printData.tastingNote} />
          </div>
        )}
        <div className="print:hidden">
          {importStatus !== 'idle' && (
            <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
              <div className="bg-white rounded-3xl p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-300">
                {importStatus !== 'resolving' ? (
                  <div className="text-center space-y-4">
                    <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 border-4 border-stone-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-bold">Processing...</h3>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">{importStatus}</p>
                  </div>
                ) : currentDuplicate ? (
                  <div className="space-y-6">
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center gap-3">
                      <i className="fas fa-exclamation-triangle text-amber-600 text-xl"></i>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-bold text-amber-900 text-sm">Conflict</h4>
                        <p className="text-[10px] text-amber-700 font-bold truncate">"{currentDuplicate.data.name}"</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <button onClick={() => resolveConflict('overwrite')} className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold text-sm">Overwrite</button>
                      <button onClick={() => resolveConflict('copy')} className="w-full py-3 bg-white border border-stone-200 text-stone-900 rounded-xl font-bold text-sm">Copy</button>
                      <button onClick={() => resolveConflict('skip')} className="w-full py-3 bg-white border border-stone-200 text-stone-400 rounded-xl font-bold text-sm">Skip</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <header className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('recipes')}>
                <div className="bg-amber-500 p-2 rounded-xl text-white shadow-lg"><i className="fas fa-beer-mug-empty text-2xl"></i></div>
                <h1 className="text-2xl font-black font-serif italic text-stone-900 uppercase">brewbindr</h1>
              </div>
              <nav className="hidden md:flex gap-8">
                <button onClick={() => setView('recipes')} className={`font-bold transition-all text-sm ${view === 'recipes' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_recipes')}</button>
                <button onClick={() => setView('brews')} className={`font-bold transition-all text-sm ${view === 'brews' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_brews')}</button>
                <button onClick={() => setView('library')} className={`font-bold transition-all text-sm ${view === 'library' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_library')}</button>
                <button onClick={() => setView('admin')} className={`font-bold transition-all text-sm ${view === 'admin' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_admin')}</button>
              </nav>
              <div className="flex items-center gap-4">
                <div className="flex bg-stone-100 p-1 rounded-xl">
                  {(['en', 'nl', 'fr'] as Language[]).map((l) => (
                    <button key={l} onClick={() => setLang(l)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${lang === l ? 'bg-white text-amber-600 shadow-sm' : 'text-stone-400'}`}> {l} </button>
                  ))}
                </div>
                <button onClick={() => { setSelectedRecipe(null); setView('create'); }} className="bg-stone-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-md"> <i className="fas fa-plus mr-2"></i>{t('nav_new')} </button>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 py-10 pb-32">
            {view === 'recipes' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div> <h2 className="text-4xl font-black text-stone-900">{t('nav_recipes')}</h2> </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {recipes.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-stone-200 px-6 shadow-sm">
                      <i className="fas fa-beer text-5xl text-amber-100 mb-6 block"></i>
                      <p className="text-stone-400 font-bold max-w-sm mx-auto mb-6"> {t('empty_recipes_hint').split('Library')[0]} <button onClick={() => setView('library')} className="text-amber-600 underline hover:text-amber-700"> {t('go_to_library')} </button> {t('empty_recipes_hint').split('Library')[1]} </p>
                      <div className="flex flex-col items-center gap-4"> <p className="text-xs font-black text-stone-300 uppercase tracking-widest">{t('demo_hint')}</p> <button onClick={handleImportDemoData} className="bg-amber-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl hover:bg-amber-700 transition-all flex items-center gap-2"> <i className="fas fa-download"></i> {t('import_demo')} </button> </div>
                    </div>
                  ) : recipes.map(r => (
                    <div key={r.id} className="bg-white rounded-3xl border border-stone-200 p-6 hover:shadow-xl transition-all border-b-4 group relative flex flex-col" style={{ borderBottomColor: getSRMColor(r.specifications?.color?.value || 0) }}>
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button onClick={() => handlePrintRecipe(r)} title={t('print_recipe')} className="text-stone-300 hover:text-stone-900 transition-colors"> <i className="fas fa-print text-lg"></i> </button>
                        <button onClick={() => handleExportRecipeBeerXml(r)} title="Export BeerXML" className="text-stone-300 hover:text-amber-600 transition-colors"> <i className="fas fa-file-export text-lg"></i> </button>
                      </div>
                      <h3 className="text-xl font-bold mb-1 pr-16 truncate group-hover:text-amber-800 transition-colors">{r.name}</h3>
                      
                      {/* Recipe Notes Preview */}
                      <div className="flex-1">
                        {r.notes && (
                          <p className="text-[10px] text-stone-400 font-medium mb-4 line-clamp-2 italic leading-relaxed">
                            {r.notes}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">Batch</p><p className="font-bold text-xs">{formatBrewNumber(r.batch_size.value, 'default', lang)} L</p></div>
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">ABV</p><p className="font-bold text-xs">{formatBrewNumber(r.specifications?.abv?.value, 'abv', lang)}%</p></div>
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">IBU</p><p className="font-bold text-xs">{r.specifications?.ibu?.value}</p></div>
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">OG</p><p className="font-bold text-xs">{formatBrewNumber(r.specifications?.og?.value, 'og', lang)}</p></div>
                      </div>
                      <div className="flex gap-2 mt-auto">
                        <button onClick={() => { setSelectedRecipe(r); setSelectedBrewLog(null); setView('log'); }} className="flex-1 bg-amber-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">Brew</button>
                        <button onClick={() => { setSelectedRecipe(r); setView('create'); }} className="flex-1 bg-stone-100 text-stone-900 text-xs font-bold py-3 rounded-xl hover:bg-stone-200 transition-all">Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {view === 'brews' && (
              <BrewHistory logs={brewLogs} recipes={recipes} tastingNotes={tastingNotes} onEditLog={(logId) => { const log = brewLogs.find(l => l.id === logId); const recipe = recipes.find(r => r.id === log?.recipeId); if (log && recipe) { setSelectedBrewLog(log); setSelectedRecipe(recipe); setView('log'); } }} onAddTasting={(logId) => { const log = brewLogs.find(l => l.id === logId); const recipe = recipes.find(r => r.id === log?.recipeId); if (log && recipe) { setSelectedBrewLog(log); setSelectedRecipe(recipe); setView('tasting'); } }} onPrintReport={handlePrintBrewReport} />
            )}
            {view === 'log' && selectedRecipe && (
              <BrewLog recipe={selectedRecipe} initialLog={selectedBrewLog || undefined} onUpdate={handleUpdateBrewLog} onSaveAndExit={handleSaveAndExitBrewLog} />
            )}
            {view === 'create' && (
              <RecipeCreator initialRecipe={selectedRecipe || undefined} onSave={handleSaveRecipe} onDelete={handleDeleteRecipe} library={library} />
            )}
            {view === 'library' && ( <IngredientLibrary ingredients={library} onUpdate={setLibrary} /> )}
            {view === 'admin' && (
              <AdminView onExport={handleExportData} onExportBeerXml={handleExportLibraryBeerXml} onRestore={handleRestoreData} onFileImport={handleFileImport} onUrlImport={handleUrlImport} xmlUrl={xmlUrl} onXmlUrlChange={setXmlUrl} importStatus={importStatus} />
            )}
            {view === 'tasting' && selectedRecipe && selectedBrewLog && (
              <TastingNotes recipe={selectedRecipe} brewLogId={selectedBrewLog.id} onSave={(note) => { setTastingNotes([note, ...tastingNotes]); setView('brews'); }} />
            )}
          </main>
        </div>
      </div>
    </LanguageContext.Provider>
  );
};

export default App;

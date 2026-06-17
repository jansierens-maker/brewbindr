import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import RecipeCreator from './components/RecipeCreator';
import Bubbles from './components/Bubbles';
import BrewLog from './components/BrewLog';
import TastingNotes from './components/TastingNotes';
import IngredientLibrary from './components/IngredientLibrary';
import BrewHistory from './components/BrewHistory';
import PrintView from './components/PrintView';
import AdminView from './components/AdminView';
import Auth from './components/Auth';
import Settings from './components/Settings';
import HelpView from './components/HelpView';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from './types';
import { getSRMColor, formatBrewNumber, checkRecipeStock } from './services/calculations';
import { parseBeerXml, BeerXmlImportResult } from './services/beerXmlService';
import { exportToBeerXml, exportLibraryToBeerXml } from './services/beerXmlExportService';
import { translations, Language } from './services/i18n';
import { supabaseService } from './services/supabaseService';
import { supabase, getSupabaseConfigInfo } from './services/supabaseClient';
import { UserProvider, useUser } from './services/userContext';

type View = 'recipes' | 'create' | 'log' | 'tasting' | 'library' | 'brews' | 'admin' | 'settings' | 'auth' | 'help';
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

const DEMO_OPTIONS = [
  { id: 'recipes', name: "Three Recipes", file: "recipes.xml", icon: "fa-beer" },
  { id: 'hops', name: "Five Hop Varieties", file: "hops.xml", icon: "fa-leaf" },
  { id: 'grain', name: "Four Fermentables", file: "grain.xml", icon: "fa-seedling" },
  { id: 'misc', name: "Five Miscellaneous", file: "misc.xml", icon: "fa-cubes" },
  { id: 'style', name: "Five Beer Styles", file: "style.xml", icon: "fa-list" },
  { id: 'water', name: "Five Water Profiles", file: "water.xml", icon: "fa-tint" },
  { id: 'yeast', name: "Five Yeast Profiles", file: "yeast.xml", icon: "fa-flask" },
  { id: 'equipment', name: "Two Equipment Profiles", file: "equipment.xml", icon: "fa-tools" },
  { id: 'mash', name: "Five Mash Profiles", file: "mash.xml", icon: "fa-thermometer-half" },
];

const isExactlySame = (a: any, b: any) => {
  const strip = (obj: any) => {
    if (!obj) return "";
    const { id, user_id, status, libraryId, ...rest } = obj;
    if (rest.ingredients) {
       rest.ingredients = {
         fermentables: rest.ingredients.fermentables?.map(({id, libraryId, ...f}: any) => f),
         hops: rest.ingredients.hops?.map(({id, libraryId, ...h}: any) => h),
         cultures: rest.ingredients.cultures?.map(({id, libraryId, ...c}: any) => c),
         miscellaneous: rest.ingredients.miscellaneous?.map(({id, libraryId, ...m}: any) => m),
       };
    }
    return JSON.stringify(rest);
  };
  return strip(a) === strip(b);
};

const App: React.FC = () => {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
};

const AppContent: React.FC = () => {
  const { user, profile, preferences, isAdmin, loading: authLoading, updatePreferences } = useUser();
  const lang = preferences.language;
  const [view, setView] = useState<View>('recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [brewLogs, setBrewLogs] = useState<BrewLogEntry[]>([]);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
  const [library, setLibrary] = useState<LibraryIngredient[]>(EXAMPLES);
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedBrewLog, setSelectedBrewLog] = useState<BrewLogEntry | null>(null);
  
  const [xmlUrl, setXmlUrl] = useState('');
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [tableStatus, setTableStatus] = useState<Record<string, boolean | 'timeout' | 'error'>>({});
  const [rlsStatus, setRlsStatus] = useState<{ enabled: boolean, reason?: string } | null>(null);
  const [allowLocalStorage, setAllowLocalStorage] = useState(true);
  const [importStatus, setImportStatus] = useState<ImportStatus | 'complete'>('idle');
  const [libraryView, setLibraryView] = useState<'personal' | 'public'>('personal');
  const [importQueue, setImportQueue] = useState<{ type: 'recipe' | 'library', data: any }[]>([]);
  const [importSummary, setImportSummary] = useState<{ inserted: number, updated: number, ignored: number, errors: number } | null>(null);
  const [currentDuplicate, setCurrentDuplicate] = useState<{ type: 'recipe' | 'library', data: any } | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [selectedDemoIds, setSelectedDemoIds] = useState<string[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [showBrewableOnly, setShowBrewableOnly] = useState(false);
  const [syncError, setSyncError] = useState(false);

  const [printData, setPrintData] = useState<{ recipe?: Recipe, log?: BrewLogEntry, tastingNote?: TastingNote } | null>(null);

  const deduplicatedLibrary = useMemo(() => {
    // Deduplicate library items for RecipeCreator selection, prioritizing 'private' over 'approved'/'submitted'
    const deduplicated: Record<string, LibraryIngredient> = {};
    library.forEach(item => {
      const key = `${item.type}-${item.name.toLowerCase()}`;
      if (!deduplicated[key] || item.status === 'private') {
        deduplicated[key] = item;
      }
    });
    return Object.values(deduplicated).sort((a, b) => a.name.localeCompare(b.name));
  }, [library]);

  const processedRecipes = useMemo(() => {
    return recipes
      .filter(r => {
        if (libraryView === 'public') return r.status === 'approved';
        // Personal Collection: show items belonging to user OR their brewery
        // We include both 'private' and 'submitted' status here.
        const isOwner = (!r.user_id || r.user_id === user?.id) || (profile?.brewery_id && r.brewery_id === profile.brewery_id);
        return isOwner && (r.status === 'private' || r.status === 'submitted');
      })
      .map(r => ({ recipe: r, stock: checkRecipeStock(r, library) }))
      .filter(({ stock }) => !showBrewableOnly || stock.isBrewable)
      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
  }, [recipes, libraryView, user?.id, profile?.brewery_id, showBrewableOnly, library]);

  useEffect(() => {
    if (printData) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [printData]);

  const setLang = (l: Language) => {
    updatePreferences({ language: l });
  };

  const t = (key: keyof typeof translations['en']): string => {
    return translations[lang][key] || translations['en'][key] || key;
  };

  const syncIngredientsWithLibrary = (recipe: Recipe, targetStatus: 'private' | 'submitted', currentLib: LibraryIngredient[]) => {
    const newIngredients: LibraryIngredient[] = [];
    const updatedLib = [...currentLib];

    const getTargetItem = (name: string, type: string, originalId?: string) => {
      // 1. Try to find by original ID if it already has the correct status
      const byId = updatedLib.find(l => l.id === originalId);
      if (byId && (targetStatus === 'private' ? byId.status === 'private' : (byId.status === 'approved' || byId.status === 'submitted'))) {
        return byId;
      }

      // 2. Try to find by name and type with the target status
      if (targetStatus === 'private') {
        return updatedLib.find(l =>
          l.name.toLowerCase() === name.toLowerCase() &&
          l.type === type &&
          l.status === 'private' && (
            (!l.user_id || l.user_id === user?.id) ||
            (profile?.brewery_id && l.brewery_id === profile.brewery_id)
          )
        );
      } else {
        const approved = updatedLib.find(l => l.name.toLowerCase() === name.toLowerCase() && l.type === type && l.status === 'approved');
        if (approved) return approved;
        return updatedLib.find(l => l.name.toLowerCase() === name.toLowerCase() && l.type === type && l.status === 'submitted' && l.user_id === user?.id);
      }
    };

    const processItem = (item: any, type: string, defaultProps: any = {}) => {
      if (!item || !item.name) return item;

      const existing = getTargetItem(item.name, type, item.libraryId);
      if (existing) {
        return { ...item, libraryId: existing.id, name: existing.name };
      }

      const original = updatedLib.find(l => l.id === item.libraryId) || item;
      const newId = crypto.randomUUID();
      const newItem: LibraryIngredient = {
        ...original,
        ...defaultProps,
        id: newId,
        name: item.name,
        type: type,
        user_id: user?.id,
        status: targetStatus,
        stock: targetStatus === 'private' ? original.stock : undefined
      };

      newIngredients.push(newItem);
      updatedLib.push(newItem);
      return { ...item, libraryId: newId };
    };

    const syncedRecipe: Recipe = {
      ...recipe,
      status: targetStatus,
      style: recipe.style ? processItem(recipe.style, 'style') : undefined,
      ingredients: {
        ...recipe.ingredients,
        fermentables: (recipe.ingredients.fermentables || []).map(f => processItem(f, 'fermentable', {
            color: f.color?.value || 2,
            yield: f.yield?.potential?.value ? Math.round((f.yield.potential.value - 1) / 0.046 * 100) : 75
        })),
        hops: (recipe.ingredients.hops || []).map(h => processItem(h, 'hop', { alpha: h.alpha_acid?.value || 5 })),
        cultures: (recipe.ingredients.cultures || []).map(c => processItem(c, 'culture', { attenuation: c.attenuation || 75, form: c.form || 'dry' })),
        miscellaneous: (recipe.ingredients.miscellaneous || []).map(m => processItem(m, 'misc'))
      }
    };

    return { syncedRecipe, newIngredients, updatedLib };
  };

  useEffect(() => {
    if (!authLoading) {
      setLibraryView(user ? 'personal' : 'public');
    }
  }, [user, authLoading]);

  useEffect(() => {
    let cancelled = false;
    let userDataChannel: any = null;
    let breweryDataChannel: any = null;
    let publicDataChannel: any = null;

    const handlePayload = (payload: any, table: string) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      const updateState = (setter: React.Dispatch<React.SetStateAction<any[]>>) => {
        setter(prev => {
          if (eventType === 'DELETE') {
            return prev.filter(item => item.id !== (oldRecord?.id || oldRecord?.data?.id));
          }
          if (!newRecord) return prev;

          // Safely merge column data into JSONB data
          const mergedData = { ...newRecord.data };
          if (newRecord.id) mergedData.id = newRecord.id;
          if (newRecord.user_id) mergedData.user_id = newRecord.user_id;
          if (newRecord.brewery_id) mergedData.brewery_id = newRecord.brewery_id;
          if (newRecord.status) mergedData.status = newRecord.status;

          const exists = prev.find(item => item.id === mergedData.id);
          if (exists) {
            return prev.map(item => item.id === mergedData.id ? mergedData : item);
          }
          return [mergedData, ...prev];
        });
      };

      if (table === 'recipes') updateState(setRecipes);
      else if (table === 'brew_logs') updateState(setBrewLogs);
      else if (table === 'tasting_notes') updateState(setTastingNotes);
      else if (['fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'].includes(table)) {
        updateState(setLibrary);
      }
    };

    const setupRealtime = async () => {
      if (authLoading) return;

      // Initial Fetch & Health Check
      try {
        setSyncError(false);

        if (!user) {
          const health = await supabaseService.checkTableHealth();
          if (cancelled) return;
          const allOk = Object.values(health).every(v => v === true);
          if (allOk) {
            // Tables exist, redirect guest to login
            setView('auth');
          } else {
            // Tables missing or error, show connection details
            setShowSyncDetails(true);
          }
        }

        const remoteData = await supabaseService.fetchAppData(user?.id, profile?.brewery_id || user?.user_metadata?.brewery_id);
        if (cancelled) return;
        if (remoteData) {
          setRecipes(remoteData.recipes);
          setBrewLogs(remoteData.brewLogs);
          setTastingNotes(remoteData.tastingNotes);
          setLibrary(remoteData.library);
        } else if (user) {
          setSyncError(true);
        } else {
          setRecipes([]);
          setBrewLogs([]);
          setTastingNotes([]);
          setLibrary(EXAMPLES);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Initial connection failed:", err);
        if (user) setSyncError(true);
        else setShowSyncDetails(true);
      }

      if (cancelled) return;

      if (isAdmin) {
        const pending = await supabaseService.fetchPendingSubmissions();
        if (cancelled) return;
        setPendingSubmissions(pending);
      }

      if (!supabase) return;

      // Channel 1: User's own data (legacy support / private profiles)
      if (user?.id) {
        userDataChannel = supabase.channel('user-updates');
        const tables = ['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];

        tables.forEach(table => {
          userDataChannel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: table,
            filter: `user_id=eq.${user.id}`
          }, (payload: any) => handlePayload(payload, table));
        });

        userDataChannel.subscribe();
      }

      // Channel 1.5: Brewery shared data
      if (profile?.brewery_id) {
        breweryDataChannel = supabase.channel('brewery-updates');
        const tables = ['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];

        tables.forEach(table => {
          breweryDataChannel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: table,
            filter: `brewery_id=eq.${profile.brewery_id}`
          }, (payload: any) => handlePayload(payload, table));
        });

        breweryDataChannel.subscribe();
      }

      // Channel 2: Publicly approved data
      publicDataChannel = supabase.channel('public-updates');
      const publicTables = ['recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles'];

      publicTables.forEach(table => {
        publicDataChannel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: table,
          filter: 'status=eq.approved'
        }, (payload: any) => handlePayload(payload, table));
      });

      publicDataChannel.subscribe();
    };

    setupRealtime();

    return () => {
      cancelled = true;
      if (userDataChannel) supabase?.removeChannel(userDataChannel);
      if (breweryDataChannel) supabase?.removeChannel(breweryDataChannel);
      if (publicDataChannel) supabase?.removeChannel(publicDataChannel);
    };
  }, [user?.id, profile?.brewery_id, authLoading, isAdmin]);

  const handleSaveRecipe = async (recipe: Recipe) => {
    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'private', library);

    if (newIngredients.length > 0) {
      setLibrary(prev => [...prev, ...newIngredients]);
      if (user?.id) {
        await supabaseService.batchSaveLibraryIngredients(newIngredients, user.id, profile?.brewery_id);
      }
    }

    const targetRecipe = selectedRecipe && selectedRecipe.id
      ? { ...syncedRecipe, id: selectedRecipe.id, user_id: user?.id, brewery_id: profile?.brewery_id }
      : { ...syncedRecipe, id: crypto.randomUUID(), user_id: user?.id, brewery_id: profile?.brewery_id };

    setRecipes(prev => {
      const exists = prev.find(r => r.id === targetRecipe.id);
      if (exists) return prev.map(r => r.id === targetRecipe.id ? targetRecipe : r);
      return [targetRecipe, ...prev];
    });

    if (user?.id) {
      await supabaseService.saveRecipe(targetRecipe, user.id, profile?.brewery_id);
    }

    setSelectedRecipe(null);
    setView('recipes');
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
    setSelectedRecipe(null);
    setView('recipes');
    supabaseService.deleteRecipe(id);
  };

  const handleUpdateBrewLog = async (entry: BrewLogEntry) => {
    const targetLog = { ...entry, user_id: user?.id, brewery_id: profile?.brewery_id };
    setBrewLogs(prev => {
      const exists = prev.find(l => l.id === entry.id);
      if (exists) return prev.map(l => l.id === entry.id ? targetLog : l);
      return [targetLog, ...prev];
    });
    if (user?.id) {
      await supabaseService.saveBrewLog(targetLog, user.id, profile?.brewery_id);
    }
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
    a.download = `brewbindr-backup-${new Date().toISOString().split('T')[0]}.json`;
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
    a.download = `brewbindr-library-${new Date().toISOString().split('T')[0]}.xml`;
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
    result.fermentables.forEach(f => queue.push({ type: 'library', data: { ...f, type: 'fermentable' } }));
    result.hops.forEach(h => queue.push({ type: 'library', data: { ...h, type: 'hop' } }));
    result.cultures.forEach(c => queue.push({ type: 'library', data: { ...c, type: 'culture' } }));
    result.mashes.forEach(m => queue.push({ type: 'library', data: { ...m, type: 'mash_profile' } }));
    result.styles.forEach(s => queue.push({ type: 'library', data: { ...s, type: 'style' } }));
    result.miscs.forEach(mi => queue.push({ type: 'library', data: { ...mi, type: 'misc' } }));
    
    if (queue.length === 0) {
      alert("No data found in the selected files.");
      setImportStatus('idle');
      return;
    }

    setImportSummary({ inserted: 0, updated: 0, ignored: 0, errors: 0 });
    setImportQueue(queue);
    setImportStatus('resolving');
    // Important: call with state snapshots for consistency
    processQueue(queue, recipes, library, { inserted: 0, updated: 0, ignored: 0, errors: 0 });
  };

  const processQueue = (currentQueue: typeof importQueue, currentRecipes: Recipe[], currentLib: LibraryIngredient[], summary: { inserted: number, updated: number, ignored: number, errors: number }) => {
    if (currentQueue.length === 0) {
      setImportStatus('complete');
      return;
    }
    const next = currentQueue[0];

    // Only check for duplicates in personal collection
    const personalRecipes = currentRecipes.filter(r =>
      (!r.user_id || r.user_id === user?.id) ||
      (profile?.brewery_id && r.brewery_id === profile.brewery_id)
    );
    const personalLib = currentLib.filter(l =>
      (!l.user_id || l.user_id === user?.id) ||
      (profile?.brewery_id && l.brewery_id === profile.brewery_id)
    );

    let isDuplicate = false;
    let exactMatches: any[] = [];

    if (next.type === 'recipe') {
      exactMatches = personalRecipes.filter(r => isExactlySame(r, next.data));
      isDuplicate = personalRecipes.some(r => r.name.toLowerCase() === next.data.name.toLowerCase());
    } else {
      exactMatches = personalLib.filter(l => l.type === next.data.type && isExactlySame(l, next.data));
      isDuplicate = personalLib.some(l => l.name.toLowerCase() === next.data.name.toLowerCase() && l.type === next.data.type);
    }
    
    if (exactMatches.length > 0) {
      // Exactly the same data, ignore it
      const nextSummary = { ...summary, ignored: summary.ignored + 1 };
      setImportSummary(nextSummary);
      const nextQ = currentQueue.slice(1);
      setImportQueue(nextQ);
      processQueue(nextQ, currentRecipes, currentLib, nextSummary);
      return;
    }

    if (isDuplicate) {
      setCurrentDuplicate(next);
    } else {
      try {
        let newRecipes = [...currentRecipes];
        let newLib = [...currentLib];
        let itemsAdded = 0;
        if (next.type === 'recipe') {
          const result = linkIngredientsToLibrary(next.data, newLib);
          const linked = result.recipe;
          itemsAdded = 1 + result.addedToLibrary;
          newRecipes.push({ ...linked, user_id: user?.id });
        } else {
          const newItem = { ...next.data, id: crypto.randomUUID(), user_id: user?.id };
          newLib.push(newItem);
          itemsAdded = 1;
        }

        const nextSummary = { ...summary, inserted: summary.inserted + itemsAdded };
        setImportSummary(nextSummary);

        // Update state once per step
        setRecipes(newRecipes);
        setLibrary(newLib);

        const nextQ = currentQueue.slice(1);
        setImportQueue(nextQ);
        // Wait for state updates before next recursive call
        setTimeout(() => processQueue(nextQ, newRecipes, newLib, nextSummary), 0);
      } catch (err) {
        console.error("Error processing import item:", err);
        const nextSummary = { ...summary, errors: summary.errors + 1 };
        setImportSummary(nextSummary);
        const nextQ = currentQueue.slice(1);
        setImportQueue(nextQ);
        setTimeout(() => processQueue(nextQ, currentRecipes, currentLib, nextSummary), 0);
      }
    }
  };

  const linkIngredientsToLibrary = (recipe: Recipe, tempLib: LibraryIngredient[]) => {
    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'private', tempLib);
    tempLib.push(...newIngredients);
    return { recipe: syncedRecipe, addedToLibrary: newIngredients.length };
  };

  const resolveConflict = (action: 'cancel' | 'skip' | 'overwrite' | 'copy') => {
    if (!currentDuplicate || !importSummary) return;
    if (action === 'cancel') { setImportQueue([]); setCurrentDuplicate(null); setImportStatus('idle'); return; }

    let updatedRecipes = [...recipes];
    let updatedLib = [...library];
    const nextQueue = importQueue.slice(1);
    let nextSummary = { ...importSummary };
    
    if (action === 'overwrite') {
      if (currentDuplicate.type === 'recipe') {
        const { recipe: linked, addedToLibrary } = linkIngredientsToLibrary(currentDuplicate.data, updatedLib);
        updatedRecipes = recipes.map(r => {
          const isOwnOrBrewery = (!r.user_id || r.user_id === user?.id) || (profile?.brewery_id && r.brewery_id === profile.brewery_id);
          return isOwnOrBrewery && r.name.toLowerCase() === linked.name.toLowerCase()
            ? { ...linked, id: r.id, user_id: user?.id, brewery_id: profile?.brewery_id }
            : r;
        });
        nextSummary.updated += 1;
        nextSummary.inserted += addedToLibrary;
      } else {
        updatedLib = library.map(l => {
          const isOwnOrBrewery = (!l.user_id || l.user_id === user?.id) || (profile?.brewery_id && l.brewery_id === profile.brewery_id);
          return isOwnOrBrewery && l.name.toLowerCase() === currentDuplicate.data.name.toLowerCase() && l.type === currentDuplicate.data.type
            ? { ...currentDuplicate.data, id: l.id, user_id: user?.id, brewery_id: profile?.brewery_id }
            : l;
        });
        nextSummary.updated += 1;
      }
    } else if (action === 'copy') {
      if (currentDuplicate.type === 'recipe') {
        const { recipe: linked, addedToLibrary } = linkIngredientsToLibrary({ ...currentDuplicate.data, name: `${currentDuplicate.data.name} (Copy)` }, updatedLib);
        linked.id = crypto.randomUUID();
        updatedRecipes = [...recipes, { ...linked, user_id: user?.id }];
        nextSummary.inserted += 1 + addedToLibrary;
      } else {
        const newItem = { ...currentDuplicate.data, name: `${currentDuplicate.data.name} (Copy)`, id: crypto.randomUUID(), user_id: user?.id };
        updatedLib = [...library, newItem];
        nextSummary.inserted += 1;
      }
    } else if (action === 'skip') {
      nextSummary.ignored += 1;
    }

    setImportSummary(nextSummary);
    setRecipes(updatedRecipes);
    setLibrary(updatedLib);
    setImportQueue(nextQueue);
    setCurrentDuplicate(null);
    setTimeout(() => processQueue(nextQueue, updatedRecipes, updatedLib, nextSummary), 0);
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

    // Security: Validate protocol to prevent URI scheme exploitation
    if (!targetUrl.toLowerCase().startsWith('http://') && !targetUrl.toLowerCase().startsWith('https://')) {
      alert("Invalid URL. Only http:// and https:// protocols are allowed.");
      return;
    }

    setImportStatus('fetching');

    // Security: Implement timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      const xmlText = data.contents;
      if (!xmlText) throw new Error("Received empty content from URL");
      setImportStatus('parsing');
      startImportFlow(parseBeerXml(xmlText));
      if (targetUrl === xmlUrl) setXmlUrl('');
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error("Import failed:", err);
      const message = err.name === 'AbortError'
        ? "Import timed out. The server took too long to respond."
        : "Import failed. Please verify the URL and your connection.";
      alert(message);
      setImportStatus('idle');
    }
  };

  const toggleDemoSelection = (id: string) => {
    setSelectedDemoIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleConfirmDemoImport = async () => {
    const selectedFiles = DEMO_OPTIONS.filter(o => selectedDemoIds.includes(o.id));
    if (selectedFiles.length === 0) return;
    
    setShowDemoModal(false);
    setImportStatus('fetching');

    const aggregatedResult: BeerXmlImportResult = {
        recipes: [], fermentables: [], hops: [], cultures: [], miscs: [], waters: [], styles: [], equipments: [], mashes: []
    };

    try {
        for (const opt of selectedFiles) {
            const targetUrl = `https://beerxml.com/${opt.file}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;
            const data = await response.json();
            const xmlText = data.contents;
            if (!xmlText) continue;
            const result = parseBeerXml(xmlText);
            
            // Merge into aggregate
            aggregatedResult.recipes.push(...result.recipes);
            aggregatedResult.fermentables.push(...result.fermentables);
            aggregatedResult.hops.push(...result.hops);
            aggregatedResult.cultures.push(...result.cultures);
            aggregatedResult.miscs.push(...result.miscs);
            aggregatedResult.styles.push(...result.styles);
            aggregatedResult.mashes.push(...result.mashes);
        }
        setImportStatus('parsing');
        startImportFlow(aggregatedResult);
    } catch (err: any) {
        console.error("Batch import failed", err);
        alert(`Batch import failed: ${err.message || err.toString()}`);
        setImportStatus('idle');
    }
    setSelectedDemoIds([]);
  };

  const handleImportDemoData = () => {
    setShowDemoModal(true);
  };

  const handleRecipeSubmitToPublic = async (recipe: Recipe) => {
    if (!user?.id || !recipe.id) return;

    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'submitted', library);

    const clonedRecipe: Recipe = {
      ...syncedRecipe,
      id: crypto.randomUUID(),
      user_id: user.id,
      status: 'submitted'
    };

    if (newIngredients.length > 0) {
      await supabaseService.batchSaveLibraryIngredients(newIngredients, user.id);
    }
    await supabaseService.saveRecipe(clonedRecipe, user.id);

    // Refresh data
    const remoteData = await supabaseService.fetchAppData(user.id);
    if (remoteData) {
      setRecipes(remoteData.recipes);
      setLibrary(remoteData.library);
    }
    alert("Recipe and its ingredients submitted for review! The original items remain in your collection.");
  };

  const handleRecipeAddToPersonal = async (recipe: Recipe) => {
    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'private', library);

    const newRecipeId = crypto.randomUUID();
    const updatedRecipe: Recipe = {
      ...syncedRecipe,
      id: newRecipeId,
      user_id: user?.id,
      status: 'private'
    };

    setLibrary(prev => [...prev, ...newIngredients]);
    setRecipes(prev => [...prev, updatedRecipe]);

    if (user?.id) {
      if (newIngredients.length > 0) {
        await supabaseService.batchSaveLibraryIngredients(newIngredients, user.id);
      }
      await supabaseService.saveRecipe(updatedRecipe, user.id);
    }

    setLibraryView('personal');
    alert("Recipe added to your personal collection!");
  };

  const handleRefreshAppData = async () => {
    setSyncError(false);
    const remoteData = await supabaseService.fetchAppData(user?.id, profile?.brewery_id || user?.user_metadata?.brewery_id);
    if (remoteData) {
      setRecipes(remoteData.recipes);
      setBrewLogs(remoteData.brewLogs);
      setTastingNotes(remoteData.tastingNotes);
      setLibrary(remoteData.library);
      alert('Data successfully re-synchronized!');
    } else {
      setSyncError(true);
      alert('Re-sync failed. Please check your connection.');
    }
  };

  const handleOpenSyncDetails = async () => {
    setShowSyncDetails(true);
    setTableStatus({});
    setRlsStatus(null);

    if (supabase) {
      const status = await supabaseService.checkTableHealth();
      setTableStatus(status);
      if (user?.id) {
        const rls = await supabaseService.checkRLSHealth(user.id);
        setRlsStatus(rls);
      } else {
        setRlsStatus({ enabled: false, reason: 'Log in to check RLS' });
      }
    } else {
      setTableStatus({ 'N/A': false });
      setRlsStatus({ enabled: false, reason: 'Supabase not configured' });
    }
  };

  const handleApprove = async (id: string, type: string, table?: string) => {
    await supabaseService.updateItemStatus(id, type, 'approved', table);
    const pending = await supabaseService.fetchPendingSubmissions();
    setPendingSubmissions(pending);
    // State will be updated via Realtime
  };

  const handleReject = async (id: string, type: string, table?: string) => {
    await supabaseService.updateItemStatus(id, type, 'private', table);
    const pending = await supabaseService.fetchPendingSubmissions();
    setPendingSubmissions(pending);
    // State will be updated via Realtime
  };

  const SQL_SCHEMA = `
-- 1. Create/Update Tables Idempotently
CREATE TABLE IF NOT EXISTS breweries (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'My Brewery';
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE breweries ALTER COLUMN name DROP DEFAULT;

CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brewery_role TEXT CHECK (brewery_role IN ('admin', 'brewmaster', 'brewer', 'taster'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"units": "metric", "colorScale": "srm", "language": "en"}'::jsonb;

CREATE TABLE IF NOT EXISTS invitations (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS brewery_id UUID NOT NULL REFERENCES breweries(id) ON DELETE CASCADE;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS role TEXT NOT NULL CHECK (role IN ('admin', 'brewmaster', 'brewer', 'taster'));
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS code TEXT NOT NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_code_key') THEN
    ALTER TABLE invitations ADD CONSTRAINT invitations_code_key UNIQUE (code);
  END IF;
END $$;

-- Create application tables idempotently
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables) LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id TEXT PRIMARY KEY);', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS data JSONB;', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users;', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS brewery_id UUID REFERENCES breweries(id);', t);

    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''private'' CHECK (status IN (''private'', ''submitted'', ''approved''));', t);
    END IF;
  END LOOP;
END $$;

-- Enable RLS
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Helper Functions for RLS
CREATE OR REPLACE FUNCTION get_user_brewery_id() RETURNS UUID AS $$
  SELECT brewery_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_brewery_role() RETURNS TEXT AS $$
  SELECT brewery_role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Policies for breweries
DROP POLICY IF EXISTS "Members can view their brewery" ON breweries;
CREATE POLICY "Members can view their brewery" ON breweries FOR SELECT USING (id = get_user_brewery_id());

DROP POLICY IF EXISTS "Admins can update brewery" ON breweries;
CREATE POLICY "Admins can update brewery" ON breweries FOR UPDATE USING (id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- Policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view brewery members" ON profiles;
CREATE POLICY "Users can view brewery members" ON profiles FOR SELECT USING (brewery_id = get_user_brewery_id());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id AND (role = (SELECT role FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Helper to check if user is admin (global app admin)
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (auth.uid() != id AND is_admin());

-- Trigger to create profile on signup
-- Trigger to create profile and brewery on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_brewery_id UUID;
  invite_code TEXT;
  invite_role TEXT;
  invite_brewery_id UUID;
BEGIN
  -- Extract invite code from user metadata if provided
  invite_code := (new.raw_user_meta_data->>'invite_code');

  IF invite_code IS NOT NULL THEN
    -- Try to join existing brewery
    SELECT brewery_id, role INTO invite_brewery_id, invite_role
    FROM invitations
    WHERE code = invite_code AND expires_at > now()
    LIMIT 1;

    IF invite_brewery_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, brewery_id, brewery_role)
      VALUES (new.id, new.email, invite_brewery_id, invite_role)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        brewery_id = EXCLUDED.brewery_id,
        brewery_role = EXCLUDED.brewery_role;

      -- Cleanup used invitation (Match by code and/or email for safety)
      DELETE FROM invitations
      WHERE code = invite_code
      OR (email = new.email AND brewery_id = invite_brewery_id);

      RETURN new;
    END IF;
  END IF;

  -- Default: Create new brewery for the user
  INSERT INTO breweries (name) VALUES ('My Brewery') RETURNING id INTO new_brewery_id;

  INSERT INTO public.profiles (id, email, brewery_id, brewery_role)
  VALUES (new.id, new.email, new_brewery_id, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    brewery_id = EXCLUDED.brewery_id,
    brewery_role = EXCLUDED.brewery_role;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to delete invitation when profile is linked (idempotency safety)
CREATE OR REPLACE FUNCTION delete_used_invitation()
RETURNS trigger AS $$
BEGIN
  IF NEW.brewery_id IS NOT NULL AND OLD.brewery_id IS NULL THEN
    -- If we don't have the code anymore, we might have matched via metadata in handle_new_user.
    -- This trigger handles cases where brewery_id is set later.
    -- To be precise, we'd need the code on the profile, but deleting by brewery+role is a good fallback
    -- if we assume codes are unique per role in a brewery (which they usually are).
    DELETE FROM invitations
    WHERE (brewery_id = NEW.brewery_id AND role = NEW.brewery_role)
    OR (email = NEW.email AND brewery_id = NEW.brewery_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_brewery_linked ON profiles;
CREATE TRIGGER on_brewery_linked
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION delete_used_invitation();

-- Policies for invitations
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations" ON invitations FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() = 'admin');

-- Set brewery_id automatically based on owner's profile if missing
CREATE OR REPLACE FUNCTION set_brewery_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.brewery_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.brewery_id := (SELECT brewery_id FROM public.profiles WHERE id = NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies and Triggers for Data Tables
DO \$\$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    -- Everyone can read approved items (if the table has a status column)
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('DROP POLICY IF EXISTS "Allow read approved %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow read approved %I" ON %I FOR SELECT USING (status = ''approved'');', t, t);
    END IF;

    -- Drop old user-only policy
    EXECUTE format('DROP POLICY IF EXISTS "Allow user manage own %I" ON %I;', t, t);

    -- SELECT: Any member of the brewery
    EXECUTE format('DROP POLICY IF EXISTS "Allow brewery members read %I" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "Allow brewery members read %I" ON %I FOR SELECT USING (brewery_id = get_user_brewery_id());', t, t);

    -- INSERT/UPDATE/DELETE based on roles
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      -- admin and brewmaster can manage (with status check)
      EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'')) WITH CHECK (brewery_id = get_user_brewery_id() AND (status != ''approved'' OR is_admin()));', t, t);
    ELSIF t IN ('equipment', 'waters') THEN
      -- admin and brewmaster can manage (no status check)
      EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'')) WITH CHECK (brewery_id = get_user_brewery_id());', t, t);
    ELSIF t = 'brew_logs' THEN
      -- admin, brewmaster, brewer can manage
      EXECUTE format('DROP POLICY IF EXISTS "Allow admin/brewmaster/brewer manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow admin/brewmaster/brewer manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id() AND get_user_brewery_role() IN (''admin'', ''brewmaster'', ''brewer''));', t, t);
    ELSIF t = 'tasting_notes' THEN
      -- everyone in brewery can manage
      EXECUTE format('DROP POLICY IF EXISTS "Allow brewery members manage %I" ON %I;', t, t);
      EXECUTE format('CREATE POLICY "Allow brewery members manage %I" ON %I FOR ALL USING (brewery_id = get_user_brewery_id());', t, t);
    END IF;

    -- Admins of the app (global role) can still do everything
    EXECUTE format('DROP POLICY IF EXISTS "Allow global admin manage %I" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "Allow global admin manage %I" ON %I FOR ALL USING (is_admin());', t, t);

    -- Apply brewery linking trigger
    EXECUTE format('DROP TRIGGER IF EXISTS on_%I_brewery_link ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER on_%I_brewery_link BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_brewery_id();', t, t);
  END LOOP;
END \$\$;

-- Enable Realtime for all tables idempotently
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
    END IF;
  END LOOP;
END $$;

-- Grant PostgREST access to public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- anon can only read approved content
GRANT SELECT ON TABLE recipes TO anon;
GRANT SELECT ON TABLE fermentables TO anon;
GRANT SELECT ON TABLE hops TO anon;
GRANT SELECT ON TABLE cultures TO anon;
GRANT SELECT ON TABLE styles TO anon;
GRANT SELECT ON TABLE miscs TO anon;
GRANT SELECT ON TABLE mash_profiles TO anon;

-- authenticated users get full access to all tables
GRANT ALL ON TABLE recipes TO authenticated;
GRANT ALL ON TABLE brew_logs TO authenticated;
GRANT ALL ON TABLE tasting_notes TO authenticated;
GRANT ALL ON TABLE fermentables TO authenticated;
GRANT ALL ON TABLE hops TO authenticated;
GRANT ALL ON TABLE cultures TO authenticated;
GRANT ALL ON TABLE styles TO authenticated;
GRANT ALL ON TABLE miscs TO authenticated;
GRANT ALL ON TABLE mash_profiles TO authenticated;
GRANT ALL ON TABLE equipment TO authenticated;
GRANT ALL ON TABLE waters TO authenticated;
GRANT ALL ON TABLE profiles TO authenticated;

-- Migration for existing users: Create a default brewery for each user and link their data
DO \$\$
DECLARE
  u_record RECORD;
  new_brewery_id UUID;
BEGIN
  -- 1. Sync emails for existing profiles
  UPDATE public.profiles p
  SET email = u.email
  FROM auth.users u
  WHERE p.id = u.id AND p.email IS NULL;

  -- 2. Create breweries for solo users
  FOR u_record IN SELECT id FROM profiles WHERE brewery_id IS NULL
  LOOP
    INSERT INTO breweries (name) VALUES ('My Brewery') RETURNING id INTO new_brewery_id;
    UPDATE profiles SET brewery_id = new_brewery_id, brewery_role = 'admin' WHERE id = u_record.id;

    -- Link existing data
    UPDATE recipes SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE brew_logs SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE tasting_notes SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE fermentables SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE hops SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE cultures SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE styles SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE miscs SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE mash_profiles SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE equipment SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
    UPDATE waters SET brewery_id = new_brewery_id WHERE user_id = u_record.id AND brewery_id IS NULL;
  END LOOP;
END \$\$;
`.trim();

  const handleDismissFallback = () => {
    setShowFallbackModal(false);
  };

  const handleDeclineFallback = () => {
    setShowFallbackModal(false);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      <div className="min-h-screen bg-transparent text-stone-900 print:bg-white print:p-0">
        <Bubbles />
        {showSyncDetails && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-stone-900">{t('sync_details')}</h3>
                <button
                  onClick={() => setShowSyncDetails(false)}
                  className="text-stone-300 hover:text-stone-900 transition-colors"
                  aria-label="Close Sync Details"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('connection_status')}</p>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${supabase ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="font-bold text-sm">{supabase ? 'Connected' : 'Not Configured'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">Supabase Config</p>
                    <div className="text-[10px] font-bold text-stone-600 space-y-0.5">
                      <p>URL: {getSupabaseConfigInfo().url}</p>
                      <p>API Key: {getSupabaseConfigInfo().hasKey ? 'Present' : 'Missing'}</p>
                    </div>
                  </div>
                </div>

                {supabase && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('table_status')}</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.keys(tableStatus).length > 0 ? Object.entries(tableStatus).map(([table, status]) => (
                          <div key={table} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                            <span className="text-[10px] font-bold text-stone-600 truncate mr-2">{table}</span>
                            <span className={`text-[9px] font-black uppercase flex-shrink-0 ${status === true ? 'text-green-600' : status === 'timeout' ? 'text-amber-500' : 'text-red-500'}`}>
                              {status === true ? t('found') : status === 'timeout' ? 'Timeout' : status === 'error' ? 'Error' : t('not_found')}
                            </span>
                          </div>
                        )) : (
                          <div className="col-span-full py-4 text-center text-xs text-stone-400 italic">Checking status...</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">RLS Security Status</p>
                      {rlsStatus ? (
                        <div className={`p-4 rounded-2xl border flex items-center gap-3 ${rlsStatus.enabled ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                          <i className={`fas ${rlsStatus.enabled ? 'fa-shield-check' : 'fa-shield-exclamation'} text-xl`}></i>
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest">{rlsStatus.enabled ? 'RLS Active' : 'RLS Check Failed'}</p>
                            {rlsStatus.reason && <p className="text-[10px] font-bold opacity-70">{rlsStatus.reason}</p>}
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-xs text-stone-400 italic">Checking RLS...</div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Manual Sync & Repair</p>
                    <button
                      onClick={async () => {
                        const remoteData = await supabaseService.fetchAppData(user?.id);
                        if (remoteData) {
                          setRecipes(remoteData.recipes);
                          setBrewLogs(remoteData.brewLogs);
                          setTastingNotes(remoteData.tastingNotes);
                          setLibrary(remoteData.library);
                          setSyncError(false);
                          alert('Data successfully re-synchronized!');
                        } else {
                          setSyncError(true);
                          alert('Re-sync failed. Please check your connection or database permissions.');
                        }
                      }}
                      className="text-amber-600 font-black text-[10px] uppercase hover:underline"
                    >
                      Retry Sync
                    </button>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('sql_instructions')}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(SQL_SCHEMA); alert('SQL copied to clipboard!'); }}
                      className="text-amber-600 font-black text-[10px] uppercase hover:underline"
                    >
                      {t('copy_sql')}
                    </button>
                  </div>
                  <pre className="bg-stone-900 text-stone-100 p-4 rounded-xl text-[10px] font-mono overflow-x-auto h-40">
                    {SQL_SCHEMA}
                  </pre>
                </div>
              </div>

              <button
                onClick={() => setShowSyncDetails(false)}
                className="w-full mt-8 py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showFallbackModal && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300 text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-cloud-slash text-2xl text-amber-600"></i>
              </div>
              <h3 className="text-2xl font-black text-stone-900 mb-2">{t('cloud_unavailable')}</h3>
              <p className="text-stone-500 font-medium mb-8 text-sm leading-relaxed">
                {t('fallback_message')}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDismissFallback}
                  className="w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                >
                  {t('proceed_local')}
                </button>
                <button
                  onClick={handleDeclineFallback}
                  className="w-full py-3 bg-stone-100 text-stone-500 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  {t('cancel_btn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {printData && (
          <div className="fixed inset-0 z-[300] bg-white overflow-y-auto animate-in fade-in duration-200">
            <div className="print:hidden sticky top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-stone-100 z-[301] px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <i className="fas fa-print text-stone-400"></i>
                <span className="text-xs font-black uppercase tracking-widest text-stone-500">{t('print_preview')}</span>
              </div>
              <button
                onClick={() => setPrintData(null)}
                className="bg-stone-900 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-lg flex items-center gap-2"
              >
                <i className="fas fa-times"></i>
                {t('close_preview')}
              </button>
            </div>
            <div className="p-4 md:p-8">
              <div className="max-w-4xl mx-auto bg-white shadow-2xl ring-1 ring-stone-200 print:shadow-none print:ring-0">
                <PrintView recipe={printData.recipe} log={printData.log} tastingNote={printData.tastingNote} />
              </div>
            </div>
          </div>
        )}

        {showDemoModal && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-stone-900">Import Demo Data</h3>
                <button
                  onClick={() => setShowDemoModal(false)}
                  className="text-stone-300 hover:text-stone-900 transition-colors"
                  aria-label="Close Demo Import"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>
              
              <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                <i className="fas fa-info-circle text-amber-600 mt-1"></i>
                <div>
                    <p className="text-xs text-amber-900 font-bold leading-relaxed">
                        Select which sample data sets you want to add to your collection. You can find more samples at <a href="https://beerxml.com" target="_blank" rel="noopener noreferrer" className="underline">BeerXML.com</a> or download BrewDog recipes from <a href="https://brewdogrecipes.com" target="_blank" rel="noopener noreferrer" className="underline">brewdogrecipes.com</a>.
                    </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {DEMO_OPTIONS.map(opt => (
                  <label 
                    key={opt.id}
                    htmlFor={`demo-opt-${opt.id}`}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer group ${selectedDemoIds.includes(opt.id) ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500' : 'bg-stone-50 border-stone-200 hover:bg-white'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all ${selectedDemoIds.includes(opt.id) ? 'bg-amber-500 text-white' : 'bg-white text-stone-400 group-hover:text-amber-500'}`}>
                      <i className={`fas ${opt.icon}`}></i>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-stone-900 text-sm leading-tight">{opt.name}</p>
                      <p className="text-[10px] text-stone-400 font-black uppercase tracking-widest mt-0.5">{opt.file}</p>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedDemoIds.includes(opt.id) ? 'bg-amber-500 border-amber-500' : 'bg-white border-stone-200'}`}>
                      {selectedDemoIds.includes(opt.id) && <i className="fas fa-check text-white text-[10px]"></i>}
                    </div>
                    <input 
                        id={`demo-opt-${opt.id}`}
                        name="demo_option"
                        type="checkbox" 
                        className="hidden" 
                        checked={selectedDemoIds.includes(opt.id)}
                        onChange={() => toggleDemoSelection(opt.id)}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-8 flex gap-4">
                  <button onClick={() => setShowDemoModal(false)} className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-stone-200 transition-all">Cancel</button>
                  <button 
                    onClick={handleConfirmDemoImport} 
                    disabled={selectedDemoIds.length === 0}
                    className="flex-1 py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-stone-200 disabled:opacity-50"
                  >
                    Confirm Import ({selectedDemoIds.length})
                  </button>
              </div>
            </div>
          </div>
        )}

        <div className="print:hidden">
          {importStatus !== 'idle' && (
            <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
              <div className="bg-white rounded-3xl p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-300">
                {importStatus === 'complete' && importSummary ? (
                  <div className="text-center space-y-6">
                    <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                      <i className="fas fa-check text-2xl text-green-600"></i>
                    </div>
                    <h3 className="text-2xl font-black text-stone-900">{t('import_summary')}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{t('records_inserted')}</p>
                        <p className="text-xl font-black text-stone-900">{importSummary.inserted}</p>
                      </div>
                      <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{t('records_updated')}</p>
                        <p className="text-xl font-black text-stone-900">{importSummary.updated}</p>
                      </div>
                      <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{t('records_ignored')}</p>
                        <p className="text-xl font-black text-stone-900">{importSummary.ignored}</p>
                      </div>
                      <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{t('records_errors')}</p>
                        <p className="text-xl font-black text-red-600">{importSummary.errors}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setImportStatus('idle'); setImportSummary(null); }}
                      className="w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                    >
                      {t('close_btn')}
                    </button>
                  </div>
                ) : (importStatus !== 'resolving' && importStatus !== 'complete') ? (
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
              <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('recipes')}>
                <div className="bg-amber-500 p-2 rounded-xl text-white shadow-lg"><i className="fas fa-beer-mug-empty text-2xl"></i></div>
                <h1 className="text-2xl font-black font-serif italic text-stone-900 uppercase">brewbindr</h1>
              </div>

              <div className="hidden lg:flex items-center gap-2">
                <button
                  onClick={handleOpenSyncDetails}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-50 border border-stone-100 hover:bg-white transition-all"
                >
                  <div className={`w-2 h-2 rounded-full ${syncError ? 'bg-red-500' : supabase ? 'bg-green-500 animate-pulse' : 'bg-stone-300'}`}></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                    {syncError ? 'Connection Error' : supabase ? t('cloud_sync') : t('local_mode')}
                  </span>
                </button>
                {user && (
                   <button
                    onClick={handleRefreshAppData}
                    title="Refresh Data"
                    className="w-8 h-8 rounded-full bg-stone-50 border border-stone-100 flex items-center justify-center text-stone-400 hover:text-amber-600 hover:bg-white transition-all"
                   >
                     <i className="fas fa-sync-alt text-[10px]"></i>
                   </button>
                )}
              </div>
              </div>
              <nav className="hidden md:flex gap-8">
                <button onClick={() => setView('recipes')} className={`font-bold transition-all text-sm ${view === 'recipes' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_recipes')}</button>
                <button onClick={() => setView('brews')} className={`font-bold transition-all text-sm ${view === 'brews' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_brews')}</button>
                <button onClick={() => setView('library')} className={`font-bold transition-all text-sm ${view === 'library' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_library')}</button>
                <button onClick={() => setView('admin')} className={`font-bold transition-all text-sm ${view === 'admin' ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>{t('nav_admin')}</button>
              </nav>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-col items-end mr-2">
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{user ? t('logged_in_as') : t('guest_mode')}</p>
                    <p className="text-[10px] font-bold text-stone-900 truncate max-w-[120px]">{user?.email || t('guest_user')}</p>
                  </div>
                  <button
                    onClick={() => setView(user ? 'settings' : 'auth')}
                    title={user ? t('settings_label') : t('nav_auth' as any) || 'Login'}
                    aria-label={user ? t('settings_label') : t('nav_auth' as any) || 'Login'}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${view === 'settings' || view === 'auth' ? 'bg-amber-600 text-white shadow-lg' : 'bg-stone-100 text-stone-400 hover:text-stone-600'}`}
                  >
                    <i className="fas fa-user"></i>
                  </button>
                  <button
                    onClick={() => setView('help')}
                    title="Help & Manuals"
                    aria-label="Help & Manuals"
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${view === 'help' ? 'bg-amber-600 text-white shadow-lg' : 'bg-stone-100 text-stone-400 hover:text-stone-600'}`}
                  >
                    <i className="fas fa-question-circle"></i>
                  </button>
                </div>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 py-10 pb-32">
            {view === 'recipes' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <h2 className="text-4xl font-black text-stone-900">{t('nav_recipes')}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {preferences.enableStockManagement && (
                      <button
                        onClick={() => setShowBrewableOnly(!showBrewableOnly)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${showBrewableOnly ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-100' : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400'}`}
                      >
                        <i className={`fas ${showBrewableOnly ? 'fa-check-circle' : 'fa-circle'}`}></i>
                        {t('show_brewable_only')}
                      </button>
                    )}

                    <div className="flex bg-stone-100 p-1 rounded-2xl w-fit">
                      <button
                        onClick={() => setLibraryView('personal')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${libraryView === 'personal' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                      >
                        {t('personal_collection')}
                      </button>
                      <button
                        onClick={() => setLibraryView('public')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${libraryView === 'public' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                      >
                        {t('public_library')}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {libraryView === 'personal' && (
                    <button
                      onClick={() => { setSelectedRecipe(null); setView('create'); }}
                      className="bg-white rounded-3xl border-2 border-dashed border-stone-200 p-6 hover:border-amber-500 hover:bg-amber-50/30 transition-all flex flex-col items-center justify-center gap-4 group h-full min-h-[300px]"
                    >
                      <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                        <i className="fas fa-plus text-2xl"></i>
                      </div>
                      <div className="text-center">
                        <p className="font-black text-stone-900 uppercase tracking-widest text-sm">{t('nav_new')}</p>
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Create Recipe</p>
                      </div>
                    </button>
                  )}
                  {processedRecipes.map(({ recipe: r, stock }) => (
                    <div key={r.id} className="bg-white rounded-3xl border border-stone-200 p-6 hover:shadow-xl transition-all border-b-4 group relative flex flex-col" style={{ borderBottomColor: getSRMColor(r.specifications?.color?.value || 0) }}>
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button onClick={() => handlePrintRecipe(r)} title={t('print_recipe')} className="text-stone-300 hover:text-stone-900 transition-colors"> <i className="fas fa-print text-lg"></i> </button>
                        <button onClick={() => handleExportRecipeBeerXml(r)} title="Export BeerXML" className="text-stone-300 hover:text-amber-600 transition-colors"> <i className="fas fa-file-export text-lg"></i> </button>
                      </div>
                      <h3 className="text-xl font-bold mb-1 pr-16 truncate group-hover:text-amber-800 transition-colors">{r.name}</h3>
                      
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {libraryView === 'personal' && r.status === 'submitted' && (
                          <div className="flex items-center gap-1.5">
                            <i className="fas fa-clock text-amber-500 text-[10px]"></i>
                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Pending Review</span>
                          </div>
                        )}

                        {preferences.enableStockManagement && (
                          stock.isBrewable ? (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 rounded-full border border-green-100">
                              <i className="fas fa-check-circle text-green-600 text-[10px]"></i>
                              <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">{t('ready_to_brew')}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 rounded-full border border-red-100">
                              <i className="fas fa-exclamation-circle text-red-600 text-[10px]"></i>
                              <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">
                                {stock.missing.length + stock.insufficient.length} {t('missing_ingredients')}
                              </span>
                            </div>
                          )
                        )}
                      </div>

                      <div className="flex-1">
                        {r.notes && (
                          <p className="text-[10px] text-stone-400 font-medium mb-4 line-clamp-2 italic leading-relaxed">
                            {r.notes}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">Batch</p><p className="font-bold text-xs">{formatBrewNumber(r.batch_size.value, 'vol', lang, preferences, r.batch_size.unit)} {preferences.units === 'imperial' ? 'Gal' : 'L'}</p></div>
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">ABV</p><p className="font-bold text-xs">{formatBrewNumber(r.specifications?.abv?.value, 'abv', lang, preferences)}%</p></div>
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">IBU</p><p className="font-bold text-xs">{r.specifications?.ibu?.value}</p></div>
                        <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">OG</p><p className="font-bold text-xs">{formatBrewNumber(r.specifications?.og?.value, 'og', lang, preferences)}</p></div>
                      </div>
                      <div className="flex flex-col gap-2 mt-auto">
                        <div className="flex gap-2">
                          <button onClick={() => { setSelectedRecipe(r); setSelectedBrewLog(null); setView('log'); }} className="flex-1 bg-amber-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">Brew</button>
                          {libraryView === 'personal' && (!r.user_id || r.user_id === user?.id) && <button onClick={() => { setSelectedRecipe(r); setView('create'); }} className="flex-1 bg-stone-100 text-stone-900 text-xs font-bold py-3 rounded-xl hover:bg-stone-200 transition-all">Edit</button>}
                        </div>

                        {libraryView === 'public' && (
                          <button
                            onClick={() => handleRecipeAddToPersonal(r)}
                            className="w-full bg-stone-900 text-white text-[10px] font-black uppercase py-3 rounded-xl hover:bg-black transition-all tracking-widest"
                          >
                            <i className="fas fa-plus-circle mr-2"></i> {t('add_to_collection')}
                          </button>
                        )}

                        {user && libraryView === 'personal' && r.status !== 'submitted' && (
                          <button
                            onClick={() => handleRecipeSubmitToPublic(r)}
                            className="w-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase py-3 rounded-xl hover:bg-amber-200 transition-all tracking-widest"
                          >
                            <i className="fas fa-cloud-upload-alt mr-2"></i> {t('submit_to_public')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {processedRecipes.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-stone-200 px-6 shadow-sm">
                      <i className="fas fa-beer text-5xl text-amber-100 mb-6 block"></i>
                      <p className="text-stone-400 font-bold max-w-sm mx-auto mb-6"> {t('empty_recipes_hint').split('Library')[0]} <button onClick={() => setView('library')} className="text-amber-600 underline hover:text-amber-700"> {t('go_to_library')} </button> {t('empty_recipes_hint').split('Library')[1]} </p>
                      <div className="flex flex-col items-center gap-4"> <p className="text-xs font-black text-stone-300 uppercase tracking-widest">{t('demo_hint')}</p> <button onClick={handleImportDemoData} className="bg-amber-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl hover:bg-amber-700 transition-all flex items-center gap-2"> <i className="fas fa-download"></i> {t('import_demo')} </button> </div>
                    </div>
                  )}
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
              <RecipeCreator
                initialRecipe={selectedRecipe || undefined}
                onSave={handleSaveRecipe}
                onSubmitToPublic={handleRecipeSubmitToPublic}
                onDelete={handleDeleteRecipe}
                library={deduplicatedLibrary}
              />
            )}
            {view === 'library' && (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                  <div>
                    <h2 className="text-4xl font-black text-stone-900">{t('nav_library')}</h2>
                  </div>
                  <div className="flex bg-stone-100 p-1 rounded-2xl w-fit">
                    <button
                      onClick={() => setLibraryView('personal')}
                      className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${libraryView === 'personal' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                      {t('personal_collection')}
                    </button>
                    <button
                      onClick={() => setLibraryView('public')}
                      className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${libraryView === 'public' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                      {t('public_library')}
                    </button>
                  </div>
                </div>
              <IngredientLibrary
                ingredients={library}
                libraryView={libraryView}
                onUpdate={async (newLib) => {
                  // Track and handle deletions for Supabase sync
                  const deleted = library.filter(l => !newLib.find(nl => nl.id === l.id));
                  deleted.forEach(d => supabaseService.deleteLibraryIngredient(d.id, d.type));

                  // Find created/updated items
                  const changed = newLib.filter(newItem => {
                    const oldItem = library.find(o => o.id === newItem.id);
                    return !oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem);
                  });

                  setLibrary(newLib);

                  if (user?.id && changed.length > 0) {
                    for (const item of changed) {
                      await supabaseService.saveLibraryIngredient(item, user.id, profile?.brewery_id);
                    }
                  }
                }}
              />
              </div>
            )}
            {view === 'admin' && (
              <AdminView
                onExport={handleExportData}
                onExportBeerXml={handleExportLibraryBeerXml}
                onRestore={handleRestoreData}
                onFileImport={handleFileImport}
                onUrlImport={handleImportDemoData}
                xmlUrl={xmlUrl}
                onXmlUrlChange={setXmlUrl}
                importStatus={importStatus}
                pendingSubmissions={pendingSubmissions}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            )}
            {view === 'auth' && <Auth onSuccess={() => setView('recipes')} />}
            {view === 'settings' && <Settings />}
            {view === 'tasting' && selectedRecipe && selectedBrewLog && (
              <TastingNotes
                recipe={selectedRecipe}
                brewLogId={selectedBrewLog.id}
                onSave={async (note) => {
                  const targetNote = { ...note, user_id: user?.id, brewery_id: profile?.brewery_id };
                  setTastingNotes([targetNote, ...tastingNotes]);
                  if (user?.id) {
                    await supabaseService.saveTastingNote(targetNote, user.id, profile?.brewery_id);
                  }
                  setView('brews');
                }}
              />
            )}
            {view === 'help' && <HelpView />}
          </main>
        </div>
      </div>
    </LanguageContext.Provider>
  );
};

export default App;

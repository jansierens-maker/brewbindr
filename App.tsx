import React, { useState, useEffect, createContext, useContext } from 'react';
import RecipeCreator from './components/RecipeCreator';
import BrewLog from './components/BrewLog';
import TastingNotes from './components/TastingNotes';
import IngredientLibrary from './components/IngredientLibrary';
import BrewHistory from './components/BrewHistory';
import PrintView from './components/PrintView';
import AdminView from './components/AdminView';
import Auth from './components/Auth';
import Settings from './components/Settings';
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from './types';
import { getSRMColor, formatBrewNumber } from './services/calculations';
import { parseBeerXml, BeerXmlImportResult } from './services/beerXmlService';
import { exportToBeerXml, exportLibraryToBeerXml } from './services/beerXmlExportService';
import { translations, Language } from './services/i18n';
import { supabaseService } from './services/supabaseService';
import { supabase } from './services/supabaseClient';
import { UserProvider, useUser } from './services/userContext';

type View = 'recipes' | 'create' | 'log' | 'tasting' | 'library' | 'brews' | 'admin' | 'settings' | 'auth';
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
  const [tableStatus, setTableStatus] = useState<Record<string, boolean>>({});
  const [allowLocalStorage, setAllowLocalStorage] = useState(true);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importQueue, setImportQueue] = useState<{ type: 'recipe' | 'library', data: any }[]>([]);
  const [currentDuplicate, setCurrentDuplicate] = useState<{ type: 'recipe' | 'library', data: any } | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [selectedDemoIds, setSelectedDemoIds] = useState<string[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);

  const [printData, setPrintData] = useState<{ recipe?: Recipe, log?: BrewLogEntry, tastingNote?: TastingNote } | null>(null);

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

  useEffect(() => {
    if (!supabase) {
      const dismissed = localStorage.getItem('brewmaster_fallback_dismissed');
      if (!dismissed) {
        setShowFallbackModal(true);
      }
    }
    const loadData = async () => {
      if (authLoading) return;

      // First load from localStorage for immediate availability
      const saved = localStorage.getItem('brewmaster_data_v3');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.recipes) setRecipes(data.recipes);
          if (data.brewLogs) setBrewLogs(data.brewLogs);
          if (data.tastingNotes) setTastingNotes(data.tastingNotes);
          if (data.library) setLibrary(data.library);
        } catch (e) {
          console.error('Error parsing local data:', e);
        }
      }

      // Sync from Supabase for cross-device consistency
      const remoteData = await supabaseService.fetchAppData(user?.id);
      if (remoteData) {
        // We overwrite local state with remote data.
        setRecipes(remoteData.recipes);
        setBrewLogs(remoteData.brewLogs);
        setTastingNotes(remoteData.tastingNotes);
        setLibrary(remoteData.library);
      }

      if (isAdmin) {
        const pending = await supabaseService.fetchPendingSubmissions();
        setPendingSubmissions(pending);
      }
    };
    loadData();
  }, [user?.id, authLoading, isAdmin]);

  useEffect(() => {
    if (authLoading) return;
    const data = { recipes, brewLogs, tastingNotes, library };
    if (allowLocalStorage) {
      localStorage.setItem('brewmaster_data_v3', JSON.stringify(data));
    }

    // Debounced sync to Supabase (2 seconds delay to avoid excessive API calls)
    const timer = setTimeout(() => {
      supabaseService.syncAll(data, user?.id);
    }, 2000);

    return () => clearTimeout(timer);
  }, [recipes, brewLogs, tastingNotes, library, user?.id, authLoading]);

  const handleSaveRecipe = (recipe: Recipe) => {
    if (selectedRecipe && selectedRecipe.id) {
      setRecipes(prev => prev.map(r => r.id === selectedRecipe.id ? { ...recipe, id: selectedRecipe.id, user_id: user?.id } : r));
    } else {
      const newRecipe = { ...recipe, id: Math.random().toString(36).substr(2, 9), user_id: user?.id };
      setRecipes(prev => [...prev, newRecipe]);
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

  const handleUpdateBrewLog = (entry: BrewLogEntry) => {
    setBrewLogs(prev => {
      const exists = prev.find(l => l.id === entry.id);
      if (exists) return prev.map(l => l.id === entry.id ? entry : l);
      return [{ ...entry, user_id: user?.id }, ...prev];
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

    setImportQueue(queue);
    setImportStatus('resolving');
    // Important: call with state snapshots for consistency
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
        newRecipes.push({ ...linked, user_id: user?.id });
      } else {
        const newItem = { ...next.data, id: Math.random().toString(36).substr(2, 9), user_id: user?.id };
        newLib.push(newItem);
      }
      // Update state once per step
      setRecipes(newRecipes);
      setLibrary(newLib);
      
      const nextQ = currentQueue.slice(1);
      setImportQueue(nextQ);
      // Wait for state updates before next recursive call
      setTimeout(() => processQueue(nextQ, newRecipes, newLib), 0);
    }
  };

  const linkIngredientsToLibrary = (recipe: Recipe, tempLib: LibraryIngredient[]) => {
    const getLibId = (name: string, type: string, props: Partial<LibraryIngredient>): string => {
      const existing = tempLib.find(i => i.type === type && i.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing.id;
      const newId = Math.random().toString(36).substr(2, 9);
      tempLib.push({ id: newId, name, type, user_id: user?.id, ...props } as LibraryIngredient);
      return newId;
    };
    return {
      ...recipe,
      ingredients: {
        ...recipe.ingredients,
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
        updatedRecipes = recipes.map(r => r.name.toLowerCase() === linked.name.toLowerCase() ? { ...linked, id: r.id, user_id: user?.id } : r);
      } else {
        updatedLib = library.map(l => (l.name.toLowerCase() === currentDuplicate.data.name.toLowerCase() && l.type === currentDuplicate.data.type) ? { ...currentDuplicate.data, id: l.id, user_id: user?.id } : l);
      }
    } else if (action === 'copy') {
      if (currentDuplicate.type === 'recipe') {
        const linked = linkIngredientsToLibrary({ ...currentDuplicate.data, name: `${currentDuplicate.data.name} (Copy)` }, updatedLib);
        linked.id = Math.random().toString(36).substr(2, 9);
        updatedRecipes = [...recipes, { ...linked, user_id: user?.id }];
      } else {
        const newItem = { ...currentDuplicate.data, name: `${currentDuplicate.data.name} (Copy)`, id: Math.random().toString(36).substr(2, 9), user_id: user?.id };
        updatedLib = [...library, newItem];
      }
    }

    setRecipes(updatedRecipes);
    setLibrary(updatedLib);
    setImportQueue(nextQueue);
    setCurrentDuplicate(null);
    setTimeout(() => processQueue(nextQueue, updatedRecipes, updatedLib), 0);
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
            const targetUrl = `http://www.beerxml.com/${opt.file}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;
            const xmlText = await response.text();
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
    } catch (err) {
        console.error("Batch import failed", err);
        alert("Batch import encountered errors.");
        setImportStatus('idle');
    }
    setSelectedDemoIds([]);
  };

  const handleImportDemoData = () => {
    setShowDemoModal(true);
  };

  const handleOpenSyncDetails = async () => {
    setShowSyncDetails(true);
    if (supabase) {
      const status = await supabaseService.checkTableHealth();
      setTableStatus(status);
    }
  };

  const handleApprove = async (id: string, type: string, table?: string) => {
    await supabaseService.updateItemStatus(id, type, 'approved', table);
    const pending = await supabaseService.fetchPendingSubmissions();
    setPendingSubmissions(pending);
    // Refresh main data
    const remoteData = await supabaseService.fetchAppData(user?.id);
    if (remoteData) setLibrary(remoteData.library);
  };

  const handleReject = async (id: string, type: string, table?: string) => {
    await supabaseService.updateItemStatus(id, type, 'private', table);
    const pending = await supabaseService.fetchPendingSubmissions();
    setPendingSubmissions(pending);
  };

  const SQL_SCHEMA = `
-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  preferences JSONB DEFAULT '{"units": "metric", "colorScale": "srm"}'::jsonb
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create application tables with user_id and status
-- We use TEXT for id to support existing random string IDs, but UUID for user_id
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS brew_logs (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);
CREATE TABLE IF NOT EXISTS tasting_notes (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);
CREATE TABLE IF NOT EXISTS fermentables (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS hops (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS cultures (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS styles (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS miscs (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS mash_profiles (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);
CREATE TABLE IF NOT EXISTS waters (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);

-- Enable Row Level Security (RLS)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE brew_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fermentables ENABLE ROW LEVEL SECURITY;
ALTER TABLE hops ENABLE ROW LEVEL SECURITY;
ALTER TABLE cultures ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mash_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE waters ENABLE ROW LEVEL SECURITY;

-- Helper to check if user is admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER;

-- RLS Policies for Data Tables
DO \$\$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables)
  LOOP
    -- Everyone can read approved items (if the table has a status column)
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('CREATE POLICY "Allow read approved %I" ON %I FOR SELECT USING (status = ''approved'');', t, t);
    END IF;

    -- Users can read/write their own items
    EXECUTE format('CREATE POLICY "Allow user manage own %I" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);', t, t);

    -- Admins can do everything
    EXECUTE format('CREATE POLICY "Allow admin manage %I" ON %I FOR ALL USING (is_admin());', t, t);
  END LOOP;
END \$\$;
`.trim();

  const handleDismissFallback = () => {
    localStorage.setItem('brewmaster_fallback_dismissed', 'true');
    setShowFallbackModal(false);
  };

  const handleDeclineFallback = () => {
    setAllowLocalStorage(false);
    setShowFallbackModal(false);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      <div className="min-h-screen bg-stone-50 text-stone-900 print:bg-white print:p-0">
        {showSyncDetails && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-stone-900">{t('sync_details')}</h3>
                <button onClick={() => setShowSyncDetails(false)} className="text-stone-300 hover:text-stone-900 transition-colors"><i className="fas fa-times text-xl"></i></button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('connection_status')}</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${supabase ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="font-bold text-sm">{supabase ? 'Connected' : 'Not Configured'}</span>
                  </div>
                </div>

                {supabase && (
                  <div>
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('table_status')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.keys(tableStatus).length > 0 ? Object.entries(tableStatus).map(([table, found]) => (
                        <div key={table} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                          <span className="text-[10px] font-bold text-stone-600 truncate mr-2">{table}</span>
                          <span className={`text-[9px] font-black uppercase flex-shrink-0 ${found ? 'text-green-600' : 'text-red-500'}`}>
                            {found ? t('found') : t('not_found')}
                          </span>
                        </div>
                      )) : (
                        <div className="col-span-full py-4 text-center text-xs text-stone-400 italic">Checking status...</div>
                      )}
                    </div>
                  </div>
                )}

                <div>
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
                <button onClick={() => setShowDemoModal(false)} className="text-stone-300 hover:text-stone-900 transition-colors"><i className="fas fa-times text-xl"></i></button>
              </div>
              
              <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                <i className="fas fa-info-circle text-amber-600 mt-1"></i>
                <div>
                    <p className="text-xs text-amber-900 font-bold leading-relaxed">
                        Select which sample data sets you want to add to your collection. You can find more samples at <a href="https://beerxml.com" target="_blank" className="underline">BeerXML.com</a> or download BrewDog recipes from <a href="https://brewdogrecipes.com" target="_blank" className="underline">brewdogrecipes.com</a>.
                    </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {DEMO_OPTIONS.map(opt => (
                  <label 
                    key={opt.id}
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
              <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('recipes')}>
                <div className="bg-amber-500 p-2 rounded-xl text-white shadow-lg"><i className="fas fa-beer-mug-empty text-2xl"></i></div>
                <h1 className="text-2xl font-black font-serif italic text-stone-900 uppercase">brewbindr</h1>
              </div>

              <button
                onClick={handleOpenSyncDetails}
                className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-50 border border-stone-100 hover:bg-white transition-all"
              >
                <div className={`w-2 h-2 rounded-full ${supabase ? 'bg-green-500 animate-pulse' : 'bg-stone-300'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                  {supabase ? t('cloud_sync') : t('local_mode')}
                </span>
              </button>
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
                  <button onClick={() => setView(user ? 'settings' : 'auth')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${view === 'settings' || view === 'auth' ? 'bg-amber-600 text-white shadow-lg' : 'bg-stone-100 text-stone-400 hover:text-stone-600'}`}>
                    <i className="fas fa-user"></i>
                  </button>
                  <button onClick={() => { setSelectedRecipe(null); setView('create'); }} className="bg-stone-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-md"> <i className="fas fa-plus mr-2"></i>{t('nav_new')} </button>
                </div>
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
                      <div className="flex gap-2 mt-auto">
                        <button onClick={() => { setSelectedRecipe(r); setSelectedBrewLog(null); setView('log'); }} className="flex-1 bg-amber-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">Brew</button>
                        {(!r.user_id || r.user_id === user?.id) && <button onClick={() => { setSelectedRecipe(r); setView('create'); }} className="flex-1 bg-stone-100 text-stone-900 text-xs font-bold py-3 rounded-xl hover:bg-stone-200 transition-all">Edit</button>}
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
            {view === 'library' && (
              <IngredientLibrary
                ingredients={library}
                onUpdate={(newLib) => {
                  // Track and handle deletions for Supabase sync
                  const deleted = library.filter(l => !newLib.find(nl => nl.id === l.id));
                  deleted.forEach(d => supabaseService.deleteLibraryIngredient(d.id, d.type));
                  setLibrary(newLib);
                }}
              />
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
              <TastingNotes recipe={selectedRecipe} brewLogId={selectedBrewLog.id} onSave={(note) => { setTastingNotes([note, ...tastingNotes]); setView('brews'); }} />
            )}
          </main>
        </div>
      </div>
    </LanguageContext.Provider>
  );
};

export default App;

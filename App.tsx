import React, { useState, useEffect, createContext, useContext, useMemo, useRef, lazy, Suspense } from 'react';
const RecipeCreator = lazy(() => import('./components/RecipeCreator'));
import Bubbles from './components/Bubbles';
const BrewLog = lazy(() => import('./components/BrewLog'));
const TastingNotes = lazy(() => import('./components/TastingNotes'));
const BrewLogView = lazy(() => import('./components/BrewLogView'));
const TastingNotesView = lazy(() => import('./components/TastingNotesView'));
const IngredientLibrary = lazy(() => import('./components/IngredientLibrary'));
import type { LibrarySection } from './components/IngredientLibrary';
const PrintView = lazy(() => import('./components/PrintView'));
const AdminView = lazy(() => import('./components/AdminView'));
const ImportView = lazy(() => import('./components/ImportView'));
import Auth from './components/Auth';
import EquipmentPickerDialog from './components/EquipmentPickerDialog';
import NewPasswordForm from './components/NewPasswordForm';
import { authService } from './services/authService';
import { copyRecipe } from './services/recipeCopy';
import { applyStockChange } from './services/stock';
const Settings = lazy(() => import('./components/Settings'));
const HelpView = lazy(() => import('./components/HelpView'));
const BrewingInstallationView = lazy(() => import('./components/BrewingInstallationView'));
const VoorraadView = lazy(() => import('./components/VoorraadView').then(m => ({ default: m.VoorraadView })));
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { BottomNav } from './components/BottomNav';
import { InfoBanner } from './components/InfoBanner';
const BrewerySettings = lazy(() => import('./components/BrewerySettings'));
import { Recipe, BrewLogEntry, TastingNote, LibraryIngredient } from './types';
import { getSRMColor, formatBrewNumber, formatGravity, checkRecipeStock, normalizeRecipe, resolveEquipment, ownInstallations } from './services/calculations';
import { canEditRecipe, canManageBrews, canManageLibrary, canManageRecipes, canPublish } from './services/permissions';
import { Taster, batchNumbers, memberName } from './services/tasting';
import { URL_IMPORT_ENABLED } from './services/features';
import { findDuplicateRecipes, approvedKeys, uniqueName, privateRecipeNames, privateLibraryNames, isUniqueViolation, nameKey } from './services/duplicates';
import { parseBeerXml, BeerXmlImportResult } from './services/beerXmlService';
import { exportToBeerXml, exportLibraryToBeerXml } from './services/beerXmlExportService';
import { translations, Language } from './services/i18n';
import { supabaseService } from './services/supabaseService';
import { breweryService } from './services/breweryService';
import { supabase, getSupabaseConfigInfo } from './services/supabaseClient';
import { UserProvider, useUser } from './services/userContext';

type View = 'recipes' | 'create' | 'log' | 'tasting' | 'library' | 'library_mash' | 'library_styles' | 'library_equipment' | 'library_water' | 'admin' | 'settings' | 'auth' | 'help' | 'voorraad' | 'team' | 'importeren' | 'brouwinstallatie' | 'brouwlogboek' | 'proefnotities';
type ImportStatus = 'idle' | 'fetching' | 'parsing' | 'resolving';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Shown while a screen's code is being downloaded (screens are loaded on first use)
const ScreenLoading: React.FC = () => (
  <div className="py-20 flex justify-center" role="status" aria-live="polite">
    <i className="fas fa-circle-notch fa-spin text-2xl text-[var(--color-text-xmuted)]" aria-hidden="true"></i>
  </div>
);

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
  const { user, profile, preferences, isAdmin, loading: authLoading, updatePreferences, passwordRecovery, endPasswordRecovery } = useUser();
  const editContext = useMemo(
    () => ({ userId: user?.id, breweryId: profile?.brewery_id, breweryRole: profile?.brewery_role, isAdmin }),
    [user?.id, profile?.brewery_id, profile?.brewery_role, isAdmin],
  );
  const lang = preferences.language;
  const [view, setView] = useState<View>('recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [brewLogs, setBrewLogs] = useState<BrewLogEntry[]>([]);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
  const [library, setLibrary] = useState<LibraryIngredient[]>(EXAMPLES);
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedBrewLog, setSelectedBrewLog] = useState<BrewLogEntry | null>(null);
  /** Recipe waiting for the choice of installation before its brew starts */
  const [brewPickRecipe, setBrewPickRecipe] = useState<Recipe | null>(null);
  /** Installation chosen for the brew being started */
  const [newBrewEquipmentId, setNewBrewEquipmentId] = useState<string | undefined>(undefined);
  // Where to go back to after saving a tasting note: the brews or the tasting notes list
  const [tastingReturnView, setTastingReturnView] = useState<'brouwlogboek' | 'proefnotities'>('brouwlogboek');
  
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
  const [recipeTab, setRecipeTab] = useState<'all' | 'brewable' | 'brewing' | 'fermenting' | 'lagering' | 'bottled'>('all');
  const [teamCount, setTeamCount] = useState(1);
  const [members, setMembers] = useState<Taster[]>([]);
  // Tasting note being edited, and the batch the tasting notes screen opens on
  const [selectedNote, setSelectedNote] = useState<TastingNote | null>(null);
  const [notesBatch, setNotesBatch] = useState<string | undefined>(undefined);
  const [syncError, setSyncError] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const [printData, setPrintData] = useState<{ recipe?: Recipe, log?: BrewLogEntry, tastingNote?: TastingNote } | null>(null);

  // Names already in the public library, to flag duplicate submissions for admins
  const publicKeys = useMemo(() => approvedKeys(recipes, library), [recipes, library]);

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
        const isOwner = (!r.user_id || r.user_id === user?.id) || (profile?.brewery_id && r.brewery_id === profile.brewery_id);
        return isOwner && (r.status === 'private' || r.status === 'submitted');
      })
      .map(r => {
        const stock = checkRecipeStock(r, library);
        return { recipe: r, stock };
      })
      .filter(({ stock }) => {
        if (recipeTab === 'brewable' && preferences.enableStockManagement) return stock.isBrewable;
        if (recipeTab !== 'all' && recipeTab !== 'brewable') return false; // Handled by processedLogs
        return true;
      })
      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
  }, [recipes, libraryView, user?.id, profile?.brewery_id, recipeTab, preferences.enableStockManagement, library]);

  const isBottledInPeriod = (log: BrewLogEntry) => {
    if (log.status !== 'bottled') return false;
    if (preferences.bottled_period === 'all') return true;

    const bottledDate = log.bottling?.date || log.date;
    const date = new Date(bottledDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());

    const periods = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };

    return diffTime <= (periods[preferences.bottled_period as keyof typeof periods] || 0);
  };

  const processedLogs = useMemo(() => {
    if (['all', 'brewable'].includes(recipeTab)) return [];

    return brewLogs
      .filter(log => {
        if (recipeTab === 'brewing') return log.status === 'brewing';
        if (recipeTab === 'fermenting') return log.status === 'fermenting';
        if (recipeTab === 'lagering') return log.status === 'lagering';
        if (recipeTab === 'bottled') return isBottledInPeriod(log);
        return false;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [brewLogs, recipeTab, preferences.bottled_period]);

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
          nameKey(l.name) === nameKey(name) &&
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
    // user?.id (not user): the user object is replaced on every token refresh
  }, [user?.id, authLoading]);

  // Who the start screen was last chosen for ('guest' or a user id). The start
  // screen is only set when this changes (app start, login, logout), so loading
  // the profile, brewery or admin rights never throws the user back.
  const startScreenFor = useRef<string | null>(null);

  // Recipes deleted in this session. A fetch or realtime event that was already
  // on its way can still contain them; without this they would reappear.
  const deletedRecipeIds = useRef(new Set<string>());

  // Saves and deletes in flight, and a counter that changes with every one of them.
  // Loading all data takes a moment; a save made meanwhile would be overwritten by
  // the loaded data (and realtime is not listening yet), so the load waits and retries.
  const localWrites = useRef({ pending: 0, seq: 0 });
  const trackWrite = async <T,>(write: () => Promise<T>): Promise<T> => {
    localWrites.current.pending++;
    localWrites.current.seq++;
    try {
      return await write();
    } finally {
      localWrites.current.pending--;
      localWrites.current.seq++;
    }
  };
  /** Loads all data; loads again when something was saved while loading. */
  const fetchAppDataStable = async (isCancelled: () => boolean, userId?: string, breweryId?: string) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      while (localWrites.current.pending > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (isCancelled()) return null;
      }
      const seq = localWrites.current.seq;
      const data = await supabaseService.fetchAppData(userId, breweryId);
      if (isCancelled() || localWrites.current.seq === seq) return data;
    }
    return supabaseService.fetchAppData(userId, breweryId);
  };
  const withoutDeleted = (list: Recipe[]) =>
    deletedRecipeIds.current.size ? list.filter(r => !r.id || !deletedRecipeIds.current.has(r.id)) : list;

  // Handle redirect if stock management is disabled while on Voorraad view
  useEffect(() => {
    if (!preferences.enableStockManagement && view === 'voorraad') {
      setView('recipes');
      setLibraryView('personal');
    }
  }, [preferences.enableStockManagement, view]);

  useEffect(() => {
    if (profile?.brewery_id) {
      breweryService.getMembers(profile.brewery_id).then(list => {
        setTeamCount(list.length);
        setMembers(list);
      });
    } else {
      setTeamCount(1);
      setMembers([]);
    }
  }, [profile?.brewery_id]);

  // The team as tasters, with my own display name as I just typed it
  const tasters = useMemo<Taster[]>(() => {
    if (!user?.id) return members;
    const me: Taster = { id: user.id, email: user.email, display_name: profile?.display_name ?? null };
    return members.some(m => m.id === user.id) ? members.map(m => (m.id === user.id ? { ...m, display_name: me.display_name } : m)) : [...members, me];
  }, [members, user?.id, user?.email, profile?.display_name]);
  const myTasterName = memberName(tasters.find(m => m.id === user?.id)) || user?.email || '';
  const brewManager = canManageBrews({ isAdmin, breweryRole: profile?.brewery_role ?? null });
  // Recipes, library, stock and imports: brewery admins and brewmasters (see the RLS policies)
  const recipeManager = canManageRecipes({ isAdmin, breweryRole: profile?.brewery_role ?? null });
  const libraryManager = canManageLibrary({ isAdmin, breweryRole: profile?.brewery_role ?? null });
  const publisher = canPublish({ isAdmin, breweryRole: profile?.brewery_role ?? null });

  /** Shows a failed save or delete; returns true when it failed. */
  const reportFailure = (result: { error?: { message?: string } | null } | null | undefined, kind: 'save' | 'delete' = 'save'): boolean => {
    if (!result?.error) return false;
    alert(`${t(kind === 'save' ? 'save_failed' : 'delete_failed')}: ${result.error.message || ''}`);
    return true;
  };

  /** After a failed save: show what is really stored. */
  const reloadFromServer = async () => {
    if (!user?.id) return;
    const remote = await supabaseService.fetchAppData(user.id, profile?.brewery_id);
    if (!remote) return;
    setRecipes(withoutDeleted(remote.recipes));
    setBrewLogs(remote.brewLogs);
    setTastingNotes(remote.tastingNotes);
    if (remote.library) setLibrary(remote.library);
  };

  useEffect(() => {
    if (view !== 'proefnotities') setNotesBatch(undefined);
  }, [view]);

  const openTasting = (logId: string, returnTo: 'brouwlogboek' | 'proefnotities', note: TastingNote | null = null) => {
    const log = brewLogs.find(l => l.id === logId);
    const recipe = recipes.find(r => r.id === log?.recipeId);
    if (!log || !recipe) return;
    setSelectedBrewLog(log);
    setSelectedRecipe(recipe);
    setSelectedNote(note);
    setTastingReturnView(returnTo);
    setView('tasting');
  };

  const handleSaveTastingNote = async (note: TastingNote) => {
    const existing = tastingNotes.find(n => n.id === note.id);
    // A new note is always in my name; an edited note keeps its taster
    const target: TastingNote = existing
      ? { ...note, user_id: existing.user_id, brewery_id: existing.brewery_id }
      : { ...note, user_id: user?.id, brewery_id: profile?.brewery_id };
    setTastingNotes(prev => (existing ? prev.map(n => (n.id === target.id ? target : n)) : [target, ...prev]));
    setSelectedNote(null);
    setView(tastingReturnView);
    if (!user?.id) return;
    const result = existing
      ? await trackWrite(() => supabaseService.updateTastingNote(target))
      : await trackWrite(() => supabaseService.saveTastingNote(target, user.id, profile?.brewery_id));
    if (result?.error) {
      alert(`${t('save_failed')}: ${result.error.message}`);
      const remote = await supabaseService.fetchAppData(user.id, profile?.brewery_id);
      if (remote) setTastingNotes(remote.tastingNotes);
    }
  };

  const handleToggleFinished = (logId: string) => {
    const log = brewLogs.find(l => l.id === logId);
    if (!log) return;
    const finished = !log.finished;
    handleUpdateBrewLog({ ...log, finished, finishedDate: finished ? new Date().toISOString().slice(0, 10) : undefined });
  };

  const handleDeleteTastingNote = async (id: string) => {
    if (!confirm(t('confirm_delete_note'))) return;
    const before = tastingNotes;
    setTastingNotes(prev => prev.filter(n => n.id !== id));
    if (!user?.id) return;
    const result = await trackWrite(() => supabaseService.deleteTastingNote(id));
    if (result?.error) {
      alert(`${t('delete_failed')}: ${result.error.message}`);
      setTastingNotes(before);
    }
  };

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
          const mergedData = table === 'recipes' ? normalizeRecipe({ ...newRecord.data }) : { ...newRecord.data };
          if (newRecord.id) mergedData.id = newRecord.id;
          if (newRecord.user_id) mergedData.user_id = newRecord.user_id;
          if (newRecord.brewery_id) mergedData.brewery_id = newRecord.brewery_id;
          if (newRecord.status) mergedData.status = newRecord.status;

          const exists = prev.find(item => item.id === mergedData.id);
          // The stock has its own table (#137): keep what we have, ignore any old copy in the data
          if (['fermentables', 'hops', 'cultures', 'miscs'].includes(table)) {
            if (exists?.stock) mergedData.stock = exists.stock; else delete mergedData.stock;
          }
          if (exists) {
            return prev.map(item => item.id === mergedData.id ? mergedData : item);
          }
          return [mergedData, ...prev];
        });
      };

      if (table === 'stock') {
        setLibrary(prev => applyStockChange(prev, eventType, eventType === 'DELETE' ? oldRecord : newRecord));
        return;
      }
      if (table === 'recipes') {
        if (eventType !== 'DELETE' && newRecord?.id && deletedRecipeIds.current.has(newRecord.id)) return;
        updateState(setRecipes);
      }
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

        const identity = user?.id ?? 'guest';
        const previousIdentity = startScreenFor.current;
        startScreenFor.current = identity;

        if (previousIdentity !== identity) {
          if (user) {
            // App start while logged in, or just logged in: personal recipes
            setView('recipes');
            setLibraryView('personal');
          } else if (previousIdentity !== null) {
            // Just logged out: public recipes. (On a fresh start, guests already
            // begin there, and may have clicked elsewhere while this loads.)
            setView('recipes');
            setLibraryView('public');
          }
        }

        if (!user) {
          const health = await supabaseService.checkTableHealth();
          if (cancelled) return;
          const allOk = Object.values(health).every(v => v === true);
          if (!allOk) {
            // Tables missing or error, show connection details
            setShowSyncDetails(true);
          }
        }

        const remoteData = await fetchAppDataStable(() => cancelled, user?.id, profile?.brewery_id || user?.user_metadata?.brewery_id);
        if (cancelled) return;
        if (remoteData) {
          setRecipes(withoutDeleted(remoteData.recipes));
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
        const tables = ['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters', 'stock'];

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
    // Recipe names are unique per brewery (enforced in the database too)
    const ownId = selectedRecipe?.id;
    const isPrivate = !recipe.status || recipe.status === 'private';
    if (isPrivate && privateRecipeNames(recipes, profile?.brewery_id, user?.id, ownId).some(n => nameKey(n) === nameKey(recipe.name))) {
      alert(t('recipe_name_taken').replace('{name}', recipe.name));
      return;
    }

    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'private', library);

    if (newIngredients.length > 0) {
      setLibrary(prev => [...prev, ...newIngredients]);
      if (user?.id) {
        await trackWrite(() => supabaseService.batchSaveLibraryIngredients(newIngredients, user.id, profile?.brewery_id));
      }
    }

    const targetRecipe = normalizeRecipe(selectedRecipe && selectedRecipe.id
      ? { ...syncedRecipe, id: selectedRecipe.id, user_id: selectedRecipe.user_id || user?.id, brewery_id: selectedRecipe.brewery_id || profile?.brewery_id }
      : { ...syncedRecipe, id: crypto.randomUUID(), user_id: user?.id, brewery_id: profile?.brewery_id });

    setRecipes(prev => {
      const exists = prev.find(r => r.id === targetRecipe.id);
      if (exists) return prev.map(r => r.id === targetRecipe.id ? targetRecipe : r);
      return [targetRecipe, ...prev];
    });

    if (user?.id) {
      // Keep the original maker when a brewery admin edits a colleague's recipe
      const result = await trackWrite(() => supabaseService.saveRecipe(targetRecipe, targetRecipe.user_id || user.id, targetRecipe.brewery_id || profile?.brewery_id));
      if (result?.error) {
        alert(isUniqueViolation(result.error)
          ? t('recipe_name_taken').replace('{name}', targetRecipe.name)
          : `${t('save_failed')}: ${result.error.message}`);
        // Reload so the list shows what is really stored
        const remoteData = await supabaseService.fetchAppData(user.id, profile?.brewery_id);
        if (remoteData) setRecipes(withoutDeleted(remoteData.recipes));
        return;
      }
    }

    setSelectedRecipe(null);
    setView('recipes');
  };

  /**
   * Deletes a recipe after asking. When brews use it, the question offers to delete
   * those brews and their tasting notes too, or to cancel. Brews of other breweries
   * are never deleted, so then the recipe stays. Returns true when it was deleted.
   */
  const deleteRecipeAndBrews = async (id: string, plainQuestion: string): Promise<boolean> => {
    const localBrewIds = brewLogs.filter(l => l.recipeId === id).map(l => l.id);
    const localDeps = {
      brews: localBrewIds.length,
      notes: tastingNotes.filter(n => n.recipeId === id || localBrewIds.includes(n.brewLogId)).length,
      foreign: 0,
    };
    const deps = (user?.id ? await supabaseService.recipeDependents(id) : null) ?? localDeps;

    if (deps.foreign > 0) {
      alert(t('recipe_in_use_elsewhere').replace('{brews}', String(deps.foreign)));
      return false;
    }
    const withBrews = deps.brews > 0;
    const question = withBrews
      ? t('confirm_delete_recipe_with_brews').replace('{brews}', String(deps.brews)).replace('{notes}', String(deps.notes))
      : plainQuestion;
    if (!confirm(question)) return false;

    if (user?.id) {
      const result = await trackWrite(() => supabaseService.deleteRecipeCascade(id, withBrews));
      if (result?.error) {
        alert(`${t('delete_failed')}: ${result.error.message}`);
        return false;
      }
    }

    deletedRecipeIds.current.add(id);
    setRecipes(prev => prev.filter(r => r.id !== id));
    if (withBrews) {
      const brewIds = new Set(brewLogs.filter(l => l.recipeId === id).map(l => l.id));
      setBrewLogs(prev => prev.filter(l => l.recipeId !== id));
      setTastingNotes(prev => prev.filter(n => n.recipeId !== id && !brewIds.has(n.brewLogId)));
    }
    return true;
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!(await deleteRecipeAndBrews(id, t('confirm_delete')))) return;
    setSelectedRecipe(null);
    setView('recipes');
  };

  const handleUpdateBrewLog = async (entry: BrewLogEntry) => {
    // Keep the original brewer when someone else updates the brew
    const targetLog = { ...entry, user_id: entry.user_id || user?.id, brewery_id: entry.brewery_id || profile?.brewery_id };
    setBrewLogs(prev => {
      const exists = prev.find(l => l.id === entry.id);
      if (exists) return prev.map(l => l.id === entry.id ? targetLog : l);
      return [targetLog, ...prev];
    });
    if (user?.id) {
      const result = await trackWrite(() => supabaseService.saveBrewLog(targetLog, targetLog.user_id || user.id, targetLog.brewery_id || profile?.brewery_id));
      if (reportFailure(result)) await reloadFromServer();
    }
  };

  const openNewBrew = (recipe: Recipe, equipmentId?: string) => {
    setNewBrewEquipmentId(equipmentId);
    setSelectedRecipe(recipe);
    setSelectedBrewLog(null);
    setView('log');
  };

  /**
   * Start a brew. With several installations, ask which one the brew is made on, unless
   * the brewery has a default and the recipe uses that one (or names none).
   */
  const startBrew = (recipe: Recipe) => {
    const installations = ownInstallations(deduplicatedLibrary);
    if (installations.length <= 1) return openNewBrew(recipe);
    const def = installations.find(e => e.is_default);
    const recipeId = installations.some(e => e.id === recipe.equipmentId) ? recipe.equipmentId : undefined;
    if (def && (!recipeId || recipeId === def.id)) return openNewBrew(recipe);
    setBrewPickRecipe(recipe);
  };

  // Library screens: ingredients, mash profiles, styles, and (public only) installations and water profiles
  const librarySection = ({
    library: 'ingredients', library_mash: 'mash_profile', library_styles: 'style',
    library_equipment: 'equipment', library_water: 'water',
  } as const)[view as 'library' | 'library_mash' | 'library_styles' | 'library_equipment' | 'library_water'] as LibrarySection | undefined;
  // Own installations and water profiles are managed under Brewing Installation
  const publicOnlySection = librarySection === 'equipment' || librarySection === 'water';

  const handleSaveAndExitBrewLog = (entry: BrewLogEntry) => {
    handleUpdateBrewLog(entry);
    setSelectedBrewLog(null);
    setView('brouwlogboek');
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
        alert(t('backup_restored'));
        setView('recipes');
      } catch (err) {
        alert(t('backup_invalid'));
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
    result.equipments.forEach(e => queue.push({ type: 'library', data: { ...e, type: 'equipment' } }));
    result.waters.forEach(w => queue.push({ type: 'library', data: { ...w, type: 'water' } }));
    
    if (queue.length === 0) {
      alert(t('import_no_data'));
      setImportStatus('idle');
      return;
    }

    setImportSummary({ inserted: 0, updated: 0, ignored: 0, errors: 0 });
    setImportQueue(queue);
    setImportStatus('resolving');
    // Important: call with state snapshots for consistency
    processQueue(queue, recipes, library, { inserted: 0, updated: 0, ignored: 0, errors: 0 });
  };

  const processQueue = async (currentQueue: typeof importQueue, currentRecipes: Recipe[], currentLib: LibraryIngredient[], summary: { inserted: number, updated: number, ignored: number, errors: number }) => {
    if (currentQueue.length === 0) {
      setImportStatus('complete');
      return;
    }
    const next = currentQueue[0];

    // Only check for duplicates in personal collection
    const personalRecipes = currentRecipes.filter(r =>
      (!r.status || r.status === 'private') &&
      ((!r.user_id || r.user_id === user?.id) ||
      (profile?.brewery_id && r.brewery_id === profile.brewery_id))
    );
    const personalLib = currentLib.filter(l =>
      (!l.status || l.status === 'private') &&
      ((!l.user_id || l.user_id === user?.id) ||
      (profile?.brewery_id && l.brewery_id === profile.brewery_id))
    );

    let isDuplicate = false;
    let exactMatches: any[] = [];

    if (next.type === 'recipe') {
      exactMatches = personalRecipes.filter(r => isExactlySame(r, next.data));
      isDuplicate = personalRecipes.some(r => nameKey(r.name) === nameKey(next.data.name));
    } else {
      exactMatches = personalLib.filter(l => l.type === next.data.type && isExactlySame(l, next.data));
      isDuplicate = personalLib.some(l => nameKey(l.name) === nameKey(next.data.name) && l.type === next.data.type);
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
          const linked = { ...result.recipe, user_id: user?.id, brewery_id: profile?.brewery_id };
          itemsAdded = 1 + result.addedToLibrary;
          newRecipes.push(linked);
          if (user?.id) {
            if (result.newIngredients.length > 0) {
              await supabaseService.batchSaveLibraryIngredients(result.newIngredients, user.id, profile?.brewery_id);
            }
            await supabaseService.saveRecipe(linked, user.id, profile?.brewery_id);
          }
        } else {
          const newItem = { ...next.data, id: crypto.randomUUID(), user_id: user?.id, brewery_id: profile?.brewery_id, status: 'private' };
          newLib.push(newItem);
          itemsAdded = 1;
          if (user?.id) {
            await supabaseService.saveLibraryIngredient(newItem, user.id, profile?.brewery_id);
          }
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
    return { recipe: syncedRecipe, addedToLibrary: newIngredients.length, newIngredients };
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
        const { recipe: linked, addedToLibrary, newIngredients } = linkIngredientsToLibrary(currentDuplicate.data, updatedLib);
        let targetRecipe: Recipe | null = null;
        updatedRecipes = recipes.map(r => {
          const isOwnOrBrewery = (!r.status || r.status === 'private') &&
            ((!r.user_id || r.user_id === user?.id) || (profile?.brewery_id && r.brewery_id === profile.brewery_id));
          if (isOwnOrBrewery && nameKey(r.name) === nameKey(linked.name)) {
            targetRecipe = { ...linked, id: r.id, user_id: user?.id, brewery_id: profile?.brewery_id, status: 'private' };
            return targetRecipe;
          }
          return r;
        });
        nextSummary.updated += 1;
        nextSummary.inserted += addedToLibrary;
        if (user?.id && targetRecipe) {
           if (newIngredients.length > 0) supabaseService.batchSaveLibraryIngredients(newIngredients, user.id, profile?.brewery_id);
           supabaseService.saveRecipe(targetRecipe, user.id, profile?.brewery_id);
        }
      } else {
        let targetItem: LibraryIngredient | null = null;
        updatedLib = library.map(l => {
          const isOwnOrBrewery = (!l.status || l.status === 'private') &&
            ((!l.user_id || l.user_id === user?.id) || (profile?.brewery_id && l.brewery_id === profile.brewery_id));
          if (isOwnOrBrewery && nameKey(l.name) === nameKey(currentDuplicate.data.name) && l.type === currentDuplicate.data.type) {
             const updated = { ...currentDuplicate.data, id: l.id, user_id: user?.id, brewery_id: profile?.brewery_id, status: 'private' } as LibraryIngredient;
             targetItem = updated;
             return updated;
          }
          return l;
        });
        nextSummary.updated += 1;
        if (user?.id && targetItem) {
           supabaseService.saveLibraryIngredient(targetItem, user.id, profile?.brewery_id);
        }
      }
    } else if (action === 'copy') {
      if (currentDuplicate.type === 'recipe') {
        const freeName = uniqueName(currentDuplicate.data.name, privateRecipeNames(recipes, profile?.brewery_id, user?.id));
        const { recipe: linked, addedToLibrary, newIngredients } = linkIngredientsToLibrary({ ...currentDuplicate.data, name: freeName }, updatedLib);
        linked.id = crypto.randomUUID();
        const finalRecipe = { ...linked, user_id: user?.id, brewery_id: profile?.brewery_id, status: 'private' as const };
        updatedRecipes = [...recipes, finalRecipe];
        nextSummary.inserted += 1 + addedToLibrary;
        if (user?.id) {
           if (newIngredients.length > 0) supabaseService.batchSaveLibraryIngredients(newIngredients, user.id, profile?.brewery_id);
           supabaseService.saveRecipe(finalRecipe, user.id, profile?.brewery_id);
        }
      } else {
        const freeName = uniqueName(currentDuplicate.data.name, privateLibraryNames(library, currentDuplicate.data.type, profile?.brewery_id, user?.id));
        const newItem = { ...currentDuplicate.data, name: freeName, id: crypto.randomUUID(), user_id: user?.id, brewery_id: profile?.brewery_id, status: 'private' };
        updatedLib = [...library, newItem];
        nextSummary.inserted += 1;
        if (user?.id) {
           supabaseService.saveLibraryIngredient(newItem, user.id, profile?.brewery_id);
        }
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
    if (!URL_IMPORT_ENABLED) return; // switched off for now (#121)
    const targetUrl = typeof urlInput === 'string' ? urlInput : xmlUrl;
    if (!targetUrl) return;

    // Security: Validate protocol to prevent URI scheme exploitation
    if (!targetUrl.toLowerCase().startsWith('http://') && !targetUrl.toLowerCase().startsWith('https://')) {
      alert(t('invalid_url'));
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
        alert(`${t('batch_import_failed')}: ${err.message || err.toString()}`);
        setImportStatus('idle');
    }
    setSelectedDemoIds([]);
  };

  const handleImportDemoData = () => {
    setShowDemoModal(true);
  };

  const handleRecipeSubmitToPublic = async (recipe: Recipe) => {
    if (!user?.id || !recipe.id) return;

    if (findDuplicateRecipes(recipe.name, recipes, recipe.id).length > 0 &&
        !confirm(t('duplicate_recipe_confirm').replace('{name}', recipe.name))) {
      return;
    }

    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'submitted', library);

    const clonedRecipe: Recipe = {
      ...syncedRecipe,
      id: crypto.randomUUID(),
      user_id: user.id,
      status: 'submitted'
    };

    if (newIngredients.length > 0) {
      const libResult = await supabaseService.batchSaveLibraryIngredients(newIngredients, user.id);
      if (reportFailure(libResult)) return;
    }
    const result = await supabaseService.saveRecipe(clonedRecipe, user.id);
    if (reportFailure(result)) return;

    // Refresh data
    const remoteData = await supabaseService.fetchAppData(user.id);
    if (remoteData) {
      setRecipes(withoutDeleted(remoteData.recipes));
      setLibrary(remoteData.library);
    }
    alert(t('recipe_submitted'));
  };

  const handleRecipeAddToPersonal = async (recipe: Recipe) => {
    const { syncedRecipe, newIngredients } = syncIngredientsWithLibrary(recipe, 'private', library);

    const newRecipeId = crypto.randomUUID();
    const updatedRecipe: Recipe = {
      ...syncedRecipe,
      id: newRecipeId,
      name: uniqueName(syncedRecipe.name, privateRecipeNames(recipes, profile?.brewery_id, user?.id)),
      user_id: user?.id,
      brewery_id: profile?.brewery_id,
      status: 'private'
    };

    setLibrary(prev => [...prev, ...newIngredients]);
    setRecipes(prev => [...prev, updatedRecipe]);

    if (user?.id) {
      if (newIngredients.length > 0) {
        await supabaseService.batchSaveLibraryIngredients(newIngredients, user.id);
      }
      const result = await supabaseService.saveRecipe(updatedRecipe, user.id, profile?.brewery_id);
      if (result?.error) {
        alert(`${t('save_failed')}: ${result.error.message}`);
        setRecipes(prev => prev.filter(r => r.id !== newRecipeId));
        return;
      }
    }

    setLibraryView('personal');
    alert(t('recipe_added_personal'));
  };

  /** Copy a brewery recipe: saved as a new private recipe and opened in the editor. */
  const handleCopyRecipe = async (recipe: Recipe) => {
    const copy = normalizeRecipe(copyRecipe(recipe, {
      suffix: t('copy_suffix'),
      takenNames: privateRecipeNames(recipes, profile?.brewery_id, user?.id),
      userId: user?.id,
      breweryId: profile?.brewery_id,
    }));
    if (user?.id) {
      const result = await trackWrite(() => supabaseService.saveRecipe(copy, user.id, profile?.brewery_id));
      if (result?.error) {
        alert(`${t('save_failed')}: ${result.error.message}`);
        return;
      }
    }
    setRecipes(prev => [copy, ...prev]);
    setLibraryView('personal');
    setSelectedRecipe(copy);
    setView('create');
  };

  const handleRefreshAppData = async () => {
    setSyncError(false);
    const remoteData = await supabaseService.fetchAppData(user?.id, profile?.brewery_id || user?.user_metadata?.brewery_id);
    if (remoteData) {
      setRecipes(withoutDeleted(remoteData.recipes));
      setBrewLogs(remoteData.brewLogs);
      setTastingNotes(remoteData.tastingNotes);
      setLibrary(remoteData.library);
      alert(t('resync_ok'));
    } else {
      setSyncError(true);
      alert(t('resync_failed'));
    }
  };

  const handleAuthRedirect = (mode: 'signin' | 'signup' = 'signin') => {
    setAuthMode(mode);
    setView('auth');
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

  const getPageTitle = () => {
    switch (view) {
      case 'recipes': return libraryView === 'personal' ? t('nav_brewery') : t('public_library');
      case 'brouwlogboek': return t('nav_brews');
      case 'proefnotities': return t('tasting_notes');
      case 'voorraad': return t('nav_stock');
      case 'team': return t('team_label');
      case 'importeren': return t('nav_import');
      case 'brouwinstallatie': return t('nav_installation');
      case 'library': return t('ingredients_header');
      case 'library_mash': return t('nav_lib_mash');
      case 'library_styles': return t('nav_lib_styles');
      case 'library_equipment': return t('lib_tab_equipment');
      case 'library_water': return t('tab_water_profiles');
      case 'settings': return t('settings_label');
      case 'admin': return t('nav_admin');
      case 'help': return t('help_nav_label');
      case 'create': return selectedRecipe ? t('page_edit_recipe') : t('nav_new');
      case 'log': return t('page_brew_session');
      case 'tasting': return t('page_tasting_note');
      default: return 'BrewBindr';
    }
  };

  // Global admins: clean up the public recipe library
  const handleAdminUnpublishRecipe = async (recipe: Recipe) => {
    if (!isAdmin || !recipe.id || !confirm(t('confirm_unpublish' as any))) return;
    const result = await supabaseService.updateItemStatus(recipe.id, 'recipe', 'private', 'recipes');
    if (result?.error) {
      alert(`${t('admin_action_failed' as any)}: ${result.error.message}`);
      return;
    }
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, status: 'private' } : r));
  };

  const handleAdminDeleteRecipe = async (recipe: Recipe) => {
    if (!isAdmin || !recipe.id) return;
    await deleteRecipeAndBrews(recipe.id, t('confirm_admin_delete' as any));
  };

  const handleApprove = async (id: string, type: string, table?: string) => {
    const result = await supabaseService.updateItemStatus(id, type, 'approved', table);
    if (result?.error) {
      alert(isUniqueViolation(result.error) ? t('public_name_taken') : `${t('admin_action_failed' as any)}: ${result.error.message}`);
    }
    const pending = await supabaseService.fetchPendingSubmissions();
    setPendingSubmissions(pending);
    // State will be updated via Realtime
  };

  const handleReject = async (id: string, type: string, table?: string) => {
    // Back to private: the database adds " (2)" if the brewery already uses the name
    const result = await supabaseService.updateItemStatus(id, type, 'private', table);
    if (result?.error) alert(`${t('admin_action_failed' as any)}: ${result.error.message}`);
    const pending = await supabaseService.fetchPendingSubmissions();
    setPendingSubmissions(pending);
    // State will be updated via Realtime
  };

  // Full setup SQL (schema_update.sql), loaded only when the connection dialog opens
  const [schemaSql, setSchemaSql] = useState('');
  useEffect(() => {
    if (showSyncDetails && !schemaSql) {
      import('./schema_update.sql?raw').then(m => setSchemaSql(m.default)).catch(() => setSchemaSql(''));
    }
  }, [showSyncDetails, schemaSql]);

  const handleDismissFallback = () => {
    setShowFallbackModal(false);
  };

  const handleDeclineFallback = () => {
    setShowFallbackModal(false);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      <div className="min-h-screen bg-transparent text-[var(--color-text)] font-[var(--font-body)] print:bg-white print:p-0">
        <Bubbles />
        {showSyncDetails && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-stone-900">{t('sync_details')}</h3>
                <button
                  onClick={() => setShowSyncDetails(false)}
                  className="text-stone-300 hover:text-stone-900 transition-colors"
                  aria-label={t('close_sync_details')}
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
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('supabase_config')}</p>
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
                          <div className="col-span-full py-4 text-center text-xs text-stone-400 italic">{t('checking_status')}</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">{t('rls_status')}</p>
                      {rlsStatus ? (
                        <div className={`p-4 rounded-2xl border flex items-center gap-3 ${rlsStatus.enabled ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                          <i className={`fas ${rlsStatus.enabled ? 'fa-shield-check' : 'fa-shield-exclamation'} text-xl`}></i>
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest">{rlsStatus.enabled ? 'RLS Active' : 'RLS Check Failed'}</p>
                            {rlsStatus.reason && <p className="text-[10px] font-bold opacity-70">{rlsStatus.reason}</p>}
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-xs text-stone-400 italic">{t('checking_rls')}</div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('manual_sync')}</p>
                    <button
                      onClick={async () => {
                        const remoteData = await supabaseService.fetchAppData(user?.id);
                        if (remoteData) {
                          setRecipes(withoutDeleted(remoteData.recipes));
                          setBrewLogs(remoteData.brewLogs);
                          setTastingNotes(remoteData.tastingNotes);
                          setLibrary(remoteData.library);
                          setSyncError(false);
                          alert(t('resync_ok'));
                        } else {
                          setSyncError(true);
                          alert(t('resync_failed_permissions'));
                        }
                      }}
                      className="text-amber-600 font-black text-[10px] uppercase hover:underline"
                    >
                      {t('retry_sync')}
                    </button>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{t('sql_instructions')}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(schemaSql); alert(t('sql_copied')); }}
                      className="text-amber-600 font-black text-[10px] uppercase hover:underline"
                    >
                      {t('copy_sql')}
                    </button>
                  </div>
                  <pre className="bg-stone-900 text-stone-100 p-4 rounded-xl text-[10px] font-mono overflow-x-auto h-40">
                    {schemaSql || t('loading_short')}
                  </pre>
                </div>
              </div>

              <button
                onClick={() => setShowSyncDetails(false)}
                className="w-full mt-8 py-4 bg-stone-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg"
              >
                {t('close_btn')}
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
                <Suspense fallback={<ScreenLoading />}>
                  <PrintView recipe={printData.recipe} log={printData.log} tastingNote={printData.tastingNote} equipment={printData.recipe ? resolveEquipment(printData.recipe, deduplicatedLibrary, printData.log?.equipmentId) : undefined} />
                </Suspense>
              </div>
            </div>
          </div>
        )}

        {showDemoModal && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-stone-900">{t('demo_import_title')}</h3>
                <button
                  onClick={() => setShowDemoModal(false)}
                  className="text-stone-300 hover:text-stone-900 transition-colors"
                  aria-label={t('close_demo_import')}
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>
              
              <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                <i className="fas fa-info-circle text-amber-600 mt-1"></i>
                <div>
                    <p className="text-xs text-amber-900 font-bold leading-relaxed">
                        {t('demo_import_desc_before')} <a href="https://beerxml.com" target="_blank" rel="noopener noreferrer" className="underline">BeerXML.com</a> {t('demo_import_desc_middle')} <a href="https://brewdogrecipes.com" target="_blank" rel="noopener noreferrer" className="underline">brewdogrecipes.com</a>.
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
                  <button onClick={() => setShowDemoModal(false)} className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-stone-200 transition-all">{t('cancel_btn')}</button>
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

        <div className="flex flex-col lg:flex-row min-h-screen">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block">
            <Sidebar
              currentView={view}
              libraryView={libraryView}
              onViewChange={(v: View) => { setNotesBatch(undefined); setView(v); }}
              onLibraryViewChange={setLibraryView}
              onAuth={handleAuthRedirect}
            />
          </div>

          <div className="flex-1 flex flex-col lg:ml-[var(--sidebar-w)]">
            <Topbar
              title={getPageTitle()}
              showNewRecipeButton={view === 'recipes' && libraryView === 'personal' && recipeManager}
              isGuest={!user}
              syncError={syncError}
              onRefresh={handleRefreshAppData}
              onShowHelp={() => setView('help')}
              onOpenSyncDetails={handleOpenSyncDetails}
              onNewRecipe={() => { setSelectedRecipe(null); setView('create'); }}
              onAuth={() => handleAuthRedirect('signin')}
            />

            {!user && <InfoBanner />}

            <main className="flex-1 p-4 md:p-8 pb-32 lg:pb-8 max-w-7xl mx-auto w-full print:p-0 print:pb-0">
            <Suspense fallback={<ScreenLoading />}>
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
                        <h3 className="text-xl font-bold">{t('processing')}</h3>
                        <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">{importStatus}</p>
                      </div>
                    ) : currentDuplicate ? (
                      <div className="space-y-6">
                        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center gap-3">
                          <i className="fas fa-exclamation-triangle text-amber-600 text-xl"></i>
                          <div className="flex-1 overflow-hidden">
                            <h4 className="font-bold text-amber-900 text-sm">{t('conflict_label')}</h4>
                            <p className="text-[10px] text-amber-700 font-bold truncate">"{currentDuplicate.data.name}"</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <button onClick={() => resolveConflict('overwrite')} className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold text-sm">{t('overwrite_btn')}</button>
                          <button onClick={() => resolveConflict('copy')} className="w-full py-3 bg-white border border-stone-200 text-stone-900 rounded-xl font-bold text-sm">{t('create_copy_btn')}</button>
                          <button onClick={() => resolveConflict('skip')} className="w-full py-3 bg-white border border-stone-200 text-stone-400 rounded-xl font-bold text-sm">{t('skip_btn')}</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {view === 'recipes' && (
                <div className="space-y-10 animate-in fade-in duration-500">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                      <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{libraryView === 'personal' ? t('nav_brewery') : t('public_library')}</h2>
                    </div>
                  </div>

                  {user && libraryView === 'personal' && (
                    <>
                      {/* Stats Row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: t('stat_recipes'), value: recipes.filter(r => (r.status === 'private' || r.status === 'submitted') && ((!r.user_id || r.user_id === user.id) || (profile?.brewery_id && r.brewery_id === profile.brewery_id))).length, icon: 'fa-flask', view: 'recipes' as View, libView: 'personal' as const, tab: 'all' as const },
                          { label: t('stat_notes'), value: tastingNotes.length, icon: 'fa-star', view: 'proefnotities' as View },
                          { label: t('stat_team'), value: teamCount, icon: 'fa-users', view: 'team' as View },
                        ].map((stat, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                               setView(stat.view);
                               if ('libView' in stat && stat.libView) setLibraryView(stat.libView);
                               if ('tab' in stat && stat.tab) setRecipeTab(stat.tab);
                            }}
                            className="bg-[var(--color-bg)] p-5 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] text-left hover:border-[var(--color-accent)] transition-colors group"
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-accent)] text-xs group-hover:bg-[var(--color-accent)] group-hover:text-white transition-colors">
                                <i className={`fas ${stat.icon}`}></i>
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-xmuted)] group-hover:text-[var(--color-text)] transition-colors">{stat.label}</span>
                            </div>
                            <p className="text-2xl font-black text-[var(--color-text)]">{stat.value}</p>
                          </button>
                        ))}

                        {/* Dynamic Brew Status Tiles */}
                        {(() => {
                          const brewing = brewLogs.filter(l => l.status === 'brewing');
                          const fermenting = brewLogs.filter(l => l.status === 'fermenting');
                          const lagering = brewLogs.filter(l => l.status === 'lagering');
                          const bottled = brewLogs.filter(isBottledInPeriod);

                          const hasAnyActive = brewing.length > 0 || fermenting.length > 0 || lagering.length > 0 || bottled.length > 0;

                          if (!hasAnyActive) {
                            return (
                              <button
                                onClick={() => { setView('brouwlogboek'); }}
                                className="bg-[var(--color-bg)] p-5 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] text-left hover:border-[var(--color-accent)] transition-colors group"
                              >
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-accent)] text-xs group-hover:bg-[var(--color-accent)] group-hover:text-white transition-colors">
                                    <i className="fas fa-history"></i>
                                  </div>
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-xmuted)] group-hover:text-[var(--color-text)] transition-colors">{t('stat_brews_alt')}</span>
                                </div>
                                <p className="text-2xl font-black text-[var(--color-text)]">{brewLogs.length}</p>
                              </button>
                            );
                          }

                          return [
                            { label: t('tab_brewing'), count: brewing.length, logs: brewing, tab: 'brewing' as const, icon: 'fa-fire-alt' },
                            { label: t('tab_fermenting'), count: fermenting.length, logs: fermenting, tab: 'fermenting' as const, icon: 'fa-temperature-low' },
                            { label: t('tab_lagering'), count: lagering.length, logs: lagering, tab: 'lagering' as const, icon: 'fa-snowflake' },
                            { label: t('tab_bottled'), count: bottled.length, logs: bottled, tab: 'bottled' as const, icon: 'fa-box-open' }
                          ].filter(s => s.count > 0).map((stat, idx) => (
                            <button
                              key={`status-${idx}`}
                              onClick={() => { setView('recipes'); setRecipeTab(stat.tab); }}
                              className="bg-[var(--color-bg)] p-5 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] text-left hover:border-[var(--color-accent)] transition-colors group flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-accent)] text-xs group-hover:bg-[var(--color-accent)] group-hover:text-white transition-colors">
                                    <i className={`fas ${stat.icon}`}></i>
                                  </div>
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-xmuted)] group-hover:text-[var(--color-text)] transition-colors">{stat.label}</span>
                                </div>
                                <p className="text-2xl font-black text-[var(--color-text)]">{stat.count}</p>
                              </div>

                              <div className="mt-4 hidden md:block space-y-1">
                                {stat.logs.slice(0, 3).map(log => {
                                  const recipeName = recipes.find(r => r.id === log.recipeId)?.name || 'Unknown';
                                  const startDate = (stat.tab === 'bottled' ? (log.bottling?.date || log.date) : log.date);
                                  const days = Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
                                  return (
                                    <p key={log.id} className="text-[9px] font-bold text-[var(--color-text-muted)] truncate">
                                      • {recipeName} ({days} {t('days_label' as any)})
                                    </p>
                                  );
                                })}
                                {stat.logs.length > 3 && (
                                  <p className="text-[9px] font-black text-[var(--color-accent)] uppercase tracking-widest mt-1">
                                    + {stat.logs.length - 3} {t('more_label' as any)}
                                  </p>
                                )}
                              </div>
                            </button>
                          ));
                        })()}
                      </div>

                      {/* AI Promo Banner */}
                      <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-[var(--radius)] p-6 text-white shadow-lg relative overflow-hidden group">
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="space-y-1">
                            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                              <i className="fas fa-magic"></i> {t('ai_banner_title')}
                            </h3>
                            <p className="text-sm font-medium opacity-90 max-w-2xl">
                              {t('ai_banner_desc')}
                            </p>
                          </div>
                          <button
                            onClick={() => { setSelectedRecipe(null); setView('create'); }}
                            className="bg-white text-amber-600 px-8 py-3 rounded-[var(--radius-sm)] font-black text-xs uppercase tracking-widest hover:bg-amber-50 transition-colors shadow-md whitespace-nowrap"
                          >
                            {t('ai_banner_btn')}
                          </button>
                        </div>
                        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                      </div>

                      {/* Tabs */}
                      <div className="flex border-b border-[var(--color-border)] gap-8 overflow-x-auto custom-scrollbar">
                        {[
                          { id: 'all', label: t('tab_all') },
                          { id: 'brewable', label: t('tab_brewable'), hideIf: !preferences.enableStockManagement },
                          { id: 'brewing', label: t('tab_brewing'), count: brewLogs.filter(l => l.status === 'brewing').length },
                          { id: 'fermenting', label: t('tab_fermenting'), count: brewLogs.filter(l => l.status === 'fermenting').length },
                          { id: 'lagering', label: t('tab_lagering'), count: brewLogs.filter(l => l.status === 'lagering').length },
                          { id: 'bottled', label: t('tab_bottled'), count: brewLogs.filter(isBottledInPeriod).length },
                        ].filter(t => !t.hideIf).map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setRecipeTab(tab.id as any)}
                            className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${recipeTab === tab.id ? 'text-[var(--color-text)]' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'}`}
                          >
                            {tab.label} {tab.count && tab.count > 0 ? `(${tab.count})` : ''}
                            {recipeTab === tab.id && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-accent)] rounded-t-full"></div>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {['all', 'brewable'].includes(recipeTab) ? (
                      <>
                        {libraryView === 'personal' && recipeManager && (
                          <button
                            onClick={() => { setSelectedRecipe(null); setView('create'); }}
                            className="bg-white rounded-3xl border-2 border-dashed border-stone-200 p-6 hover:border-amber-500 hover:bg-amber-50/30 transition-all flex flex-col items-center justify-center gap-4 group h-full min-h-[300px]"
                          >
                            <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                              <i className="fas fa-plus text-2xl"></i>
                            </div>
                            <div className="text-center">
                              <p className="font-black text-stone-900 uppercase tracking-widest text-sm">{t('nav_new')}</p>
                              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">{t('create_recipe')}</p>
                            </div>
                          </button>
                        )}
                        {processedRecipes.map(({ recipe: r, stock }) => (
                          <div key={r.id} className="bg-[var(--color-bg)] rounded-[var(--radius)] border border-[var(--color-border)] p-6 hover:shadow-[var(--shadow)] transition-all group relative flex flex-col pt-8" >
                            <div className="absolute top-0 left-0 right-0 h-[5px]" style={{ backgroundColor: getSRMColor(r.specifications?.color?.value || 0) }}></div>
                            <div className="absolute top-4 right-4 flex gap-2">
                              <button onClick={() => handlePrintRecipe(r)} title={t('print_recipe')} className="text-stone-300 hover:text-stone-900 transition-colors"> <i className="fas fa-print text-lg"></i> </button>
                              <button onClick={() => handleExportRecipeBeerXml(r)} title={t('export_beerxml')} aria-label={t('export_beerxml')} className="text-stone-300 hover:text-amber-600 transition-colors"> <i className="fas fa-file-export text-lg" aria-hidden="true"></i> </button>
                            </div>
                            <h3 className="text-xl font-bold mb-1 pr-16 truncate group-hover:text-amber-800 transition-colors">{r.name}</h3>

                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              {libraryView === 'personal' && r.status === 'submitted' && (
                                <div className="flex items-center gap-1.5">
                                  <i className="fas fa-clock text-amber-500 text-[10px]" ></i>
                                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{t('pending_review')}</span>
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
                              <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">{t('batch_short')}</p><p className="font-bold text-xs">{formatBrewNumber(r.batch_size.value, 'vol', lang, preferences, r.batch_size.unit)} {preferences.units === 'imperial' ? 'Gal' : 'L'}</p></div>
                              <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">ABV</p><p className="font-bold text-xs">{formatBrewNumber(r.specifications?.abv?.value, 'abv', lang, preferences)}%</p></div>
                              <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">IBU</p><p className="font-bold text-xs">{r.specifications?.ibu?.value}</p></div>
                              <div className="bg-stone-50 rounded-xl p-2 text-center"><p className="text-[8px] font-black text-stone-400 uppercase">OG</p><p className="font-bold text-xs">{formatGravity(r.specifications?.og?.value, lang, preferences.gravityUnit === 'plato' ? 'plato' : 'sg')}</p></div>
                            </div>
                            <div className="flex flex-col gap-2 mt-auto">
                              <div className="flex gap-2">
                                {brewManager && <button onClick={() => startBrew(r)} className="flex-1 bg-amber-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">{t('brew_btn')}</button>}
                                {libraryView === 'personal' && <button onClick={() => { setSelectedRecipe(r); setView('create'); }} className="flex-1 bg-stone-100 text-stone-900 text-xs font-bold py-3 rounded-xl hover:bg-stone-200 transition-all">{canEditRecipe(r, editContext) ? t('edit_btn') : t('view_btn')}</button>}
                                {libraryView === 'personal' && recipeManager && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyRecipe(r)}
                                    aria-label={`${t('copy_recipe')}: ${r.name}`}
                                    title={t('copy_recipe')}
                                    className="flex-none bg-stone-100 text-stone-700 px-4 py-3 rounded-xl hover:bg-stone-200 transition-all"
                                  >
                                    <i className="fas fa-copy text-xs" aria-hidden="true"></i>
                                  </button>
                                )}
                              </div>

                              {libraryView === 'public' && (!user || recipeManager) && (
                                <button
                                  onClick={() => handleRecipeAddToPersonal(r)}
                                  className="w-full bg-stone-900 text-white text-[10px] font-black uppercase py-3 rounded-xl hover:bg-black transition-all tracking-widest"
                                >
                                  <i className="fas fa-plus-circle mr-2"></i> {t('add_to_collection')}
                                </button>
                              )}

                              {libraryView === 'public' && isAdmin && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleAdminUnpublishRecipe(r)}
                                    className="flex-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase py-2.5 rounded-xl hover:bg-amber-100 transition-all tracking-widest"
                                  >
                                    <i className="fas fa-eye-slash mr-2" aria-hidden="true"></i> {t('admin_unpublish' as any)}
                                  </button>
                                  <button
                                    onClick={() => handleAdminDeleteRecipe(r)}
                                    className="flex-none bg-red-50 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl hover:bg-red-100 transition-all"
                                    aria-label={t('admin_delete' as any)}
                                    title={t('admin_delete' as any)}
                                  >
                                    <i className="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                                  </button>
                                </div>
                              )}

                              {user && publisher && libraryView === 'personal' && r.status !== 'submitted' && (
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
                      </>
                    ) : (
                      <>
                        {processedLogs.map(log => {
                          const recipe = recipes.find(r => r.id === log.recipeId);
                          return (
                            <div key={log.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow)] transition-all flex flex-col relative pt-8 p-6 group">
                              <div className="absolute top-0 left-0 right-0 h-[5px]" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
                              <div className="flex justify-between items-start mb-4">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{log.brewDate || log.date}</p>
                                  <h3 className="text-xl font-bold text-[var(--color-text)] leading-tight">{recipe?.name || 'Onbekend recept'}</h3>
                                </div>
                                <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black uppercase tracking-wider">
                                  {t(`status_${log.status}` as any)}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 mb-6 flex-1">
                                <div className="bg-stone-50 rounded-xl p-2 text-center">
                                  <p className="text-[8px] font-black text-stone-400 uppercase">OG</p>
                                  <p className="font-bold text-xs">{log.measurements.actual_og?.toFixed(3) || '-'}</p>
                                </div>
                                <div className="bg-stone-50 rounded-xl p-2 text-center">
                                  <p className="text-[8px] font-black text-stone-400 uppercase">FG</p>
                                  <p className="font-bold text-xs">{log.measurements.actual_fg?.toFixed(3) || '-'}</p>
                                </div>
                              </div>
                              {brewManager && (<button
                                onClick={() => {
                                  setSelectedBrewLog(log);
                                  setSelectedRecipe(recipe || null);
                                  setView('log');
                                }}
                                className="w-full bg-[var(--color-text)] text-white text-xs font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg"
                              >
                                {log.status === 'bottled' ? t('view_btn') : t('update_btn')}
                              </button>)}
                            </div>
                          );
                        })}
                      </>
                    )}
                    {((['all', 'brewable'].includes(recipeTab) && processedRecipes.length === 0) || (!['all', 'brewable'].includes(recipeTab) && processedLogs.length === 0)) && (
                      <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-stone-200 px-6 shadow-sm">
                        <i className={`fas ${['all', 'brewable'].includes(recipeTab) ? 'fa-beer' : 'fa-history'} text-5xl text-amber-100 mb-6 block`}></i>
                        {['all', 'brewable'].includes(recipeTab) ? (
                          <>
                            <p className="text-stone-400 font-bold max-w-sm mx-auto mb-6"> {t('empty_recipes_hint').split('Library')[0]} <button onClick={() => setView('library')} className="text-amber-600 underline hover:text-amber-700"> {t('go_to_library')} </button> {t('empty_recipes_hint').split('Library')[1]} </p>
                            <div className="flex flex-col items-center gap-4"> <p className="text-xs font-black text-stone-300 uppercase tracking-widest">{t('demo_hint')}</p> <button onClick={handleImportDemoData} className="bg-amber-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl hover:bg-amber-700 transition-all flex items-center gap-2"> <i className="fas fa-download"></i> {t('import_demo')} </button> </div>
                          </>
                        ) : (
                          <p className="text-stone-400 font-bold max-w-sm mx-auto mb-6">{t('no_brews_with_status')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {view === 'brouwlogboek' && (
                <BrewLogView logs={brewLogs} recipes={recipes} tastingNotes={tastingNotes} canManageBrews={brewManager} canAddNotes={!!user} onToggleFinished={handleToggleFinished} onEditLog={(logId) => { const log = brewLogs.find(l => l.id === logId); const recipe = recipes.find(r => r.id === log?.recipeId); if (log && recipe) { setSelectedBrewLog(log); setSelectedRecipe(recipe); setView('log'); } }} onAddTasting={(logId) => openTasting(logId, 'brouwlogboek')} onViewNotes={(logId) => { setView('proefnotities'); setNotesBatch(logId); }} onPrintReport={handlePrintBrewReport} />
              )}
              {view === 'proefnotities' && (
                <TastingNotesView
                  key={notesBatch || 'all'}
                  logs={brewLogs}
                  recipes={recipes}
                  tastingNotes={tastingNotes}
                  members={tasters}
                  editContext={{ userId: user?.id, breweryId: profile?.brewery_id, breweryRole: profile?.brewery_role ?? null, isAdmin }}
                  initialBatch={notesBatch}
                  canAdd={!!user}
                  onAddTasting={(logId) => openTasting(logId, 'proefnotities')}
                  onEditNote={(noteId) => { const note = tastingNotes.find(n => n.id === noteId); if (note) openTasting(note.brewLogId, 'proefnotities', note); }}
                  onDeleteNote={handleDeleteTastingNote}
                />
              )}
              {passwordRecovery && user && (
                <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-6">
                  <div role="dialog" aria-modal="true" aria-labelledby="password-reset-title" className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-4">
                    <h3 id="password-reset-title" className="text-2xl font-black text-stone-900">{t('password_reset_title')}</h3>
                    <p className="text-sm text-stone-500">{t('password_reset_hint').replace('{email}', user.email || '')}</p>
                    <NewPasswordForm
                      idPrefix="recovery"
                      onSubmit={async password => {
                        await authService.updatePassword(password);
                        endPasswordRecovery();
                        alert(t('password_changed'));
                      }}
                      submitLabel={t('password_change_btn')}
                    />
                    <button type="button" onClick={endPasswordRecovery} className="w-full py-3 rounded-xl bg-stone-100 text-stone-700 text-xs font-black uppercase tracking-wider hover:bg-stone-200">
                      {t('cancel_btn')}
                    </button>
                  </div>
                </div>
              )}
              {brewPickRecipe && (
                <EquipmentPickerDialog
                  recipeName={brewPickRecipe.name}
                  installations={ownInstallations(deduplicatedLibrary)}
                  recipeEquipmentId={brewPickRecipe.equipmentId}
                  onPick={id => { const r = brewPickRecipe; setBrewPickRecipe(null); openNewBrew(r, id); }}
                  onCancel={() => setBrewPickRecipe(null)}
                />
              )}
              {view === 'log' && selectedRecipe && (
                <BrewLog recipe={selectedRecipe} initialLog={selectedBrewLog || undefined} onUpdate={handleUpdateBrewLog} onSaveAndExit={handleSaveAndExitBrewLog} initialEquipmentId={selectedBrewLog ? undefined : newBrewEquipmentId} library={deduplicatedLibrary} />
              )}
              {view === 'create' && (
                <RecipeCreator
                  key={selectedRecipe?.id || 'new'}
                  initialRecipe={selectedRecipe || undefined}
                  onCopy={recipeManager ? handleCopyRecipe : undefined}
                  onSave={handleSaveRecipe}
                  onSubmitToPublic={publisher ? handleRecipeSubmitToPublic : undefined}
                  onDelete={handleDeleteRecipe}
                  library={deduplicatedLibrary}
                />
              )}
              {librarySection && (
                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                    <div>
                      <h2 className="text-4xl font-black text-stone-900">{getPageTitle()}</h2>
                      {publicOnlySection && (
                        <p className="text-sm text-stone-500 mt-2">
                          {t('lib_own_under_installation')}{' '}
                          {user && <button type="button" onClick={() => setView('brouwinstallatie')} className="text-amber-600 underline hover:text-amber-700">{t('nav_installation')}</button>}
                        </p>
                      )}
                    </div>
                    {!publicOnlySection && <div className="flex bg-stone-100 p-1 rounded-2xl w-fit">
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
                    </div>}
                  </div>
                <IngredientLibrary
                  key={librarySection}
                  section={librarySection}
                  ingredients={library}
                  libraryView={publicOnlySection ? 'public' : libraryView}
                  onReplace={setLibrary}
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
                        const result = await trackWrite(() => supabaseService.saveLibraryIngredient(item, item.user_id || user.id, item.brewery_id || profile?.brewery_id));
                        if (reportFailure(result)) { await reloadFromServer(); break; }
                      }
                    }
                  }}
                />
                </div>
              )}
              {view === 'admin' && (
                <AdminView
                  onExport={handleExportData}
                  onRestore={handleRestoreData}
                  onUrlImport={handleImportDemoData}
                  importStatus={importStatus}
                  pendingSubmissions={pendingSubmissions}
                  publicKeys={publicKeys}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              )}
              {/* signIn resolves only after the profile has loaded; by then the start screen is already
                  shown and the user may have opened another screen, so only leave the login view */}
              {view === 'auth' && <Auth onSuccess={() => setView(v => v === 'auth' ? 'recipes' : v)} initialIsSignUp={authMode === 'signup'} />}
              {view === 'settings' && <Settings />}
              {view === 'team' && <BrewerySettings />}
              {view === 'tasting' && selectedRecipe && selectedBrewLog && (
                <TastingNotes
                  key={selectedNote?.id || selectedBrewLog.id}
                  recipe={selectedRecipe}
                  brewLog={selectedBrewLog}
                  batchNumber={batchNumbers(brewLogs).get(selectedBrewLog.id)}
                  myName={myTasterName}
                  initialNote={selectedNote || undefined}
                  onSave={handleSaveTastingNote}
                  onCancel={() => { setSelectedNote(null); setView(tastingReturnView); }}
                />
              )}
              {view === 'help' && <HelpView />}
              {view === 'voorraad' && (
                <VoorraadView
                  ingredients={library}
                  readOnly={!libraryManager}
                  onUpdate={async (item) => {
                    setLibrary(prev => prev.map(l => l.id === item.id ? item : l));
                    if (user?.id) {
                      const result = await trackWrite(() => supabaseService.saveLibraryIngredient(item, item.user_id || user.id, item.brewery_id || profile?.brewery_id));
                      if (reportFailure(result)) await reloadFromServer();
                    }
                  }}
                />
              )}
              {view === 'importeren' && (
                <ImportView
                  onFileImport={handleFileImport}
                  onExportBeerXml={handleExportLibraryBeerXml}
                  importStatus={importStatus}
                  xmlUrl={xmlUrl}
                  onXmlUrlChange={setXmlUrl}
                  onUrlImport={handleUrlImport}
                  canImport={libraryManager}
                />
              )}

              {view === 'brouwinstallatie' && (
                <BrewingInstallationView
                  library={library}
                  onUpdate={(newLib) => setLibrary(newLib)}
                />
              )}

              {/* Placeholders for new views */}
              {['team-placeholder'].includes(view) && (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                  <i className={`fas ${view === 'voorraad' ? 'fa-boxes-stacked' : 'fa-temperature-half'} text-6xl mb-6`}></i>
                  <h3 className="text-2xl font-black uppercase tracking-widest">{view}</h3>
                  <p className="font-bold">{t('module_in_development')}</p>
                </div>
              )}
            </Suspense>
            </main>

            {/* Mobile Bottom Nav */}
            <BottomNav
              currentView={view}
              libraryView={libraryView}
              onViewChange={(v: View) => { setNotesBatch(undefined); setView(v); }}
              onLibraryViewChange={setLibraryView}
              onAuth={handleAuthRedirect}
            />
          </div>
        </div>
      </div>
    </LanguageContext.Provider>
  );
};

export default App;

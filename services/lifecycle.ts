import type { Recipe } from '../types';
import { uniqueName } from './duplicates';

/**
 * Recipe lifecycle: idea → lab → (pilot) → production, with paused, rejected and retired.
 * Kept in the recipe itself (`lifecycle`), apart from publishing (`status`: private, submitted,
 * approved). A recipe without lifecycle is an idea.
 */
export type RecipeStage = 'idea' | 'lab' | 'pilot' | 'production' | 'paused' | 'rejected' | 'retired';

export const RECIPE_STAGES: RecipeStage[] = ['idea', 'lab', 'pilot', 'production', 'paused', 'rejected', 'retired'];

export interface StageChange {
  stage: RecipeStage;
  /** ISO date and time */
  at: string;
  /** User id */
  by?: string;
  note?: string;
}

export interface RecipeLifecycle {
  stage: RecipeStage;
  history: StageChange[];
}

/** Where a recipe may go from each stage. */
export const TRANSITIONS: Record<RecipeStage, RecipeStage[]> = {
  idea: ['lab', 'rejected'],
  lab: ['pilot', 'production', 'rejected'],
  pilot: ['production', 'lab', 'rejected'],
  production: ['paused', 'retired'],
  paused: ['production', 'retired'],
  rejected: ['idea'],
  retired: ['production'],
};

/** Stages that need a note: why it was rejected or retired. */
export const NOTE_REQUIRED: RecipeStage[] = ['rejected', 'retired'];

/** Stages from which a brew can be started without a question. */
export const BREWABLE: RecipeStage[] = ['lab', 'pilot', 'production'];

/** Stages hidden from the recipe list unless asked for. */
export const ARCHIVED: RecipeStage[] = ['rejected', 'retired'];

export const stageOf = (r: Pick<Recipe, 'lifecycle'>): RecipeStage => r.lifecycle?.stage ?? 'idea';

export const canMove = (from: RecipeStage, to: RecipeStage) => TRANSITIONS[from].includes(to);

/** The recipe in a new stage, with the change added to its history. */
export const moveToStage = (recipe: Recipe, to: RecipeStage, change: { by?: string; note?: string; at?: Date } = {}): Recipe => {
  const from = stageOf(recipe);
  if (!canMove(from, to)) throw new Error(`Cannot move a recipe from ${from} to ${to}`);
  const note = change.note?.trim();
  if (NOTE_REQUIRED.includes(to) && !note) throw new Error(`A note is required for ${to}`);
  const entry: StageChange = { stage: to, at: (change.at ?? new Date()).toISOString(), ...(change.by ? { by: change.by } : {}), ...(note ? { note } : {}) };
  return { ...recipe, lifecycle: { stage: to, history: [...(recipe.lifecycle?.history ?? []), entry] } };
};

/**
 * What starting a brew asks first: nothing (lab, pilot, production), to move the recipe
 * (an idea goes to lab, a paused recipe back to production), or it is not possible.
 */
export const brewStart = (recipe: Pick<Recipe, 'lifecycle' | 'status'>): { kind: 'ok' } | { kind: 'move'; to: RecipeStage } | { kind: 'blocked' } => {
  if (recipe.status === 'approved') return { kind: 'ok' }; // public recipes have no lifecycle
  const stage = stageOf(recipe);
  if (BREWABLE.includes(stage)) return { kind: 'ok' };
  if (stage === 'idea') return { kind: 'move', to: 'lab' };
  if (stage === 'paused') return { kind: 'move', to: 'production' };
  return { kind: 'blocked' };
};

/** Stages whose recipe is not changed in place: a change becomes a new version (in lab). */
export const VERSIONED: RecipeStage[] = ['production', 'paused'];

export const needsNewVersion = (stored: Pick<Recipe, 'lifecycle' | 'status'> | null | undefined) =>
  !!stored && stored.status !== 'approved' && VERSIONED.includes(stageOf(stored));

export const versionOf = (r: Pick<Recipe, 'version'>) => r.version ?? 1;

/** The name without a version suffix (" v2"). */
export const baseName = (name: string) => name.replace(/\s+v\d+$/i, '').trim();

/**
 * A new version of a production recipe: the edited recipe with a new id, the next version
 * number, the name with " vN", in lab. The stored recipe stays as it is.
 */
export const newVersion = (
  edited: Recipe,
  stored: Recipe,
  family: Pick<Recipe, 'version' | 'version_of' | 'id'>[],
  opts: { takenNames: string[]; by?: string; at?: Date },
): Recipe => {
  const root = stored.version_of ?? stored.id;
  const next = Math.max(versionOf(stored), ...family.filter(r => (r.version_of ?? r.id) === root).map(versionOf)) + 1;
  const at = (opts.at ?? new Date()).toISOString();
  return {
    ...structuredClone(edited),
    id: crypto.randomUUID(),
    name: uniqueName(`${baseName(edited.name)} v${next}`, opts.takenNames),
    status: 'private',
    version: next,
    version_of: root,
    lifecycle: { stage: 'lab', history: [{ stage: 'lab', at, ...(opts.by ? { by: opts.by } : {}), note: `v${versionOf(stored)} → v${next}` }] },
  };
};

/** Other versions of the same recipe that are in production (to retire when this one goes there). */
export const otherProductionVersions = (recipe: Recipe, recipes: Recipe[]): Recipe[] => {
  const root = recipe.version_of ?? recipe.id;
  return recipes.filter(r => r.id !== recipe.id && (r.version_of ?? r.id) === root && r.status !== 'approved' && stageOf(r) === 'production');
};

/** A copy (or a recipe taken from the public library) starts again as an idea, without versions. */
export const freshLifecycle = (recipe: Recipe): Recipe => {
  const { lifecycle: _l, version: _v, version_of: _o, ...rest } = recipe;
  return rest;
};

const CONTENT_KEYS = ['name', 'type', 'notes', 'batch_size', 'boil_time', 'efficiency', 'style', 'ingredients', 'mash', 'equipmentId', 'water', 'water_chem', 'target'] as const;

/** Leaves out what carries no content: undefined, null, empty strings, arrays and objects. */
const compact = (v: unknown): unknown => {
  if (Array.isArray(v)) { const a = v.map(compact).filter(x => x !== undefined); return a.length ? a : undefined; }
  if (v && typeof v === 'object') {
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)]).filter(([, x]) => x !== undefined).sort(([a], [b]) => String(a).localeCompare(String(b))));
    return Object.keys(o).length ? o : undefined;
  }
  return v === null || v === '' ? undefined : v;
};

/** Whether the recipe itself changed (not its stage, publication or calculated values). */
export const contentChanged = (a: Recipe, b: Recipe): boolean =>
  CONTENT_KEYS.some(k => JSON.stringify(compact(a[k])) !== JSON.stringify(compact(b[k])));

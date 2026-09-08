import { type Goal, type GoalCollection, INITIAL_GOALS } from '@/features/goals/model/goal';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const GOALS_STORAGE_KEY = 'daily-dama:goals';
export const GOALS_SCHEMA_VERSION = 1;

interface GoalDocumentV1 {
  readonly version: typeof GOALS_SCHEMA_VERSION;
  readonly goals: readonly Goal[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNormalizedText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isGoal(value: unknown): value is Goal {
  if (!isRecord(value)) return false;

  const { id, trickId, trickName, kind, targetCount, targetMs, createdAt, updatedAt } = value;
  if (!isNormalizedText(id) || !isNormalizedText(trickId) || !isNormalizedText(trickName)) return false;
  if (!isFiniteNonNegative(createdAt) || !isFiniteNonNegative(updatedAt)) return false;
  if (updatedAt < createdAt) return false;

  if (kind === 'count') {
    if (targetMs !== undefined) return false;
    return isPositiveInteger(targetCount);
  }
  if (kind === 'time') {
    if (targetCount !== undefined) return false;
    return isPositiveInteger(targetMs);
  }
  return false;
}

// T157.7: validates an in-memory (already-parsed) value as a
// `GoalCollection`, unlike `deserializeGoals` which only operates on a JSON
// *string*. Used as the `SyncEnvelopeCodec<GoalSyncSnapshot>.isState`
// predicate's `collection` field check, mirroring
// `isCustomTrickCollection` exactly.
export function isGoalCollection(value: unknown): value is GoalCollection {
  if (!isRecord(value) || !Array.isArray(value.goals) || !value.goals.every(isGoal)) {
    return false;
  }
  const ids = value.goals.map((goal) => goal.id);
  return new Set(ids).size === ids.length;
}

export function serializeGoals(collection: GoalCollection) {
  const document: GoalDocumentV1 = {
    version: GOALS_SCHEMA_VERSION,
    goals: collection.goals,
  };
  return JSON.stringify(document);
}

export function deserializeGoals(serialized: string): GoalCollection | undefined {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (
    !isRecord(document) ||
    document.version !== GOALS_SCHEMA_VERSION ||
    !Array.isArray(document.goals) ||
    !document.goals.every(isGoal)
  ) {
    return undefined;
  }

  const ids = document.goals.map((goal) => goal.id);
  if (new Set(ids).size !== ids.length) return undefined;
  return { goals: document.goals };
}

export async function loadGoals(storage: KeyValueStorage): Promise<PersistenceLoadResult<GoalCollection>> {
  try {
    const serialized = await storage.getItem(GOALS_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: INITIAL_GOALS };

    const collection = deserializeGoals(serialized);
    if (collection) return { status: 'loaded', value: collection };

    return {
      status: 'recovered',
      value: INITIAL_GOALS,
      error: new Error('The persisted goals are malformed or use an unsupported version.'),
    };
  } catch (error) {
    return { status: 'recovered', value: INITIAL_GOALS, error };
  }
}

export async function saveGoals(
  storage: KeyValueStorage,
  collection: GoalCollection,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(GOALS_STORAGE_KEY, serializeGoals(collection));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

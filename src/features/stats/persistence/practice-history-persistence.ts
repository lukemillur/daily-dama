import {
  INITIAL_PRACTICE_HISTORY,
  type PracticeHistory,
  type PracticeSessionRecord,
} from '@/features/stats/model/practice-history';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const PRACTICE_HISTORY_STORAGE_KEY = 'daily-dama:practice-history';
export const PRACTICE_HISTORY_SCHEMA_VERSION = 1;

interface PracticeHistoryDocumentV1 {
  readonly version: typeof PRACTICE_HISTORY_SCHEMA_VERSION;
  readonly sessions: readonly PracticeSessionRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isSessionRecord(value: unknown): value is PracticeSessionRecord {
  if (!isRecord(value)) return false;

  const { id, trickId, trickName, startedAt, completedAt, durationMs, laceCount, plannedDurationMs, origin } =
    value;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof trickId === 'string' &&
    trickId.length > 0 &&
    typeof trickName === 'string' &&
    trickName.length > 0 &&
    isFiniteNonNegativeNumber(startedAt) &&
    isFiniteNonNegativeNumber(completedAt) &&
    completedAt >= startedAt &&
    isFiniteNonNegativeNumber(durationMs) &&
    // durationMs is active practice time, which can be less than wall-clock
    // elapsed time when a session was paused; it can never exceed it.
    durationMs <= completedAt - startedAt &&
    Number.isInteger(laceCount) &&
    Number(laceCount) >= 0 &&
    (plannedDurationMs === undefined ||
      (typeof plannedDurationMs === 'number' && Number.isFinite(plannedDurationMs) && plannedDurationMs > 0)) &&
    (origin === undefined || origin === 'assessment')
  );
}

export function serializePracticeHistory(history: PracticeHistory) {
  const document: PracticeHistoryDocumentV1 = {
    version: PRACTICE_HISTORY_SCHEMA_VERSION,
    sessions: history.sessions,
  };
  return JSON.stringify(document);
}

export function deserializePracticeHistory(serialized: string): PracticeHistory | undefined {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (
    !isRecord(document) ||
    document.version !== PRACTICE_HISTORY_SCHEMA_VERSION ||
    !Array.isArray(document.sessions) ||
    !document.sessions.every(isSessionRecord)
  ) {
    return undefined;
  }

  const ids = document.sessions.map((session) => session.id);
  if (new Set(ids).size !== ids.length) return undefined;

  return { sessions: document.sessions };
}

export async function loadPracticeHistory(
  storage: KeyValueStorage,
): Promise<PersistenceLoadResult<PracticeHistory>> {
  try {
    const serialized = await storage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: INITIAL_PRACTICE_HISTORY };

    const history = deserializePracticeHistory(serialized);
    if (history) return { status: 'loaded', value: history };

    return {
      status: 'recovered',
      value: INITIAL_PRACTICE_HISTORY,
      error: new Error('The persisted practice history is malformed or uses an unsupported version.'),
    };
  } catch (error) {
    return { status: 'recovered', value: INITIAL_PRACTICE_HISTORY, error };
  }
}

export async function savePracticeHistory(
  storage: KeyValueStorage,
  history: PracticeHistory,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(PRACTICE_HISTORY_STORAGE_KEY, serializePracticeHistory(history));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

import { describe, expect, it, jest } from '@jest/globals';

import { INITIAL_SESH_STATE, OPEN_ENDED_SESH_PLAN, seshReducer } from '@/features/sesh/model/sesh';
import { createPracticeSessionRecord, type PracticeHistory } from '@/features/stats/model/practice-history';
import {
  deserializePracticeHistory,
  loadPracticeHistory,
  PRACTICE_HISTORY_SCHEMA_VERSION,
  PRACTICE_HISTORY_STORAGE_KEY,
  savePracticeHistory,
  serializePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import type { KeyValueStorage } from '@/shared/persistence/storage';

const HISTORY: PracticeHistory = {
  sessions: [
    {
      id: 'session-1',
      trickId: 'big-cup',
      trickName: 'Big cup',
      startedAt: 1_000,
      completedAt: 61_000,
      durationMs: 60_000,
      laceCount: 8,
    },
  ],
};

function createStorage(serialized: string | null = null): KeyValueStorage {
  return {
    getItem: jest.fn(async () => serialized),
    setItem: jest.fn(async () => undefined),
  };
}

describe('practice history persistence', () => {
  it('serializes and restores a versioned history document', () => {
    const serialized = serializePracticeHistory(HISTORY);

    expect(JSON.parse(serialized)).toEqual({
      version: PRACTICE_HISTORY_SCHEMA_VERSION,
      sessions: HISTORY.sessions,
    });
    expect(deserializePracticeHistory(serialized)).toEqual(HISTORY);
  });

  it('loads valid completed sessions', async () => {
    await expect(loadPracticeHistory(createStorage(serializePracticeHistory(HISTORY)))).resolves.toEqual({
      status: 'loaded',
      value: HISTORY,
    });
  });

  it('restores a completed sesh record that includes paused time', () => {
    const AIRPLANE: PracticeTrick = { id: 'airplane', name: 'Airplane' };
    const t0 = 1_000;

    let state = seshReducer(INITIAL_SESH_STATE, {
      type: 'trickSelected',
      trick: AIRPLANE,
      plan: OPEN_ENDED_SESH_PLAN,
    });
    state = seshReducer(state, { type: 'countdownCompleted', now: t0 });
    state = seshReducer(state, { type: 'seshPaused', now: t0 + 10_000 });
    state = seshReducer(state, { type: 'seshResumed', now: t0 + 40_000 });
    state = seshReducer(state, { type: 'seshEnded', now: t0 + 70_000 });

    if (state.status !== 'completed') throw new Error('expected sesh to complete');
    const summary = state.summary;

    // Active practice time (40s) is strictly less than wall-clock elapsed time (70s) because
    // of the 30s pause — this is the paused-record case the validator must accept.
    expect(summary.durationMs).toBe(40_000);
    expect(summary.endedAt - summary.startedAt).toBe(70_000);

    const record = createPracticeSessionRecord(summary, undefined);
    const history: PracticeHistory = { sessions: [record] };
    const serialized = serializePracticeHistory(history);

    expect(deserializePracticeHistory(serialized)).toEqual(history);
  });

  // The existing "loads valid completed sessions" test above already covers the non-paused
  // boundary: HISTORY's session has durationMs === completedAt - startedAt exactly, and it
  // must keep restoring successfully under the new `<=` check.

  it('accepts pre-existing records that predate plannedDurationMs (backward compatibility)', () => {
    const serialized = JSON.stringify({
      version: PRACTICE_HISTORY_SCHEMA_VERSION,
      sessions: HISTORY.sessions,
    });

    expect(deserializePracticeHistory(serialized)).toEqual(HISTORY);
  });

  it('accepts records with a valid plannedDurationMs and rejects an invalid one', () => {
    const withPlannedDuration = {
      version: PRACTICE_HISTORY_SCHEMA_VERSION,
      sessions: [{ ...HISTORY.sessions[0], plannedDurationMs: 300_000 }],
    };
    expect(deserializePracticeHistory(JSON.stringify(withPlannedDuration))).toEqual({
      sessions: withPlannedDuration.sessions,
    });

    const withInvalidPlannedDuration = {
      version: PRACTICE_HISTORY_SCHEMA_VERSION,
      sessions: [{ ...HISTORY.sessions[0], plannedDurationMs: 0 }],
    };
    expect(deserializePracticeHistory(JSON.stringify(withInvalidPlannedDuration))).toBeUndefined();
  });

  it('uses empty history when storage has no document', async () => {
    await expect(loadPracticeHistory(createStorage())).resolves.toEqual({
      status: 'empty',
      value: { sessions: [] },
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: PRACTICE_HISTORY_SCHEMA_VERSION + 1, sessions: HISTORY.sessions }),
    JSON.stringify({ version: PRACTICE_HISTORY_SCHEMA_VERSION, sessions: [{ id: 'partial' }] }),
    JSON.stringify({
      version: PRACTICE_HISTORY_SCHEMA_VERSION,
      sessions: [{ ...HISTORY.sessions[0], durationMs: -1 }],
    }),
    // Active duration exceeding the total wall-clock span is never valid, paused or not.
    JSON.stringify({
      version: PRACTICE_HISTORY_SCHEMA_VERSION,
      sessions: [{ ...HISTORY.sessions[0], durationMs: HISTORY.sessions[0].durationMs + 1 }],
    }),
  ])('recovers to empty history from malformed records', async (serialized) => {
    const result = await loadPracticeHistory(createStorage(serialized));

    expect(result.status).toBe('recovered');
    expect(result.value).toEqual({ sessions: [] });
  });

  it('recovers from read errors and reports write errors', async () => {
    const readError = new Error('read failed');
    const writeError = new Error('write failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => Promise.reject(readError)),
      setItem: jest.fn(async () => Promise.reject(writeError)),
    };

    await expect(loadPracticeHistory(storage)).resolves.toEqual({
      status: 'recovered',
      value: { sessions: [] },
      error: readError,
    });
    await expect(savePracticeHistory(storage, HISTORY)).resolves.toEqual({
      status: 'failed',
      error: writeError,
    });
  });

  it('writes the document to the stable history key', async () => {
    const storage = createStorage();

    await expect(savePracticeHistory(storage, HISTORY)).resolves.toEqual({ status: 'saved' });
    expect(storage.setItem).toHaveBeenCalledWith(
      PRACTICE_HISTORY_STORAGE_KEY,
      serializePracticeHistory(HISTORY),
    );
  });
});

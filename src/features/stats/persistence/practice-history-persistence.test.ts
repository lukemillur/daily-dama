import { describe, expect, it, jest } from '@jest/globals';

import type { PracticeHistory } from '@/features/stats/model/practice-history';
import {
  deserializePracticeHistory,
  loadPracticeHistory,
  PRACTICE_HISTORY_SCHEMA_VERSION,
  PRACTICE_HISTORY_STORAGE_KEY,
  savePracticeHistory,
  serializePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
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

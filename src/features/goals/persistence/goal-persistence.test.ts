import { describe, expect, it, jest } from '@jest/globals';

import type { GoalCollection } from '@/features/goals/model/goal';
import {
  deserializeGoals,
  GOALS_SCHEMA_VERSION,
  GOALS_STORAGE_KEY,
  loadGoals,
  saveGoals,
  serializeGoals,
} from '@/features/goals/persistence/goal-persistence';
import type { KeyValueStorage } from '@/shared/persistence/storage';

const COLLECTION: GoalCollection = {
  goals: [
    {
      id: 'goal-count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      kind: 'count',
      targetCount: 50,
      createdAt: 1_000,
    },
    {
      id: 'goal-time',
      trickId: 'stilt-flip',
      trickName: 'Stilt flip',
      kind: 'time',
      targetMs: 5_400_000,
      createdAt: 2_000,
    },
  ],
};

function createStorage(serialized: string | null = null): KeyValueStorage {
  return {
    getItem: jest.fn(async () => serialized),
    setItem: jest.fn(async () => undefined),
  };
}

describe('goal persistence', () => {
  it('round-trips a versioned goal collection, including both goal kinds', () => {
    const serialized = serializeGoals(COLLECTION);

    expect(JSON.parse(serialized)).toEqual({
      version: GOALS_SCHEMA_VERSION,
      goals: COLLECTION.goals,
    });
    expect(deserializeGoals(serialized)).toEqual(COLLECTION);
  });

  it('loads persisted goals', async () => {
    await expect(loadGoals(createStorage(serializeGoals(COLLECTION)))).resolves.toEqual({
      status: 'loaded',
      value: COLLECTION,
    });
  });

  it('uses an empty collection when storage is absent', async () => {
    await expect(loadGoals(createStorage())).resolves.toEqual({
      status: 'empty',
      value: { goals: [] },
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: GOALS_SCHEMA_VERSION + 1, goals: COLLECTION.goals }),
    JSON.stringify({ version: GOALS_SCHEMA_VERSION, goals: [{ id: 'partial' }] }),
    JSON.stringify({
      version: GOALS_SCHEMA_VERSION,
      goals: [
        {
          id: 'goal-1',
          trickId: 'big-cup',
          trickName: 'Big cup',
          kind: 'count',
          targetCount: 0,
          createdAt: 1,
        },
      ],
    }),
    JSON.stringify({
      version: GOALS_SCHEMA_VERSION,
      goals: [
        {
          id: 'goal-1',
          trickId: 'big-cup',
          trickName: 'Big cup',
          kind: 'count',
          targetCount: 3.5,
          createdAt: 1,
        },
      ],
    }),
    JSON.stringify({
      version: GOALS_SCHEMA_VERSION,
      goals: [
        {
          id: 'goal-1',
          trickId: 'big-cup',
          trickName: 'Big cup',
          kind: 'count',
          targetCount: 10,
          targetMs: 1000,
          createdAt: 1,
        },
      ],
    }),
    JSON.stringify({
      version: GOALS_SCHEMA_VERSION,
      goals: [
        {
          id: 'goal-1',
          trickId: 'big-cup',
          trickName: 'Big cup',
          kind: 'count',
          createdAt: 1,
        },
      ],
    }),
    JSON.stringify({
      version: GOALS_SCHEMA_VERSION,
      goals: [
        { id: 'duplicate', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 1, createdAt: 1 },
        { id: 'duplicate', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 2, createdAt: 2 },
      ],
    }),
  ])('recovers safely from malformed, partial, or unsupported data', async (serialized) => {
    const result = await loadGoals(createStorage(serialized));

    expect(result.status).toBe('recovered');
    expect(result.value).toEqual({ goals: [] });
  });

  it('recovers from storage read failures', async () => {
    const error = new Error('read failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => Promise.reject(error)),
      setItem: jest.fn(async () => undefined),
    };

    await expect(loadGoals(storage)).resolves.toEqual({
      status: 'recovered',
      value: { goals: [] },
      error,
    });
  });

  it('reports storage write failures without throwing', async () => {
    const error = new Error('write failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => Promise.reject(error)),
    };

    await expect(saveGoals(storage, COLLECTION)).resolves.toEqual({
      status: 'failed',
      error,
    });
  });

  it('writes the versioned collection under its stable storage key', async () => {
    const storage = createStorage();

    await expect(saveGoals(storage, COLLECTION)).resolves.toEqual({ status: 'saved' });
    expect(storage.setItem).toHaveBeenCalledWith(GOALS_STORAGE_KEY, serializeGoals(COLLECTION));
  });
});

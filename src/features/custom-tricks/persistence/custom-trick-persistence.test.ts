import { describe, expect, it, jest } from '@jest/globals';

import type { CustomTrickCollection } from '@/features/custom-tricks/model/custom-trick';
import {
  CUSTOM_TRICKS_SCHEMA_VERSION,
  CUSTOM_TRICKS_STORAGE_KEY,
  deserializeCustomTricks,
  isCustomTrickCollection,
  loadCustomTricks,
  saveCustomTricks,
  serializeCustomTricks,
} from '@/features/custom-tricks/persistence/custom-trick-persistence';
import type { KeyValueStorage } from '@/shared/persistence/storage';

const COLLECTION: CustomTrickCollection = {
  tricks: [
    { id: 'custom-standalone', kind: 'standalone', name: 'Stilt flip', kenteiRank: 8, updatedAt: 1 },
    {
      id: 'custom-sequence',
      kind: 'sequence',
      name: 'Morning line',
      steps: [
        { kind: 'existingTrick', sourceTrickId: 'big-cup', name: 'Big cup' },
        { kind: 'customText', name: 'Airplane variation' },
      ],
      updatedAt: 1,
    },
  ],
};

function createStorage(serialized: string | null = null): KeyValueStorage {
  return {
    getItem: jest.fn(async () => serialized),
    setItem: jest.fn(async () => undefined),
  };
}

describe('custom trick persistence', () => {
  it('round-trips a versioned standalone and sequence collection', () => {
    const serialized = serializeCustomTricks(COLLECTION);

    expect(JSON.parse(serialized)).toEqual({
      version: CUSTOM_TRICKS_SCHEMA_VERSION,
      tricks: COLLECTION.tricks,
    });
    expect(deserializeCustomTricks(serialized)).toEqual(COLLECTION);
  });

  it('loads persisted custom tricks', async () => {
    await expect(loadCustomTricks(createStorage(serializeCustomTricks(COLLECTION)))).resolves.toEqual({
      status: 'loaded',
      value: COLLECTION,
    });
  });

  it('uses an empty collection when storage is absent', async () => {
    await expect(loadCustomTricks(createStorage())).resolves.toEqual({
      status: 'empty',
      value: { tricks: [] },
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: CUSTOM_TRICKS_SCHEMA_VERSION + 1, tricks: COLLECTION.tricks }),
    JSON.stringify({ version: CUSTOM_TRICKS_SCHEMA_VERSION, tricks: [{ id: 'partial' }] }),
    JSON.stringify({
      version: CUSTOM_TRICKS_SCHEMA_VERSION,
      tricks: [{ id: 'custom-1', kind: 'sequence', name: 'Line', steps: ['Only one'] }],
    }),
    JSON.stringify({
      version: CUSTOM_TRICKS_SCHEMA_VERSION,
      tricks: [{ id: 'custom-1', kind: 'sequence', name: 'Line', steps: ['First', 'Second'] }],
    }),
    JSON.stringify({
      version: CUSTOM_TRICKS_SCHEMA_VERSION,
      tricks: [{ id: 'custom-1', kind: 'standalone', name: '   ' }],
    }),
    JSON.stringify({
      version: CUSTOM_TRICKS_SCHEMA_VERSION,
      tricks: [
        { id: 'duplicate', kind: 'standalone', name: 'First' },
        { id: 'duplicate', kind: 'standalone', name: 'Second' },
      ],
    }),
  ])('recovers safely from malformed, partial, or unsupported data', async (serialized) => {
    const result = await loadCustomTricks(createStorage(serialized));

    expect(result.status).toBe('recovered');
    expect(result.value).toEqual({ tricks: [] });
  });

  it('recovers from storage read failures', async () => {
    const error = new Error('read failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => Promise.reject(error)),
      setItem: jest.fn(async () => undefined),
    };

    await expect(loadCustomTricks(storage)).resolves.toEqual({
      status: 'recovered',
      value: { tricks: [] },
      error,
    });
  });

  it('reports storage write failures without throwing', async () => {
    const error = new Error('write failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => Promise.reject(error)),
    };

    await expect(saveCustomTricks(storage, COLLECTION)).resolves.toEqual({
      status: 'failed',
      error,
    });
  });

  it('writes the versioned collection under its stable storage key', async () => {
    const storage = createStorage();

    await expect(saveCustomTricks(storage, COLLECTION)).resolves.toEqual({ status: 'saved' });
    expect(storage.setItem).toHaveBeenCalledWith(
      CUSTOM_TRICKS_STORAGE_KEY,
      serializeCustomTricks(COLLECTION),
    );
  });
});

describe('isCustomTrickCollection', () => {
  it('accepts a well-formed in-memory collection', () => {
    expect(isCustomTrickCollection(COLLECTION)).toBe(true);
  });

  it('accepts an empty collection', () => {
    expect(isCustomTrickCollection({ tricks: [] })).toBe(true);
  });

  it('rejects a non-object value', () => {
    expect(isCustomTrickCollection(null)).toBe(false);
    expect(isCustomTrickCollection('not a collection')).toBe(false);
    expect(isCustomTrickCollection([])).toBe(false);
  });

  it('rejects a collection whose tricks are not an array', () => {
    expect(isCustomTrickCollection({ tricks: 'nope' })).toBe(false);
  });

  it('rejects a collection containing a malformed trick', () => {
    expect(isCustomTrickCollection({ tricks: [{ id: 'x' }] })).toBe(false);
  });

  it('rejects a collection with duplicate trick ids', () => {
    const duplicated: CustomTrickCollection = {
      tricks: [COLLECTION.tricks[0], { ...COLLECTION.tricks[0] }],
    };
    expect(isCustomTrickCollection(duplicated)).toBe(false);
  });
});

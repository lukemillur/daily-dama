import { describe, expect, it, jest } from '@jest/globals';

import type { NoteCollection } from '@/features/notes/model/note';
import {
  deserializeNotes,
  loadNotes,
  NOTES_SCHEMA_VERSION,
  NOTES_STORAGE_KEY,
  saveNotes,
  serializeNotes,
} from '@/features/notes/persistence/note-persistence';
import type { KeyValueStorage } from '@/shared/persistence/storage';

const COLLECTION: NoteCollection = {
  notes: [
    {
      id: 'note-trick-only',
      trickId: 'custom-source',
      trickName: 'Stilt flip',
      body: 'Landed it clean.',
      createdAt: 1_000,
      updatedAt: 1_000,
    },
    {
      id: 'note-sesh-linked',
      trickId: 'big-cup',
      trickName: 'Big cup',
      body: 'Struggled today.',
      practiceSessionId: 'session-42',
      createdAt: 2_000,
      updatedAt: 2_500,
    },
  ],
};

function createStorage(serialized: string | null = null): KeyValueStorage {
  return {
    getItem: jest.fn(async () => serialized),
    setItem: jest.fn(async () => undefined),
  };
}

describe('note persistence', () => {
  it('round-trips a versioned note collection, including sesh-linked notes', () => {
    const serialized = serializeNotes(COLLECTION);

    expect(JSON.parse(serialized)).toEqual({
      version: NOTES_SCHEMA_VERSION,
      notes: COLLECTION.notes,
    });
    expect(deserializeNotes(serialized)).toEqual(COLLECTION);
  });

  it('loads persisted notes', async () => {
    await expect(loadNotes(createStorage(serializeNotes(COLLECTION)))).resolves.toEqual({
      status: 'loaded',
      value: COLLECTION,
    });
  });

  it('uses an empty collection when storage is absent', async () => {
    await expect(loadNotes(createStorage())).resolves.toEqual({
      status: 'empty',
      value: { notes: [] },
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: NOTES_SCHEMA_VERSION + 1, notes: COLLECTION.notes }),
    JSON.stringify({ version: NOTES_SCHEMA_VERSION, notes: [{ id: 'partial' }] }),
    JSON.stringify({
      version: NOTES_SCHEMA_VERSION,
      notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: '   ', createdAt: 1, updatedAt: 1 }],
    }),
    JSON.stringify({
      version: NOTES_SCHEMA_VERSION,
      notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Body', createdAt: 5, updatedAt: 1 }],
    }),
    JSON.stringify({
      version: NOTES_SCHEMA_VERSION,
      notes: [
        { id: 'duplicate', trickId: 'big-cup', trickName: 'Big cup', body: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'duplicate', trickId: 'big-cup', trickName: 'Big cup', body: 'B', createdAt: 2, updatedAt: 2 },
      ],
    }),
  ])('recovers safely from malformed, partial, or unsupported data', async (serialized) => {
    const result = await loadNotes(createStorage(serialized));

    expect(result.status).toBe('recovered');
    expect(result.value).toEqual({ notes: [] });
  });

  it('recovers from storage read failures', async () => {
    const error = new Error('read failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => Promise.reject(error)),
      setItem: jest.fn(async () => undefined),
    };

    await expect(loadNotes(storage)).resolves.toEqual({
      status: 'recovered',
      value: { notes: [] },
      error,
    });
  });

  it('reports storage write failures without throwing', async () => {
    const error = new Error('write failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => Promise.reject(error)),
    };

    await expect(saveNotes(storage, COLLECTION)).resolves.toEqual({
      status: 'failed',
      error,
    });
  });

  it('writes the versioned collection under its stable storage key', async () => {
    const storage = createStorage();

    await expect(saveNotes(storage, COLLECTION)).resolves.toEqual({ status: 'saved' });
    expect(storage.setItem).toHaveBeenCalledWith(NOTES_STORAGE_KEY, serializeNotes(COLLECTION));
  });
});

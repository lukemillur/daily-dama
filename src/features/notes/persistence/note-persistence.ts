import { INITIAL_NOTES, type Note, type NoteCollection } from '@/features/notes/model/note';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const NOTES_STORAGE_KEY = 'daily-dama:notes';
export const NOTES_SCHEMA_VERSION = 1;

interface NoteDocumentV1 {
  readonly version: typeof NOTES_SCHEMA_VERSION;
  readonly notes: readonly Note[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNormalizedText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNote(value: unknown): value is Note {
  if (!isRecord(value)) return false;

  const { id, trickId, trickName, body, practiceSessionId, createdAt, updatedAt } = value;
  if (!isNormalizedText(id) || !isNormalizedText(trickId) || !isNormalizedText(trickName)) {
    return false;
  }
  if (!isNormalizedText(body)) return false;
  if (practiceSessionId !== undefined && !isNormalizedText(practiceSessionId)) return false;
  if (!isFiniteNonNegative(createdAt) || !isFiniteNonNegative(updatedAt)) return false;
  return updatedAt >= createdAt;
}

export function serializeNotes(collection: NoteCollection) {
  const document: NoteDocumentV1 = {
    version: NOTES_SCHEMA_VERSION,
    notes: collection.notes,
  };
  return JSON.stringify(document);
}

export function deserializeNotes(serialized: string): NoteCollection | undefined {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (
    !isRecord(document) ||
    document.version !== NOTES_SCHEMA_VERSION ||
    !Array.isArray(document.notes) ||
    !document.notes.every(isNote)
  ) {
    return undefined;
  }

  const ids = document.notes.map((note) => note.id);
  if (new Set(ids).size !== ids.length) return undefined;
  return { notes: document.notes };
}

export async function loadNotes(storage: KeyValueStorage): Promise<PersistenceLoadResult<NoteCollection>> {
  try {
    const serialized = await storage.getItem(NOTES_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: INITIAL_NOTES };

    const collection = deserializeNotes(serialized);
    if (collection) return { status: 'loaded', value: collection };

    return {
      status: 'recovered',
      value: INITIAL_NOTES,
      error: new Error('The persisted notes are malformed or use an unsupported version.'),
    };
  } catch (error) {
    return { status: 'recovered', value: INITIAL_NOTES, error };
  }
}

export async function saveNotes(
  storage: KeyValueStorage,
  collection: NoteCollection,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(NOTES_STORAGE_KEY, serializeNotes(collection));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

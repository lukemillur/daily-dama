import {
  INITIAL_CUSTOM_TRICKS,
  type CustomTrick,
  type CustomTrickCollection,
  type SequenceStep,
} from '@/features/custom-tricks/model/custom-trick';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const CUSTOM_TRICKS_STORAGE_KEY = 'daily-dama:custom-tricks';
export const CUSTOM_TRICKS_SCHEMA_VERSION = 1;

interface CustomTrickDocumentV1 {
  readonly version: typeof CUSTOM_TRICKS_SCHEMA_VERSION;
  readonly tricks: readonly CustomTrick[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNormalizedText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function isOptionalKenteiRank(value: unknown) {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12);
}

export function isSequenceStep(value: unknown): value is SequenceStep {
  if (!isRecord(value) || !isNormalizedText(value.name)) return false;
  if (value.kind === 'customText') return value.sourceTrickId === undefined;
  return value.kind === 'existingTrick' && isNormalizedText(value.sourceTrickId);
}

export function isCustomTrick(value: unknown): value is CustomTrick {
  if (!isRecord(value)) return false;

  const { id, kind, name, kenteiRank, steps } = value;
  if (!isNormalizedText(id) || !isNormalizedText(name) || !isOptionalKenteiRank(kenteiRank)) {
    return false;
  }

  if (kind === 'standalone') return steps === undefined;
  if (kind !== 'sequence' || !Array.isArray(steps) || steps.length < 2) return false;
  return steps.every(isSequenceStep);
}

// T157.5: validates an in-memory (already-parsed) value as a
// `CustomTrickCollection`, unlike `deserializeCustomTricks` which only
// operates on a JSON *string*. Used as the `SyncEnvelopeCodec<
// CustomTrickSyncSnapshot>.isState` predicate's `collection` field check --
// the sync envelope's `state` is stored as a plain object inside a larger
// JSON document, not as a standalone serialized string.
export function isCustomTrickCollection(value: unknown): value is CustomTrickCollection {
  if (!isRecord(value) || !Array.isArray(value.tricks) || !value.tricks.every(isCustomTrick)) {
    return false;
  }
  const ids = value.tricks.map((trick) => trick.id);
  return new Set(ids).size === ids.length;
}

export function serializeCustomTricks(collection: CustomTrickCollection) {
  const document: CustomTrickDocumentV1 = {
    version: CUSTOM_TRICKS_SCHEMA_VERSION,
    tricks: collection.tricks,
  };
  return JSON.stringify(document);
}

export function deserializeCustomTricks(serialized: string): CustomTrickCollection | undefined {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (
    !isRecord(document) ||
    document.version !== CUSTOM_TRICKS_SCHEMA_VERSION ||
    !Array.isArray(document.tricks) ||
    !document.tricks.every(isCustomTrick)
  ) {
    return undefined;
  }

  const ids = document.tricks.map((trick) => trick.id);
  if (new Set(ids).size !== ids.length) return undefined;
  return { tricks: document.tricks };
}

export async function loadCustomTricks(
  storage: KeyValueStorage,
): Promise<PersistenceLoadResult<CustomTrickCollection>> {
  try {
    const serialized = await storage.getItem(CUSTOM_TRICKS_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: INITIAL_CUSTOM_TRICKS };

    const collection = deserializeCustomTricks(serialized);
    if (collection) return { status: 'loaded', value: collection };

    return {
      status: 'recovered',
      value: INITIAL_CUSTOM_TRICKS,
      error: new Error('The persisted custom tricks are malformed or use an unsupported version.'),
    };
  } catch (error) {
    return { status: 'recovered', value: INITIAL_CUSTOM_TRICKS, error };
  }
}

export async function saveCustomTricks(
  storage: KeyValueStorage,
  collection: CustomTrickCollection,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(CUSTOM_TRICKS_STORAGE_KEY, serializeCustomTricks(collection));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

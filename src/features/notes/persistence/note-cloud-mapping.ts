// T155.13: pure mapping + runtime response validation between the local
// `Note` domain shape and the `notes` cloud rows. Explicitly does NOT wire
// into the provider, reducer, or any synchronization logic -- that's T157's
// job, same as T155.10/T155.11/T155.12 deferred their own wiring. Same
// tombstone-entry and revision-handling design as
// `goal-cloud-mapping.ts` -- see that file's header comment for the full
// rationale; not re-derived verbatim here.

import { isNormalizedText as isNormalizedTextNote } from '@/features/notes/persistence/note-persistence';
import type { Note, NoteCollection } from '@/features/notes/model/note';
import type { NoteCloudPatch, NoteInsert, NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import type { NewOutboxOperationInput } from '@/shared/sync/outbox-operation';

export type NoteMappingIssueReason =
  | 'wrongType'
  | 'outOfRange'
  | 'malformedShape'
  | 'foreignUser'
  | 'duplicateId'
  | 'invalidRevision'
  | 'invalidSessionAssociation'
  | 'invariantViolation';

export interface NoteMappingIssue {
  readonly path: string;
  readonly reason: NoteMappingIssueReason;
  readonly message: string;
}

export interface NoteCloudMeta {
  readonly revision: number;
}

export type NoteCloudEntry =
  | { readonly status: 'active'; readonly note: Note; readonly meta: NoteCloudMeta }
  | { readonly status: 'deleted'; readonly note: Note; readonly meta: NoteCloudMeta & { readonly deletedAt: number } };

export type NoteRowMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly NoteMappingIssue[] }
  | { readonly status: 'valid'; readonly entry: NoteCloudEntry };

export type NoteRowsMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly NoteMappingIssue[] }
  | { readonly status: 'valid'; readonly entries: readonly NoteCloudEntry[] };

export type NoteMutationPrepIssueReason = 'invalidRevision' | 'alreadyDeleted' | 'malformedShape';

export interface NoteMutationPrepIssue {
  readonly reason: NoteMutationPrepIssueReason;
  readonly message: string;
}

export type NoteDeletionPrepResult =
  | { readonly status: 'rejected'; readonly issue: NoteMutationPrepIssue }
  | { readonly status: 'prepared'; readonly patch: NoteCloudPatch };

export type NoteEditPrepResult =
  | { readonly status: 'rejected'; readonly issue: NoteMutationPrepIssue }
  | { readonly status: 'prepared'; readonly patch: NoteCloudPatch };

function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function isSaneRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Maps a single `notes` row to a `NoteCloudEntry`. Self-contained -- never
 * looks at sibling rows. The batch-level duplicate check lives in
 * `mapNoteRowsToDomainEntries`, since it needs sibling rows to evaluate.
 */
export function mapNoteRowToDomainEntry(row: NoteRow, expectedUserId: string): NoteRowMappingResult {
  if (row.user_id !== expectedUserId) {
    return {
      status: 'invalid',
      issues: [
        {
          path: 'user_id',
          reason: 'foreignUser',
          message: `Note row belongs to user ${JSON.stringify(row.user_id)}, expected ${JSON.stringify(expectedUserId)}.`,
        },
      ],
    };
  }

  // Treat every field as effectively `unknown` -- the generated NoteRow type
  // only describes what a well-formed row looks like, it doesn't prove the
  // value we actually received is well-formed.
  const raw = row as unknown as Record<string, unknown>;
  const issues: NoteMappingIssue[] = [];

  const idRaw = raw.id;
  if (!isNormalizedTextNote(idRaw)) {
    issues.push({ path: 'id', reason: 'malformedShape', message: 'id must be a non-empty, trimmed string.' });
  }

  const trickIdRaw = raw.trick_id;
  if (!isNormalizedTextNote(trickIdRaw)) {
    issues.push({ path: 'trick_id', reason: 'malformedShape', message: 'trick_id must be a non-empty, trimmed string.' });
  }

  const trickNameRaw = raw.trick_name;
  if (!isNormalizedTextNote(trickNameRaw)) {
    issues.push({
      path: 'trick_name',
      reason: 'malformedShape',
      message: 'trick_name must be a non-empty, trimmed string.',
    });
  }

  const bodyRaw = raw.body;
  if (!isNormalizedTextNote(bodyRaw)) {
    issues.push({ path: 'body', reason: 'malformedShape', message: 'body must be a non-empty, trimmed string.' });
  }

  const practiceSessionIdRaw = raw.practice_session_id;
  let practiceSessionId: string | undefined;
  if (practiceSessionIdRaw !== null && practiceSessionIdRaw !== undefined) {
    if (!isNormalizedTextNote(practiceSessionIdRaw)) {
      issues.push({
        path: 'practice_session_id',
        reason: 'invalidSessionAssociation',
        message: 'practice_session_id must be null or a non-empty, trimmed string.',
      });
    } else {
      practiceSessionId = practiceSessionIdRaw;
    }
  }

  const createdAtMs = parseTimestampMs(raw.created_at);
  if (createdAtMs === undefined) {
    issues.push({ path: 'created_at', reason: 'wrongType', message: 'created_at must be a parseable timestamp.' });
  }

  const updatedAtMs = parseTimestampMs(raw.updated_at);
  if (updatedAtMs === undefined) {
    issues.push({ path: 'updated_at', reason: 'wrongType', message: 'updated_at must be a parseable timestamp.' });
  }

  if (createdAtMs !== undefined && updatedAtMs !== undefined && updatedAtMs < createdAtMs) {
    issues.push({
      path: 'updated_at',
      reason: 'invariantViolation',
      message: 'updated_at must be greater than or equal to created_at.',
    });
  }

  const revisionRaw = raw.revision;
  if (!isSaneRevision(revisionRaw)) {
    issues.push({ path: 'revision', reason: 'invalidRevision', message: 'revision must be a positive integer.' });
  }

  const deletedAtRaw = raw.deleted_at;
  let deletedAtMs: number | undefined;
  if (deletedAtRaw !== null && deletedAtRaw !== undefined) {
    deletedAtMs = parseTimestampMs(deletedAtRaw);
    if (deletedAtMs === undefined) {
      issues.push({ path: 'deleted_at', reason: 'wrongType', message: 'deleted_at must be a parseable timestamp or null.' });
    }
  }

  if (issues.length > 0) return { status: 'invalid', issues };

  const note: Note = {
    id: idRaw as string,
    trickId: trickIdRaw as string,
    trickName: trickNameRaw as string,
    body: bodyRaw as string,
    ...(practiceSessionId !== undefined ? { practiceSessionId } : {}),
    createdAt: createdAtMs as number,
    updatedAt: updatedAtMs as number,
  };

  const meta: NoteCloudMeta = { revision: revisionRaw as number };

  return {
    status: 'valid',
    entry:
      deletedAtMs !== undefined
        ? { status: 'deleted', note, meta: { ...meta, deletedAt: deletedAtMs } }
        : { status: 'active', note, meta },
  };
}

/**
 * Maps a batch of `notes` rows to `NoteCloudEntry` values. A single
 * malformed/foreign/duplicate row invalidates the whole batch. An empty row
 * list is simply a valid empty result; there is no "absent" status here.
 *
 * Preserves row input order exactly. Does NOT filter out `'deleted'`
 * entries -- preserves `list()`'s own documented behavior that tombstones
 * are visible to callers.
 */
export function mapNoteRowsToDomainEntries(
  rows: readonly NoteRow[],
  expectedUserId: string,
): NoteRowsMappingResult {
  const issues: NoteMappingIssue[] = [];
  const mappedEntries: NoteCloudEntry[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  rows.forEach((row, index) => {
    const pathPrefix = `rows[${index}]`;
    const result = mapNoteRowToDomainEntry(row, expectedUserId);

    if (result.status === 'invalid') {
      result.issues.forEach((issue) => {
        issues.push({ ...issue, path: `${pathPrefix}.${issue.path}` });
      });
    } else {
      mappedEntries.push(result.entry);
    }

    const rawId = (row as unknown as Record<string, unknown>).id;
    if (typeof rawId === 'string' && rawId.length > 0) {
      if (seenIds.has(rawId)) duplicateIds.add(rawId);
      seenIds.add(rawId);
    }
  });

  duplicateIds.forEach((id) => {
    issues.push({
      path: `id=${id}`,
      reason: 'duplicateId',
      message: `Multiple note rows share id ${JSON.stringify(id)}.`,
    });
  });

  if (issues.length > 0) return { status: 'invalid', issues };

  return { status: 'valid', entries: mappedEntries };
}

/**
 * Maps a trusted, reducer-constructed `Note` to a `notes` insert input.
 * Builds a fresh object literal -- never spreads `note` then mutates.
 * Deliberately omits `revision`/`created_at`/`updated_at`/`deleted_at`
 * entirely (server-owned; also outside the grant's insertable column list).
 */
export function mapNoteToInsertInput(note: Note, userId: string): NoteInsert {
  return {
    user_id: userId,
    id: note.id,
    trick_id: note.trickId,
    trick_name: note.trickName,
    body: note.body,
    practice_session_id: note.practiceSessionId ?? null,
  };
}

/**
 * Prepares a `NoteCloudPatch` that tombstones a known note entry.
 * `deletedAtMs` is an explicit parameter, not `Date.now()` inside the
 * function. See `prepareGoalDeletionPatch` in `goal-cloud-mapping.ts` for
 * the full rejection-rule rationale (mirrored here).
 */
export function prepareNoteDeletionPatch(known: NoteCloudEntry, deletedAtMs: number): NoteDeletionPrepResult {
  if (!isSaneRevision(known.meta.revision)) {
    return {
      status: 'rejected',
      issue: { reason: 'invalidRevision', message: 'The known note entry has a malformed revision.' },
    };
  }
  if (known.status === 'deleted') {
    return {
      status: 'rejected',
      issue: { reason: 'alreadyDeleted', message: 'The known note entry is already tombstoned.' },
    };
  }

  return { status: 'prepared', patch: { deleted_at: new Date(deletedAtMs).toISOString() } };
}

/**
 * Prepares a `NoteCloudPatch` that edits a known note entry's body. `body`
 * is assumed already validated/trimmed by `validateNoteEdit` upstream --
 * this boundary function does a defensive non-blank check on it
 * (`'malformedShape'`), but does not reimplement note-body validation UX.
 */
export function prepareNoteEditPatch(known: NoteCloudEntry, body: string): NoteEditPrepResult {
  if (!isSaneRevision(known.meta.revision)) {
    return {
      status: 'rejected',
      issue: { reason: 'invalidRevision', message: 'The known note entry has a malformed revision.' },
    };
  }
  if (known.status === 'deleted') {
    return {
      status: 'rejected',
      issue: { reason: 'alreadyDeleted', message: 'The known note entry is already tombstoned.' },
    };
  }
  if (!isNormalizedTextNote(body)) {
    return {
      status: 'rejected',
      issue: { reason: 'malformedShape', message: 'body must be a non-empty, trimmed string.' },
    };
  }

  return { status: 'prepared', patch: { body } };
}

export type NoteCollectionMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly NoteMappingIssue[] }
  | { readonly status: 'valid'; readonly collection: NoteCollection };

/**
 * T157.8: composes a `NoteCollection` (active notes only) from pulled
 * `notes` rows, for the driver hook's pull-adopt branch. Mirrors
 * `mapGoalRowsToDomainCollection` exactly -- delegates to
 * `mapNoteRowsToDomainEntries` for validation, then filters to `'active'`
 * entries so a tombstoned row never resurrects into the locally-rendered
 * `NoteCollection`.
 */
export function mapNoteRowsToDomainCollection(
  rows: readonly NoteRow[],
  expectedUserId: string,
): NoteCollectionMappingResult {
  const result = mapNoteRowsToDomainEntries(rows, expectedUserId);
  if (result.status === 'invalid') return result;

  const notes = result.entries
    .filter((entry): entry is Extract<typeof entry, { status: 'active' }> => entry.status === 'active')
    .map((entry) => entry.note);

  return { status: 'valid', collection: { notes } };
}

/**
 * T157.8: pure diff between a `NoteCollection` before and after a local
 * mutation, emitting the outbox operations that would bring the server up
 * to date. Mirrors `diffGoalsForOutboxOperations` exactly: key both sides
 * by id, sorted-union id order for determinism, missing in `next` ->
 * delete, new-or-changed (via JSON.stringify inequality) -> upsert.
 */
export function diffNotesForOutboxOperations(
  previous: NoteCollection,
  next: NoteCollection,
  userId: string,
): readonly NewOutboxOperationInput[] {
  const previousById = new Map(previous.notes.map((note) => [note.id, note]));
  const nextById = new Map(next.notes.map((note) => [note.id, note]));

  const operations: NewOutboxOperationInput[] = [];
  const noteIdsInStableOrder = Array.from(new Set([...previousById.keys(), ...nextById.keys()])).sort();

  for (const noteId of noteIdsInStableOrder) {
    const previousNote = previousById.get(noteId);
    const nextNote = nextById.get(noteId);

    if (nextNote === undefined) {
      operations.push({ domain: 'notes', operationType: 'delete', recordId: noteId, payload: null });
      continue;
    }

    if (previousNote === undefined || JSON.stringify(previousNote) !== JSON.stringify(nextNote)) {
      operations.push({
        domain: 'notes',
        operationType: 'upsert',
        recordId: noteId,
        payload: mapNoteToInsertInput(nextNote, userId) as unknown as Record<string, unknown>,
      });
    }
  }

  return operations;
}

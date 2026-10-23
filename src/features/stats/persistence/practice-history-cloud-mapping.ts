// Pure mapping + runtime response validation between the local
// `PracticeSessionRecord`/`PracticeHistory` domain shapes and the
// `practice_sessions` cloud rows. Pure: it does not touch the provider,
// reducer, or sync state.
//
// Row -> domain direction returns a discriminated Result-style type because
// incoming rows are an untrusted runtime boundary (already successfully
// fetched, but not necessarily well-formed -- treat every field as
// effectively `unknown`, not just structurally what the generated Row type
// claims). Domain -> row direction is a total, non-Result pure function
// because `PracticeSessionRecord`/`PracticeHistory` are already trusted,
// reducer-constructed shapes by the time anything calls these mappers.
//
// The `practice_sessions_duration_matches_timing` CHECK constraint matches
// the permissive, domain-correct invariant this mapper's row->domain validation already used
// (`durationMs <= completedAt - startedAt`, matching
// `practice-history-persistence.ts`'s local storage validator) -- a
// genuinely-valid paused session (`sesh.tsx`/`sesh.ts`'s reducer supports
// pausing an active session) can have `durationMs < completedAt -
// startedAt`, since active practice time can be less than wall-clock
// elapsed time.

import type { PracticeHistory, PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type {
  PracticeSessionInsert,
  PracticeSessionRow,
} from '@/features/stats/persistence/practice-history-cloud-repository';
import { isFiniteNonNegativeNumber } from '@/features/stats/persistence/practice-history-persistence';
import type { NewOutboxOperationInput } from '@/shared/sync/outbox-operation';

export type PracticeSessionMappingIssueReason =
  | 'wrongType'
  | 'outOfRange'
  | 'malformedShape'
  | 'foreignUser'
  | 'duplicateId'
  | 'invariantViolation';

export interface PracticeSessionMappingIssue {
  readonly path: string;
  readonly reason: PracticeSessionMappingIssueReason;
  readonly message: string;
}

export type PracticeSessionRowMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly PracticeSessionMappingIssue[] }
  | { readonly status: 'valid'; readonly session: PracticeSessionRecord };

export type PracticeHistoryRowsMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly PracticeSessionMappingIssue[] }
  | { readonly status: 'valid'; readonly history: PracticeHistory };

/**
 * Maps a single `practice_sessions` row to a `PracticeSessionRecord`.
 * Self-contained -- never looks at sibling rows. The batch-level duplicate
 * check lives in `mapPracticeSessionRowsToDomainHistory`, since it needs
 * sibling rows to evaluate.
 */
export function mapPracticeSessionRowToDomainRecord(
  row: PracticeSessionRow,
  expectedUserId: string,
): PracticeSessionRowMappingResult {
  if (row.user_id !== expectedUserId) {
    return {
      status: 'invalid',
      issues: [
        {
          path: 'user_id',
          reason: 'foreignUser',
          message: `Practice-session row belongs to user ${JSON.stringify(row.user_id)}, expected ${JSON.stringify(expectedUserId)}.`,
        },
      ],
    };
  }

  // Treat every field as effectively `unknown` -- the generated
  // PracticeSessionRow type only describes what a well-formed row looks
  // like, it doesn't prove the value we actually received is well-formed.
  const raw = row as unknown as Record<string, unknown>;
  const issues: PracticeSessionMappingIssue[] = [];

  const idRaw = raw.id;
  const idValid = typeof idRaw === 'string' && idRaw.length > 0;
  if (!idValid) {
    issues.push({ path: 'id', reason: 'malformedShape', message: 'id must be a non-empty string.' });
  }

  const trickIdRaw = raw.trick_id;
  const trickIdValid = typeof trickIdRaw === 'string' && trickIdRaw.length > 0;
  if (!trickIdValid) {
    issues.push({ path: 'trick_id', reason: 'malformedShape', message: 'trick_id must be a non-empty string.' });
  }

  const trickNameRaw = raw.trick_name;
  const trickNameValid =
    typeof trickNameRaw === 'string' && trickNameRaw.length > 0 && trickNameRaw === trickNameRaw.trim();
  if (!trickNameValid) {
    issues.push({
      path: 'trick_name',
      reason: 'malformedShape',
      message: 'trick_name must be a non-empty, trimmed string.',
    });
  }

  const startedAtRaw = raw.started_at;
  let startedAtValid = false;
  if (!isFiniteNonNegativeNumber(startedAtRaw)) {
    issues.push({ path: 'started_at', reason: 'wrongType', message: 'started_at must be a finite number.' });
  } else if (startedAtRaw === 0) {
    // Intentionally tracks the DB's stricter `> 0` constraint
    // (practice_sessions_started_at_positive) rather than the more lenient
    // local-storage validator's `>= 0` -- unlike duration_ms below, there's
    // no competing domain invariant that makes 0/negative a real epoch-ms
    // "started" timestamp for this app's era. Only the duration-equality
    // constraint above is the one that's actually wrong relative to a real
    // feature (pausing).
    issues.push({ path: 'started_at', reason: 'outOfRange', message: 'started_at must be greater than 0.' });
  } else {
    startedAtValid = true;
  }

  const completedAtRaw = raw.completed_at;
  let completedAtValid = false;
  if (!isFiniteNonNegativeNumber(completedAtRaw)) {
    issues.push({ path: 'completed_at', reason: 'wrongType', message: 'completed_at must be a finite number.' });
  } else {
    completedAtValid = true;
  }

  if (
    startedAtValid &&
    completedAtValid &&
    (completedAtRaw as number) < (startedAtRaw as number)
  ) {
    issues.push({
      path: 'completed_at',
      reason: 'invariantViolation',
      message: 'completed_at must be greater than or equal to started_at.',
    });
    completedAtValid = false;
  }

  const durationMsRaw = raw.duration_ms;
  let durationMsValid = false;
  if (!isFiniteNonNegativeNumber(durationMsRaw)) {
    issues.push({ path: 'duration_ms', reason: 'wrongType', message: 'duration_ms must be a finite number.' });
  } else {
    durationMsValid = true;
  }

  if (
    startedAtValid &&
    completedAtValid &&
    durationMsValid &&
    // Permissive, domain-correct invariant (<=), NOT the DB's stricter
    // equality check -- see the header comment for why.
    (durationMsRaw as number) > (completedAtRaw as number) - (startedAtRaw as number)
  ) {
    issues.push({
      path: 'duration_ms',
      reason: 'invariantViolation',
      message: 'duration_ms must not exceed completed_at - started_at.',
    });
    durationMsValid = false;
  }

  const laceCountRaw = raw.lace_count;
  let laceCount: number | undefined;
  if (typeof laceCountRaw !== 'number' || !Number.isInteger(laceCountRaw)) {
    issues.push({ path: 'lace_count', reason: 'wrongType', message: 'lace_count must be an integer.' });
  } else if (laceCountRaw < 0) {
    issues.push({ path: 'lace_count', reason: 'outOfRange', message: 'lace_count must not be negative.' });
  } else {
    laceCount = laceCountRaw;
  }

  const plannedDurationMsRaw = raw.planned_duration_ms;
  let plannedDurationMs: number | undefined;
  if (plannedDurationMsRaw !== null && plannedDurationMsRaw !== undefined) {
    if (typeof plannedDurationMsRaw !== 'number') {
      issues.push({
        path: 'planned_duration_ms',
        reason: 'wrongType',
        message: 'planned_duration_ms must be a number or null.',
      });
    } else if (!(plannedDurationMsRaw > 0)) {
      issues.push({
        path: 'planned_duration_ms',
        reason: 'outOfRange',
        message: 'planned_duration_ms must be greater than 0.',
      });
    } else {
      plannedDurationMs = plannedDurationMsRaw;
    }
  }

  const originRaw = raw.origin;
  let origin: 'assessment' | undefined;
  if (originRaw !== null && originRaw !== undefined) {
    if (originRaw !== 'assessment') {
      issues.push({ path: 'origin', reason: 'malformedShape', message: "origin must be 'assessment' or null." });
    } else {
      origin = originRaw;
    }
  }

  if (issues.length > 0) return { status: 'invalid', issues };

  return {
    status: 'valid',
    session: {
      id: idRaw as string,
      trickId: trickIdRaw as string,
      trickName: trickNameRaw as string,
      startedAt: startedAtRaw as number,
      completedAt: completedAtRaw as number,
      durationMs: durationMsRaw as number,
      laceCount: laceCount as number,
      ...(plannedDurationMs !== undefined ? { plannedDurationMs } : {}),
      ...(origin !== undefined ? { origin } : {}),
    },
  };
}

/**
 * Maps a batch of `practice_sessions` rows to a `PracticeHistory`. A single
 * malformed/foreign/duplicate row invalidates the whole mapping -- a
 * partial practice history would silently understate Stats, which is worse
 * than a loud failure. An empty row list is simply a valid empty history;
 * there is no "absent" status here (unlike `profiles`, there's no
 * meaningful "no row yet" case for a list).
 *
 * Preserves row input order exactly (never re-sorts and never regenerates
 * a row's `id` via `createPracticeSessionRecordId`). The repository's
 * `list()` already establishes the definitive `(completed_at desc, id asc)`
 * order server-side; this mapper's job is to preserve that order and each
 * row's own `id` verbatim as the domain id -- that's what keeps a page
 * boundary, cursor, and later dedup-by-id consistent between what the
 * server returned and what the local reducer stores.
 */
export function mapPracticeSessionRowsToDomainHistory(
  rows: readonly PracticeSessionRow[],
  expectedUserId: string,
): PracticeHistoryRowsMappingResult {
  const issues: PracticeSessionMappingIssue[] = [];
  const mappedSessions: PracticeSessionRecord[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  rows.forEach((row, index) => {
    const pathPrefix = `rows[${index}]`;
    const result = mapPracticeSessionRowToDomainRecord(row, expectedUserId);

    if (result.status === 'invalid') {
      result.issues.forEach((issue) => {
        issues.push({ ...issue, path: `${pathPrefix}.${issue.path}` });
      });
    } else {
      mappedSessions.push(result.session);
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
      message: `Multiple practice-session rows share id ${JSON.stringify(id)}.`,
    });
  });

  if (issues.length > 0) return { status: 'invalid', issues };

  return { status: 'valid', history: { sessions: mappedSessions } };
}

/**
 * Maps a trusted, reducer-constructed `PracticeSessionRecord` to a
 * `practice_sessions` insert input. Builds a fresh object literal --
 * never spreads `session` then mutates. Deliberately omits `created_at`
 * entirely (not even `?? null`) so the DB's `default now()` applies -- this
 * is the concrete mechanism that makes "server receipt timestamps never
 * replace client domain timestamps" true by construction on the write
 * path: this function has no way to set `created_at` even if a caller
 * wanted it to, and `started_at`/`completed_at`/`duration_ms` map straight
 * from the trusted domain record's own client-fact fields, never touching
 * `Date.now()` or anything row-shaped.
 *
 * Named `...InsertInput`, not `...UpsertInput` -- `practice_sessions` is
 * insert-only (no update/delete grant at all), matching the repository's
 * `insertMany` naming.
 */
export function mapPracticeSessionRecordToInsertInput(
  session: PracticeSessionRecord,
  userId: string,
): PracticeSessionInsert {
  return {
    user_id: userId,
    id: session.id,
    trick_id: session.trickId,
    trick_name: session.trickName,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    duration_ms: session.durationMs,
    lace_count: session.laceCount,
    planned_duration_ms: session.plannedDurationMs ?? null,
    origin: session.origin ?? null,
  };
}

/**
 * Maps a trusted `PracticeHistory` to one `practice_sessions` insert input
 * per session, preserving order.
 */
export function mapPracticeHistoryToInsertInputs(
  history: PracticeHistory,
  userId: string,
): readonly PracticeSessionInsert[] {
  return history.sessions.map((session) => mapPracticeSessionRecordToInsertInput(session, userId));
}

/**
 * The pure diff from a `PracticeHistory` change to outbox
 * operations, mirroring `diffCustomTricksForOutboxOperations`
 * (custom-trick-cloud-mapping.ts) but simplified for an immutable,
 * insert-only domain.
 *
 * Only sessions newly present in `next` (by id, not in `previous`) emit an
 * `upsert` operation. No delete branch: nothing in this domain ever removes
 * a session locally. No content-equality check for ids present in both:
 * practice-session records are immutable, so re-comparing content would be
 * dead code.
 */
export function diffPracticeHistoryForOutboxOperations(
  previous: PracticeHistory,
  next: PracticeHistory,
  userId: string,
): readonly NewOutboxOperationInput[] {
  const previousIds = new Set(previous.sessions.map((session) => session.id));
  const newSessions = next.sessions.filter((session) => !previousIds.has(session.id));

  // Stable order: ascending id. Each op targets a distinct recordId, so this
  // has no semantic meaning beyond determinism.
  const sorted = [...newSessions].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  return sorted.map((session) => ({
    domain: 'practiceHistory' as const,
    operationType: 'upsert' as const,
    recordId: session.id,
    payload: mapPracticeSessionRecordToInsertInput(session, userId) as unknown as Record<string, unknown>,
  }));
}

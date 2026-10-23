// Pure mapping + runtime response validation between the local
// `Goal` domain shape and the `goals` cloud rows. Pure: it does not touch
// the provider, reducer, or sync state; the sync transport and envelope call
// into it.
//
// Row -> domain direction returns a discriminated Result-style type because
// incoming rows are an untrusted runtime boundary (already successfully
// fetched, but not necessarily well-formed -- treat every field as
// effectively `unknown`, not just structurally what the generated Row type
// claims). Domain -> row/patch directions are pure functions over trusted,
// already-validated local shapes.
//
// TOMBSTONE-AWARE ENTRY TYPE: unlike `Goal`, which has no tombstone concept
// (the local reducer hard-deletes), a `goals` row can be soft-deleted
// (`deleted_at` set) while still carrying its full snapshot -- the
// migration's mutation trigger never nulls out `trick_id`/`trick_name`/
// `kind`/target columns on delete. `GoalCloudEntry` reuses the full `Goal`
// shape for both `'active'` and `'deleted'` statuses rather than inventing a
// separate slimmed-down tombstone shape, so a tombstoned row round-trips to
// a first-class valid representation, not an absent/invalid one.
//
// "STALE OR MALFORMED REVISION" is two narrow, distinct checks, not a
// revision-comparison/conflict-resolution scheme (conflicts are resolved in
// src/shared/sync/conflict-resolution.ts). "Malformed" = row->domain: `revision` isn't a sane positive integer.
// "Stale" = domain->mutation-payload preparation: the caller's own
// known-entry is already tombstoned, mirroring the DB trigger's
// unconditional rejection of any UPDATE against an already-deleted row
// (supabase/tests/t155_4_goals_and_notes.test.sql's "stale mutation" case).

import {
  isValidGoalTargetCount,
  isValidGoalTargetMinutes,
  MAX_GOAL_TARGET_MINUTES,
  MIN_GOAL_TARGET_MINUTES,
  type Goal,
  type GoalCollection,
} from '@/features/goals/model/goal';
import type { GoalCloudPatch, GoalInsert, GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { isNormalizedText } from '@/features/goals/persistence/goal-persistence';
import type { NewOutboxOperationInput } from '@/shared/sync/outbox-operation';

const MIN_GOAL_TARGET_MS = MIN_GOAL_TARGET_MINUTES * 60_000;
const MAX_GOAL_TARGET_MS = MAX_GOAL_TARGET_MINUTES * 60_000;

export type GoalMappingIssueReason =
  | 'wrongType'
  | 'outOfRange'
  | 'malformedShape'
  | 'foreignUser'
  | 'duplicateId'
  | 'ambiguousVariant'
  | 'invalidRevision'
  | 'invariantViolation';

export interface GoalMappingIssue {
  readonly path: string;
  readonly reason: GoalMappingIssueReason;
  readonly message: string;
}

export interface GoalCloudMeta {
  readonly revision: number;
}

export type GoalCloudEntry =
  | { readonly status: 'active'; readonly goal: Goal; readonly meta: GoalCloudMeta }
  | { readonly status: 'deleted'; readonly goal: Goal; readonly meta: GoalCloudMeta & { readonly deletedAt: number } };

export type GoalRowMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly GoalMappingIssue[] }
  | { readonly status: 'valid'; readonly entry: GoalCloudEntry };

export type GoalRowsMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly GoalMappingIssue[] }
  | { readonly status: 'valid'; readonly entries: readonly GoalCloudEntry[] };

export type GoalMutationPrepIssueReason = 'invalidRevision' | 'alreadyDeleted';

export interface GoalMutationPrepIssue {
  readonly reason: GoalMutationPrepIssueReason;
  readonly message: string;
}

export type GoalDeletionPrepResult =
  | { readonly status: 'rejected'; readonly issue: GoalMutationPrepIssue }
  | { readonly status: 'prepared'; readonly patch: GoalCloudPatch };

function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function isSaneRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Maps a single `goals` row to a `GoalCloudEntry`. Self-contained -- never
 * looks at sibling rows. The batch-level duplicate check lives in
 * `mapGoalRowsToDomainEntries`, since it needs sibling rows to evaluate.
 */
export function mapGoalRowToDomainEntry(row: GoalRow, expectedUserId: string): GoalRowMappingResult {
  if (row.user_id !== expectedUserId) {
    return {
      status: 'invalid',
      issues: [
        {
          path: 'user_id',
          reason: 'foreignUser',
          message: `Goal row belongs to user ${JSON.stringify(row.user_id)}, expected ${JSON.stringify(expectedUserId)}.`,
        },
      ],
    };
  }

  // Treat every field as effectively `unknown` -- the generated GoalRow type
  // only describes what a well-formed row looks like, it doesn't prove the
  // value we actually received is well-formed.
  const raw = row as unknown as Record<string, unknown>;
  const issues: GoalMappingIssue[] = [];

  const idRaw = raw.id;
  if (!isNormalizedText(idRaw)) {
    issues.push({ path: 'id', reason: 'malformedShape', message: 'id must be a non-empty, trimmed string.' });
  }

  const trickIdRaw = raw.trick_id;
  if (!isNormalizedText(trickIdRaw)) {
    issues.push({ path: 'trick_id', reason: 'malformedShape', message: 'trick_id must be a non-empty, trimmed string.' });
  }

  const trickNameRaw = raw.trick_name;
  if (!isNormalizedText(trickNameRaw)) {
    issues.push({
      path: 'trick_name',
      reason: 'malformedShape',
      message: 'trick_name must be a non-empty, trimmed string.',
    });
  }

  const kindRaw = raw.kind;
  const targetCountRaw = raw.target_count;
  const targetMsRaw = raw.target_ms;
  let kind: 'count' | 'time' | undefined;
  let targetCount: number | undefined;
  let targetMs: number | undefined;

  if (kindRaw === 'count') {
    if (targetMsRaw !== null && targetMsRaw !== undefined) {
      issues.push({
        path: 'target_ms',
        reason: 'ambiguousVariant',
        message: 'A count-kind goal must not also carry target_ms.',
      });
    }
    if (typeof targetCountRaw !== 'number' || !isValidGoalTargetCount(targetCountRaw)) {
      issues.push({
        path: 'target_count',
        reason: 'outOfRange',
        message: 'target_count must be a valid goal target count.',
      });
    } else {
      kind = 'count';
      targetCount = targetCountRaw;
    }
  } else if (kindRaw === 'time') {
    if (targetCountRaw !== null && targetCountRaw !== undefined) {
      issues.push({
        path: 'target_count',
        reason: 'ambiguousVariant',
        message: 'A time-kind goal must not also carry target_count.',
      });
    }
    if (
      typeof targetMsRaw !== 'number' ||
      targetMsRaw % 60_000 !== 0 ||
      !isValidGoalTargetMinutes(targetMsRaw / 60_000) ||
      targetMsRaw < MIN_GOAL_TARGET_MS ||
      targetMsRaw > MAX_GOAL_TARGET_MS
    ) {
      issues.push({
        path: 'target_ms',
        reason: 'outOfRange',
        message: 'target_ms must be a whole-minute multiple within the valid goal target range.',
      });
    } else {
      kind = 'time';
      targetMs = targetMsRaw;
    }
  } else {
    issues.push({ path: 'kind', reason: 'malformedShape', message: "kind must be 'count' or 'time'." });
  }

  const createdAtRaw = parseTimestampMs(raw.created_at);
  if (createdAtRaw === undefined) {
    issues.push({ path: 'created_at', reason: 'wrongType', message: 'created_at must be a parseable timestamp.' });
  }

  const updatedAtRaw = parseTimestampMs(raw.updated_at);
  if (updatedAtRaw === undefined) {
    issues.push({ path: 'updated_at', reason: 'wrongType', message: 'updated_at must be a parseable timestamp.' });
  }

  if (createdAtRaw !== undefined && updatedAtRaw !== undefined && updatedAtRaw < createdAtRaw) {
    issues.push({
      path: 'updated_at',
      reason: 'invariantViolation',
      message: 'updated_at must not be earlier than created_at.',
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

  const goal: Goal =
    kind === 'count'
      ? {
          id: idRaw as string,
          trickId: trickIdRaw as string,
          trickName: trickNameRaw as string,
          kind: 'count',
          targetCount: targetCount as number,
          createdAt: createdAtRaw as number,
          updatedAt: updatedAtRaw as number,
        }
      : {
          id: idRaw as string,
          trickId: trickIdRaw as string,
          trickName: trickNameRaw as string,
          kind: 'time',
          targetMs: targetMs as number,
          createdAt: createdAtRaw as number,
          updatedAt: updatedAtRaw as number,
        };

  const meta: GoalCloudMeta = { revision: revisionRaw as number };

  return {
    status: 'valid',
    entry:
      deletedAtMs !== undefined
        ? { status: 'deleted', goal, meta: { ...meta, deletedAt: deletedAtMs } }
        : { status: 'active', goal, meta },
  };
}

/**
 * Maps a batch of `goals` rows to `GoalCloudEntry` values. A single
 * malformed/foreign/duplicate row invalidates the whole batch -- a partial
 * goal list would silently understate progress, which is worse than a loud
 * failure. An empty row list is simply a valid empty result; there is no
 * "absent" status here (an empty array is a valid `list()` result).
 *
 * Preserves row input order exactly. Does NOT filter out `'deleted'`
 * entries -- preserves `list()`'s own documented behavior that tombstones
 * are visible to callers; filtering is a future selector/sync-layer concern.
 */
export function mapGoalRowsToDomainEntries(
  rows: readonly GoalRow[],
  expectedUserId: string,
): GoalRowsMappingResult {
  const issues: GoalMappingIssue[] = [];
  const mappedEntries: GoalCloudEntry[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  rows.forEach((row, index) => {
    const pathPrefix = `rows[${index}]`;
    const result = mapGoalRowToDomainEntry(row, expectedUserId);

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
      message: `Multiple goal rows share id ${JSON.stringify(id)}.`,
    });
  });

  if (issues.length > 0) return { status: 'invalid', issues };

  return { status: 'valid', entries: mappedEntries };
}

/**
 * Maps a trusted, reducer-constructed `Goal` to a `goals` insert input.
 * Builds a fresh object literal -- never spreads `goal` then mutates.
 * Deliberately omits `revision`/`created_at`/`updated_at`/`deleted_at`
 * entirely (server-owned; also outside the grant's insertable column list).
 */
export function mapGoalToInsertInput(goal: Goal, userId: string): GoalInsert {
  return goal.kind === 'count'
    ? {
        user_id: userId,
        id: goal.id,
        trick_id: goal.trickId,
        trick_name: goal.trickName,
        kind: 'count',
        target_count: goal.targetCount,
        target_ms: null,
      }
    : {
        user_id: userId,
        id: goal.id,
        trick_id: goal.trickId,
        trick_name: goal.trickName,
        kind: 'time',
        target_count: null,
        target_ms: goal.targetMs,
      };
}

/**
 * Prepares a `GoalCloudPatch` that tombstones a known goal entry.
 * `deletedAtMs` is an explicit parameter, not `Date.now()` inside the
 * function, matching AGENTS.md's "keep Date.now() calls outside pure logic"
 * convention -- the server overwrites whatever value is sent anyway (the
 * migration trigger forces server `now()`), but this function itself stays
 * pure/testable.
 *
 * Rejects preparing a further mutation against an already-tombstoned known
 * entry (`'alreadyDeleted'` -- the "stale mutation" case) or a known entry
 * whose revision is not a sane positive integer (`'invalidRevision'`,
 * defensive -- `GoalCloudEntry` values may originate from hand-built test
 * fixtures or future non-mapper code paths, not only this file's own
 * row-mapper).
 */
export function prepareGoalDeletionPatch(known: GoalCloudEntry, deletedAtMs: number): GoalDeletionPrepResult {
  if (!isSaneRevision(known.meta.revision)) {
    return {
      status: 'rejected',
      issue: { reason: 'invalidRevision', message: 'The known goal entry has a malformed revision.' },
    };
  }
  if (known.status === 'deleted') {
    return {
      status: 'rejected',
      issue: { reason: 'alreadyDeleted', message: 'The known goal entry is already tombstoned.' },
    };
  }

  return { status: 'prepared', patch: { deleted_at: new Date(deletedAtMs).toISOString() } };
}

export type GoalCollectionMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly GoalMappingIssue[] }
  | { readonly status: 'valid'; readonly collection: GoalCollection };

/**
 * Composes a `GoalCollection` (active goals only) from pulled
 * `goals` rows, for the driver hook's pull-adopt branch. Delegates entirely
 * to `mapGoalRowsToDomainEntries` for validation (same "one malformed row
 * invalidates the whole batch" posture), then filters to `'active'` entries
 * -- a tombstoned row is a real fact the sync layer needs (revision
 * tracking), but it must never resurrect into the locally-rendered
 * `GoalCollection`.
 */
export function mapGoalRowsToDomainCollection(
  rows: readonly GoalRow[],
  expectedUserId: string,
): GoalCollectionMappingResult {
  const result = mapGoalRowsToDomainEntries(rows, expectedUserId);
  if (result.status === 'invalid') return result;

  const goals = result.entries
    .filter((entry): entry is Extract<typeof entry, { status: 'active' }> => entry.status === 'active')
    .map((entry) => entry.goal);

  return { status: 'valid', collection: { goals } };
}

/**
 * Pure diff between a `GoalCollection` before and after a local
 * mutation, emitting the outbox operations that would bring the server up
 * to date. Copies `diffCustomTricksForOutboxOperations`'s shape exactly:
 * key both sides by id, sorted-union id order for determinism, missing in
 * `next` -> delete, new-or-changed (via JSON.stringify inequality) ->
 * upsert. Reusing `mapGoalToInsertInput` for the upsert payload is correct
 * for both a genuine create and an edit -- the transport layer, not this
 * diff, decides whether to `.insert()` or `.update()` a subset of columns.
 */
export function diffGoalsForOutboxOperations(
  previous: GoalCollection,
  next: GoalCollection,
  userId: string,
): readonly NewOutboxOperationInput[] {
  const previousById = new Map(previous.goals.map((goal) => [goal.id, goal]));
  const nextById = new Map(next.goals.map((goal) => [goal.id, goal]));

  const operations: NewOutboxOperationInput[] = [];
  const goalIdsInStableOrder = Array.from(new Set([...previousById.keys(), ...nextById.keys()])).sort();

  for (const goalId of goalIdsInStableOrder) {
    const previousGoal = previousById.get(goalId);
    const nextGoal = nextById.get(goalId);

    if (nextGoal === undefined) {
      operations.push({ domain: 'goals', operationType: 'delete', recordId: goalId, payload: null });
      continue;
    }

    if (previousGoal === undefined || JSON.stringify(previousGoal) !== JSON.stringify(nextGoal)) {
      operations.push({
        domain: 'goals',
        operationType: 'upsert',
        recordId: goalId,
        payload: mapGoalToInsertInput(nextGoal, userId) as unknown as Record<string, unknown>,
      });
    }
  }

  return operations;
}

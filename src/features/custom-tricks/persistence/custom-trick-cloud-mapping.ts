// T155.11: pure mapping + runtime response validation between the local
// `CustomTrick`/`CustomTrickCollection` domain shapes and the
// `custom_tricks` cloud rows. Explicitly does NOT wire into the provider,
// reducer, or any synchronization/diff logic -- that's a later ticket, same
// as T155.10 deferred profile wiring.
//
// Row -> domain direction returns a discriminated Result-style type
// because incoming rows are an untrusted runtime boundary (already
// successfully fetched, but not necessarily well-formed -- treat every
// field as effectively `unknown`, not just structurally what the
// generated Row type claims). Domain -> row direction is a total,
// non-Result pure function because `CustomTrick`/`CustomTrickCollection`
// are already trusted, reducer-constructed shapes by the time anything
// calls these mappers -- `selectSequenceStepCandidates` already prevents
// the local UI from constructing a nested sequence in the first place, so
// only the untrusted read direction needs the cross-row nested-sequence
// defense.
//
// The row->domain mapper only ever reads a sequence step's stored `name`
// field -- it never resolves a step's display name via `sourceTrickId`
// against any other row. That is what makes "stored step names survive a
// source trick's rename or deletion" true by construction, not just by
// convention.

import type {
  CustomTrick,
  CustomTrickCollection,
  SequenceStep,
} from '@/features/custom-tricks/model/custom-trick';
import {
  isNormalizedText,
  isOptionalKenteiRank,
  isSequenceStep,
} from '@/features/custom-tricks/persistence/custom-trick-persistence';
import type {
  CustomTrickInsert,
  CustomTrickRow,
} from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import type { Json } from '@/shared/supabase/database-types';
import type { NewOutboxOperationInput } from '@/shared/sync/outbox-operation';

export type CustomTrickMappingIssueReason =
  | 'wrongType'
  | 'outOfRange'
  | 'malformedShape'
  | 'foreignUser'
  | 'duplicateId'
  | 'nestedSequence';

export interface CustomTrickMappingIssue {
  readonly path: string;
  readonly reason: CustomTrickMappingIssueReason;
  readonly message: string;
}

export type CustomTrickRowMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly CustomTrickMappingIssue[] }
  | { readonly status: 'valid'; readonly trick: CustomTrick };

export type CustomTrickCollectionMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly CustomTrickMappingIssue[] }
  | { readonly status: 'valid'; readonly collection: CustomTrickCollection };

const RAW_CUSTOM_TEXT_KEYS = new Set(['kind', 'name']);
const RAW_EXISTING_TRICK_KEYS = new Set(['kind', 'name', 'sourceTrickId']);

function hasExactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== keys.size) return false;
  return actualKeys.every((key) => keys.has(key));
}

/**
 * Maps a single `custom_tricks` row to a `CustomTrick`. Self-contained --
 * never looks at sibling rows. The batch-level nested-sequence check lives
 * in `mapCustomTrickRowsToDomainCollection`, since it needs sibling rows to
 * evaluate.
 */
export function mapCustomTrickRowToDomainTrick(
  row: CustomTrickRow,
  expectedUserId: string,
): CustomTrickRowMappingResult {
  if (row.user_id !== expectedUserId) {
    return {
      status: 'invalid',
      issues: [
        {
          path: 'user_id',
          reason: 'foreignUser',
          message: `Custom-trick row belongs to user ${JSON.stringify(row.user_id)}, expected ${JSON.stringify(expectedUserId)}.`,
        },
      ],
    };
  }

  // Treat every field as effectively `unknown` -- the generated
  // CustomTrickRow type only describes what a well-formed row looks like,
  // it doesn't prove the value we actually received is well-formed.
  const raw = row as unknown as Record<string, unknown>;
  const issues: CustomTrickMappingIssue[] = [];

  const idRaw = raw.id;
  const idValid = isNormalizedText(idRaw);
  if (!idValid) {
    issues.push({ path: 'id', reason: 'malformedShape', message: 'id must be a non-empty, trimmed string.' });
  }

  const kindRaw = raw.kind;
  const kindValid = kindRaw === 'standalone' || kindRaw === 'sequence';
  if (!kindValid) {
    issues.push({ path: 'kind', reason: 'malformedShape', message: "kind must be 'standalone' or 'sequence'." });
  }

  const nameRaw = raw.name;
  const nameValid = isNormalizedText(nameRaw);
  if (!nameValid) {
    issues.push({ path: 'name', reason: 'malformedShape', message: 'name must be a non-empty, trimmed string.' });
  }

  const kenteiRankRaw = raw.kentei_rank;
  let kenteiRank: number | undefined;
  if (kenteiRankRaw !== null && kenteiRankRaw !== undefined) {
    if (typeof kenteiRankRaw !== 'number') {
      issues.push({ path: 'kentei_rank', reason: 'wrongType', message: 'kentei_rank must be a number or null.' });
    } else if (!isOptionalKenteiRank(kenteiRankRaw)) {
      issues.push({ path: 'kentei_rank', reason: 'outOfRange', message: 'kentei_rank must be an integer from 1 to 12.' });
    } else {
      kenteiRank = kenteiRankRaw;
    }
  }

  const stepsRaw = raw.steps;
  const mappedSteps: SequenceStep[] = [];

  if (kindValid && kindRaw === 'standalone') {
    if (stepsRaw !== null && stepsRaw !== undefined) {
      issues.push({ path: 'steps', reason: 'malformedShape', message: 'steps must be null for a standalone trick.' });
    }
  } else if (kindValid && kindRaw === 'sequence') {
    if (!Array.isArray(stepsRaw) || stepsRaw.length < 2) {
      issues.push({ path: 'steps', reason: 'malformedShape', message: 'steps must be an array with at least two elements.' });
    } else {
      stepsRaw.forEach((stepRaw, index) => {
        const stepPath = `steps[${index}]`;

        if (!isSequenceStep(stepRaw)) {
          issues.push({ path: stepPath, reason: 'malformedShape', message: 'step does not match a valid SequenceStep shape.' });
          return;
        }

        const rawStepRecord = stepRaw as unknown as Record<string, unknown>;
        if (stepRaw.kind === 'customText') {
          if (!hasExactKeys(rawStepRecord, RAW_CUSTOM_TEXT_KEYS)) {
            issues.push({
              path: stepPath,
              reason: 'malformedShape',
              message: 'a customText step must have exactly the keys kind and name.',
            });
            return;
          }
          mappedSteps.push({ kind: 'customText', name: stepRaw.name });
          return;
        }

        // stepRaw.kind === 'existingTrick'
        if (!hasExactKeys(rawStepRecord, RAW_EXISTING_TRICK_KEYS)) {
          issues.push({
            path: stepPath,
            reason: 'malformedShape',
            message: 'an existingTrick step must have exactly the keys kind, name, and sourceTrickId.',
          });
          return;
        }
        if (idValid && stepRaw.sourceTrickId === idRaw) {
          issues.push({
            path: stepPath,
            reason: 'malformedShape',
            message: 'an existingTrick step must not reference its own row (self-reference).',
          });
          return;
        }
        mappedSteps.push({ kind: 'existingTrick', name: stepRaw.name, sourceTrickId: stepRaw.sourceTrickId });
      });
    }
  }

  if (issues.length > 0) return { status: 'invalid', issues };

  const kind = kindRaw as 'standalone' | 'sequence';
  return {
    status: 'valid',
    trick: {
      id: idRaw as string,
      kind,
      name: nameRaw as string,
      ...(kenteiRank !== undefined ? { kenteiRank } : {}),
      ...(kind === 'sequence' ? { steps: mappedSteps } : {}),
    } as CustomTrick,
  };
}

/**
 * Maps a batch of `custom_tricks` rows to a `CustomTrickCollection`. A
 * single malformed/foreign/duplicate/nested-sequence row invalidates the
 * whole collection mapping -- a partial custom-trick library would be
 * silently wrong, which is worse than a loud failure. An empty row list is
 * simply a valid empty collection; there is no "absent" status here (unlike
 * `profiles`, there's no meaningful "no row yet" case for a list).
 */
export function mapCustomTrickRowsToDomainCollection(
  rows: readonly CustomTrickRow[],
  expectedUserId: string,
): CustomTrickCollectionMappingResult {
  const issues: CustomTrickMappingIssue[] = [];
  const mappedTricks: CustomTrick[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  rows.forEach((row, index) => {
    const pathPrefix = `rows[${index}]`;
    const result = mapCustomTrickRowToDomainTrick(row, expectedUserId);

    if (result.status === 'invalid') {
      result.issues.forEach((issue) => {
        issues.push({ ...issue, path: `${pathPrefix}.${issue.path}` });
      });
    } else {
      mappedTricks.push(result.trick);
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
      message: `Multiple custom-trick rows share id ${JSON.stringify(id)}.`,
    });
  });

  // Nested-sequence cross-row check: a sequence row's existingTrick steps
  // must not reference another row in the same batch whose kind is itself
  // 'sequence'. Built from the raw rows (not the mapped tricks) so this
  // check runs independently of whether the referencing row itself passed
  // row-level validation.
  const kindById = new Map<string, unknown>();
  rows.forEach((row) => {
    const raw = row as unknown as Record<string, unknown>;
    if (typeof raw.id === 'string' && raw.id.length > 0) {
      kindById.set(raw.id, raw.kind);
    }
  });

  rows.forEach((row, index) => {
    const raw = row as unknown as Record<string, unknown>;
    if (raw.kind !== 'sequence' || !Array.isArray(raw.steps)) return;

    raw.steps.forEach((stepRaw, stepIndex) => {
      if (typeof stepRaw !== 'object' || stepRaw === null) return;
      const stepRecord = stepRaw as Record<string, unknown>;
      if (stepRecord.kind !== 'existingTrick') return;
      const sourceTrickId = stepRecord.sourceTrickId;
      if (typeof sourceTrickId !== 'string') return;
      if (kindById.get(sourceTrickId) === 'sequence') {
        issues.push({
          path: `rows[${index}].steps[${stepIndex}].sourceTrickId`,
          reason: 'nestedSequence',
          message: `A sequence step must not reference another sequence (${JSON.stringify(sourceTrickId)}).`,
        });
      }
    });
  });

  if (issues.length > 0) return { status: 'invalid', issues };

  return { status: 'valid', collection: { tricks: mappedTricks } };
}

/**
 * Maps a trusted, reducer-constructed `CustomTrick` to a `custom_tricks`
 * upsert input. Builds a fresh object literal -- never spread-then-mutates
 * `trick` -- and rebuilds each sequence step explicitly rather than
 * spreading it, so the write path can't accidentally leak an extra
 * property onto a stored step and can never dereference `sourceTrickId`
 * against anything (it only ever copies `step.name` through). Deliberately
 * omits `revision`/`created_at`/`updated_at`, which are server-owned.
 */
export function mapCustomTrickToUpsertInput(trick: CustomTrick, userId: string): CustomTrickInsert {
  return {
    user_id: userId,
    id: trick.id,
    kind: trick.kind,
    name: trick.name,
    kentei_rank: trick.kenteiRank ?? null,
    steps: (trick.kind === 'sequence'
      ? trick.steps.map((step) =>
          step.kind === 'customText'
            ? { kind: 'customText', name: step.name }
            : { kind: 'existingTrick', name: step.name, sourceTrickId: step.sourceTrickId },
        )
      : null) as unknown as Json | null,
  };
}

/**
 * Maps a trusted `CustomTrickCollection` to one `custom_tricks` upsert
 * input per trick, preserving order.
 */
export function mapCustomTrickCollectionToUpsertInputs(
  collection: CustomTrickCollection,
  userId: string,
): readonly CustomTrickInsert[] {
  return collection.tricks.map((trick) => mapCustomTrickToUpsertInput(trick, userId));
}

/**
 * T157.5: pure diff between a `CustomTrickCollection` before and after a
 * local mutation, emitting the outbox operations that would bring the
 * server up to date. Unlike `diffProfileForOutboxOperations`, there is only
 * one row type here (no scalar/child-table split) so there is no "scalar op
 * first" two-tier ordering concept -- op order is simply ascending trick id,
 * purely so downstream callers/tests are deterministic (each op targets a
 * distinct `recordId`, so order otherwise has no semantic meaning).
 *
 * A trick present in both `previous` and `next` is compared via
 * `JSON.stringify` (not a field-by-field diff) for the same reason
 * `scalarFieldsEqual` in `profile-cloud-mapping.ts` uses it: every
 * `CustomTrick` field is plain JSON-serializable data constructed
 * exclusively by the trusted reducer.
 */
export function diffCustomTricksForOutboxOperations(
  previous: CustomTrickCollection,
  next: CustomTrickCollection,
  userId: string,
): readonly NewOutboxOperationInput[] {
  const previousById = new Map(previous.tricks.map((trick) => [trick.id, trick]));
  const nextById = new Map(next.tricks.map((trick) => [trick.id, trick]));

  const operations: NewOutboxOperationInput[] = [];
  const trickIdsInStableOrder = Array.from(
    new Set([...previousById.keys(), ...nextById.keys()]),
  ).sort();

  for (const trickId of trickIdsInStableOrder) {
    const previousTrick = previousById.get(trickId);
    const nextTrick = nextById.get(trickId);

    if (nextTrick === undefined) {
      operations.push({ domain: 'customTricks', operationType: 'delete', recordId: trickId, payload: null });
      continue;
    }

    if (previousTrick === undefined || JSON.stringify(previousTrick) !== JSON.stringify(nextTrick)) {
      operations.push({
        domain: 'customTricks',
        operationType: 'upsert',
        recordId: trickId,
        payload: mapCustomTrickToUpsertInput(nextTrick, userId) as unknown as Record<string, unknown>,
      });
    }
  }

  return operations;
}

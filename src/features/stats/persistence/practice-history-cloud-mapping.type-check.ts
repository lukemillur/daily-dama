// Compile-time-only proof that the mapping layer's discriminated
// union types leave no ambiguous empty-object stand-in for "invalid" vs
// "valid" branches, and that the `invalid` branches of
// `PracticeSessionRowMappingResult`/`PracticeHistoryRowsMappingResult` do
// not expose their success payload without first narrowing on `status`.
// Deliberately NOT named `*.test.ts` and NOT under `__tests__/`, so jest
// never collects it (jest would fail on an empty test suite) but `yarn tsc
// --noEmit` still type-checks it via tsconfig.json's `**/*.ts` include.
// This file has no runtime behavior.

import type {
  PracticeHistoryRowsMappingResult,
  PracticeSessionRowMappingResult,
} from '@/features/stats/persistence/practice-history-cloud-mapping';
import type { PracticeSessionInsert } from '@/features/stats/persistence/practice-history-cloud-repository';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

declare const rowResult: PracticeSessionRowMappingResult;
declare const historyResult: PracticeHistoryRowsMappingResult;

// --- invalid branch must not expose the success payload ---------------------

if (rowResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `session` property, only
  // `issues`.
  rowResult.session;
}

if (rowResult.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const session: PracticeSessionRecord = rowResult.session;
  void session;
}

if (historyResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `history` property, only
  // `issues`.
  historyResult.history;
}

if (historyResult.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const { history } = historyResult;
  void history;
}

// --- no ambiguous empty-object fallback for discriminated union members ----

// @ts-expect-error -- id/trickId/trickName/startedAt/completedAt/durationMs/
// laceCount are all required; an empty object cannot stand in for a valid
// PracticeSessionRecord.
const emptySession: PracticeSessionRecord = {};
void emptySession;

// `created_at` is optional on the generated Insert type (the DB applies
// `default now()`), but user_id/id/trick_id/trick_name/started_at/
// completed_at/duration_ms/lace_count are still required, so an empty
// object still cannot stand in for a valid insert input.
// @ts-expect-error -- required insert fields are missing.
const emptyInsert: PracticeSessionInsert = {};
void emptyInsert;

// Confirm `created_at` is specifically the field that's optional -- omitting
// only it from an otherwise-complete insert input still type-checks. This is
// what proves `mapPracticeSessionRecordToInsertInput`'s return value (which
// never sets `created_at`) is a legitimate `PracticeSessionInsert`.
const insertWithoutCreatedAt: Omit<PracticeSessionInsert, 'created_at'> = {
  user_id: 'user-1',
  id: 'session-1',
  trick_id: 'lighthouse',
  trick_name: 'Lighthouse',
  started_at: 1_000,
  completed_at: 5_000,
  duration_ms: 4_000,
  lace_count: 3,
  planned_duration_ms: null,
  origin: null,
};
const insertWithCreatedAtOmitted: PracticeSessionInsert = insertWithoutCreatedAt;
void insertWithCreatedAtOmitted;

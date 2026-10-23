// Compile-time-only proof that the mapping layer's discriminated
// union types leave no ambiguous empty-object stand-in for "invalid" vs
// "valid" branches, that `'active'`/`'deleted'` `GoalCloudEntry` variants
// gate `meta.deletedAt` access correctly, and that the insert mapper's
// return shape omits server-owned columns legitimately. Deliberately NOT
// named `*.test.ts` and NOT under `__tests__/`, so jest never collects it
// (jest would fail on an empty test suite) but `yarn tsc --noEmit` still
// type-checks it via tsconfig.json's `**/*.ts` include. This file has no
// runtime behavior.

import type { Goal } from '@/features/goals/model/goal';
import type {
  GoalCloudEntry,
  GoalRowMappingResult,
  GoalRowsMappingResult,
} from '@/features/goals/persistence/goal-cloud-mapping';
import type { GoalInsert } from '@/features/goals/persistence/goal-cloud-repository';

declare const rowResult: GoalRowMappingResult;
declare const rowsResult: GoalRowsMappingResult;
declare const entry: GoalCloudEntry;

// --- invalid branch must not expose the success payload ---------------------

if (rowResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `entry` property, only
  // `issues`.
  rowResult.entry;
}

if (rowResult.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const validEntry: GoalCloudEntry = rowResult.entry;
  void validEntry;
}

if (rowsResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `entries` property, only
  // `issues`.
  rowsResult.entries;
}

if (rowsResult.status === 'valid') {
  const { entries } = rowsResult;
  void entries;
}

// --- 'active' vs 'deleted' entry meta gating --------------------------------

if (entry.status === 'active') {
  // @ts-expect-error -- an 'active' entry's meta has no `deletedAt`.
  entry.meta.deletedAt;
}

if (entry.status === 'deleted') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const deletedAt: number = entry.meta.deletedAt;
  void deletedAt;
}

// --- no ambiguous empty-object fallback for discriminated union members ----

// @ts-expect-error -- id/trickId/trickName/kind/createdAt (+ the kind-specific
// target field) are all required; an empty object cannot stand in for a
// valid Goal.
const emptyGoal: Goal = {};
void emptyGoal;

// @ts-expect-error -- required insert fields are missing.
const emptyInsert: GoalInsert = {};
void emptyInsert;

// Confirm revision/created_at/updated_at/deleted_at are specifically the
// fields that are optional/server-owned -- omitting all of them from an
// otherwise-complete insert input still type-checks. This is what proves
// `mapGoalToInsertInput`'s return value (which never sets any of them) is a
// legitimate `GoalInsert`.
const insertWithoutServerOwnedFields: Omit<GoalInsert, 'revision' | 'created_at' | 'updated_at' | 'deleted_at'> = {
  user_id: 'user-1',
  id: 'goal-1',
  trick_id: 'lighthouse',
  trick_name: 'Lighthouse',
  kind: 'count',
  target_count: 10,
  target_ms: null,
};
const insertWithServerOwnedFieldsOmitted: GoalInsert = insertWithoutServerOwnedFields;
void insertWithServerOwnedFieldsOmitted;

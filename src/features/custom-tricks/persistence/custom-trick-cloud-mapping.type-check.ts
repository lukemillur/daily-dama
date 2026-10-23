// Compile-time-only proof that the mapping layer's discriminated
// union types leave no ambiguous empty-object stand-in for "invalid" vs
// "valid" branches, and that the `invalid` branches of
// `CustomTrickRowMappingResult`/`CustomTrickCollectionMappingResult` do not
// expose their success payload without first narrowing on `status`.
// Deliberately NOT named `*.test.ts` and NOT under `__tests__/`, so jest
// never collects it (jest would fail on an empty test suite) but `yarn tsc
// --noEmit` still type-checks it via tsconfig.json's `**/*.ts` include.
// This file has no runtime behavior.

import type {
  CustomTrickCollectionMappingResult,
  CustomTrickRowMappingResult,
} from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';
import type { CustomTrick, SequenceStep } from '@/features/custom-tricks/model/custom-trick';

declare const rowResult: CustomTrickRowMappingResult;
declare const collectionResult: CustomTrickCollectionMappingResult;

// --- invalid branch must not expose the success payload ---------------------

if (rowResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `trick` property, only
  // `issues`.
  rowResult.trick;
}

if (rowResult.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const trick: CustomTrick = rowResult.trick;
  void trick;
}

if (collectionResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `collection` property,
  // only `issues`.
  collectionResult.collection;
}

if (collectionResult.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const { collection } = collectionResult;
  void collection;
}

// --- no ambiguous empty-object fallback for discriminated union members ----

// @ts-expect-error -- `id`/`kind`/`name` are required, and `kind` must be
// one of the two discriminant values; an empty object cannot stand in for a
// valid CustomTrick.
const emptyTrick: CustomTrick = {};
void emptyTrick;

// @ts-expect-error -- `kind`/`name` are required, and `kind` must be one of
// the two discriminant values; an empty object cannot stand in for a valid
// SequenceStep.
const emptyStep: SequenceStep = {};
void emptyStep;

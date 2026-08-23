// T155.10: compile-time-only proof that the mapping layer's discriminated
// union types leave no ambiguous empty-object stand-in for "absent"/
// "invalid" branches, and that the `absent`/`invalid` branches of
// `ProfileRowMappingResult` do not expose a `fields` property without
// first narrowing on `status`. Deliberately NOT named `*.test.ts` and NOT
// under `__tests__/`, so jest never collects it (jest would fail on an
// empty test suite) but `yarn tsc --noEmit` still type-checks it via
// tsconfig.json's `**/*.ts` include. This file has no runtime behavior.

import type {
  ProfileMappingIssue,
  ProfileRowMappingResult,
  ProfileScalarFields,
} from '@/features/profile/persistence/profile-cloud-mapping';
import type { UserProfile } from '@/features/profile/model/user-profile';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const result: ProfileRowMappingResult;

// --- absent/invalid branches must not expose `.fields` ---------------------

if (result.status === 'absent') {
  // @ts-expect-error -- the `absent` branch has no `fields` property.
  result.fields;
}

if (result.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `fields` property, only
  // `issues`.
  result.fields;

  const issues: readonly ProfileMappingIssue[] = result.issues;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type IssuesIsReadonlyArray = Expect<Equal<typeof issues, readonly ProfileMappingIssue[]>>;
}

if (result.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const fields: ProfileScalarFields = result.fields;
  void fields;
}

// --- no ambiguous empty-object fallback for "valid but empty" --------------

// @ts-expect-error -- `hasCompletedOnboarding` is required; an empty object
// cannot stand in for a valid (if minimal) ProfileScalarFields value.
const emptyScalarFields: ProfileScalarFields = {};
void emptyScalarFields;

// @ts-expect-error -- `hasCompletedOnboarding`/`selectedTrickIds` are
// required; an empty object cannot stand in for a valid UserProfile.
const emptyUserProfile: UserProfile = {};
void emptyUserProfile;

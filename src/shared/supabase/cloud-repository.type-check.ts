// T155.9: compile-time-only proof that no repository's public signature
// leaks a Supabase query-builder type. Deliberately NOT named `*.test.ts`
// and NOT under `__tests__/`, so jest never collects it (jest would fail on
// an empty test suite) but `yarn tsc --noEmit` still type-checks it via
// tsconfig.json's `**/*.ts` include. This file has no runtime behavior.

import type { PostgrestFilterBuilder } from '@supabase/supabase-js';

import type { CloudMutationResult, CloudReadResult } from '@/shared/supabase/cloud-repository';
import type {
  CustomTrickCloudRepository,
  CustomTrickRow,
} from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import type { GoalCloudRepository, GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import type { NoteCloudRepository, NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import type {
  ProfileCloudRepository,
  ProfileRow,
  UserTrickStateRow,
} from '@/features/profile/persistence/profile-cloud-repository';
import type {
  PracticeHistoryCloudRepository,
  PracticeSessionRow,
} from '@/features/stats/persistence/practice-history-cloud-repository';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// --- profile ---------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProfileGetProfileReturn = Expect<
  Equal<ReturnType<ProfileCloudRepository['getProfile']>, Promise<CloudReadResult<ProfileRow | null>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProfileUpsertProfileReturn = Expect<
  Equal<ReturnType<ProfileCloudRepository['upsertProfile']>, Promise<CloudMutationResult<ProfileRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProfileListTrickStatesReturn = Expect<
  Equal<ReturnType<ProfileCloudRepository['listTrickStates']>, Promise<CloudReadResult<UserTrickStateRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProfileUpsertTrickStateReturn = Expect<
  Equal<
    ReturnType<ProfileCloudRepository['upsertTrickState']>,
    Promise<CloudMutationResult<UserTrickStateRow>>
  >
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProfileDeleteTrickStateReturn = Expect<
  Equal<
    ReturnType<ProfileCloudRepository['deleteTrickState']>,
    Promise<CloudMutationResult<{ readonly trickId: string }>>
  >
>;

// --- custom tricks -----------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type CustomTrickListReturn = Expect<
  Equal<ReturnType<CustomTrickCloudRepository['list']>, Promise<CloudReadResult<CustomTrickRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type CustomTrickUpsertReturn = Expect<
  Equal<ReturnType<CustomTrickCloudRepository['upsert']>, Promise<CloudMutationResult<CustomTrickRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type CustomTrickRemoveReturn = Expect<
  Equal<ReturnType<CustomTrickCloudRepository['remove']>, Promise<CloudMutationResult<{ readonly id: string }>>>
>;

// --- practice history --------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PracticeHistoryListReturn = Expect<
  Equal<ReturnType<PracticeHistoryCloudRepository['list']>, Promise<CloudReadResult<PracticeSessionRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PracticeHistoryInsertManyReturn = Expect<
  Equal<
    ReturnType<PracticeHistoryCloudRepository['insertMany']>,
    Promise<CloudMutationResult<readonly PracticeSessionRow[]>>
  >
>;

// --- goals ---------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GoalListReturn = Expect<Equal<ReturnType<GoalCloudRepository['list']>, Promise<CloudReadResult<GoalRow>>>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GoalInsertReturn = Expect<
  Equal<ReturnType<GoalCloudRepository['insert']>, Promise<CloudMutationResult<GoalRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GoalUpdateReturn = Expect<
  Equal<ReturnType<GoalCloudRepository['update']>, Promise<CloudMutationResult<GoalRow>>>
>;

// --- notes ---------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NoteListReturn = Expect<Equal<ReturnType<NoteCloudRepository['list']>, Promise<CloudReadResult<NoteRow>>>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NoteInsertReturn = Expect<
  Equal<ReturnType<NoteCloudRepository['insert']>, Promise<CloudMutationResult<NoteRow>>>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NoteUpdateReturn = Expect<
  Equal<ReturnType<NoteCloudRepository['update']>, Promise<CloudMutationResult<NoteRow>>>
>;

// --- the actual negative-leak proof ---------------------------------------
// A PostgrestFilterBuilder must not structurally match any of the above
// return types -- it is not enough that the file "happens to compile";
// this proves a query-builder type is not what these methods return.

type AnyFilterBuilder = PostgrestFilterBuilder<any, any, any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type FilterBuilderDoesNotLeakIntoProfileGetProfile = Expect<
  Equal<Equal<AnyFilterBuilder, Awaited<ReturnType<ProfileCloudRepository['getProfile']>>>, false>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type FilterBuilderDoesNotLeakIntoCustomTrickList = Expect<
  Equal<Equal<AnyFilterBuilder, Awaited<ReturnType<CustomTrickCloudRepository['list']>>>, false>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type FilterBuilderDoesNotLeakIntoPracticeHistoryInsertMany = Expect<
  Equal<Equal<AnyFilterBuilder, Awaited<ReturnType<PracticeHistoryCloudRepository['insertMany']>>>, false>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type FilterBuilderDoesNotLeakIntoGoalUpdate = Expect<
  Equal<Equal<AnyFilterBuilder, Awaited<ReturnType<GoalCloudRepository['update']>>>, false>
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type FilterBuilderDoesNotLeakIntoNoteUpdate = Expect<
  Equal<Equal<AnyFilterBuilder, Awaited<ReturnType<NoteCloudRepository['update']>>>, false>
>;

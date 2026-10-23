// Pure mapping + runtime response validation between `UserProfile`
// (plus its focused trick-selection/manual-unlock state) and the
// `profiles`/`user_trick_states` cloud rows. Pure: it does not touch the
// provider, reducer, or sync/diff logic (deciding which trick-state rows to
// delete when a trick is deselected belongs to the sync layer). See the profile-cloud-repository.ts header for why row
// shape and mapping are deliberately kept in separate files.
//
// Row -> domain direction returns a discriminated Result-style type
// because incoming rows are an untrusted runtime boundary (already
// successfully fetched, but not necessarily well-formed -- treat every
// field as effectively `unknown`, not just structurally what the
// generated Row type claims). Domain -> row direction is a total,
// non-Result pure function because `UserProfile` is already a trusted,
// reducer-constructed shape by the time anything calls these mappers.

import type { LastSesh, UserProfile } from '@/features/profile/model/user-profile';
import { isValidThemeHexColor } from '@/features/profile/model/user-profile';
import {
  isKenteiRank,
  isLastSesh,
  isStreakThresholdMs,
} from '@/features/profile/persistence/user-profile-persistence';

function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
import type {
  ProfileRow,
  ProfileUpsertInput,
  UserTrickStateRow,
  UserTrickStateUpsertInput,
} from '@/features/profile/persistence/profile-cloud-repository';
import type { Json } from '@/shared/supabase/database-types';
import type { NewOutboxOperationInput } from '@/shared/sync/outbox-operation';

export type ProfileMappingIssueReason =
  | 'missingField'
  | 'wrongType'
  | 'outOfRange'
  | 'malformedShape'
  | 'foreignUser'
  | 'duplicateTrickId'
  | 'invariantViolation';

export interface ProfileMappingIssue {
  readonly path: string;
  readonly reason: ProfileMappingIssueReason;
  readonly message: string;
}

// `updatedAt` is deliberately excluded from `ProfileScalarFields`: the
// reducer bumps it on every mutation, including trick-selection-only
// actions that don't otherwise touch any scalar field, so if it
// participated in `scalarFieldsEqual` every profile mutation would emit a
// spurious profile-row upsert. It round-trips for display/composition
// (see `composeUserProfileFromCloudRows`) but never participates in
// outbox-diffing, exactly like `created_at`/`revision` already don't.
export type ProfileScalarFields = Omit<UserProfile, 'selectedTrickIds' | 'manuallyUnlockedTrickIds' | 'updatedAt'>;
export type TrickStateFields = Pick<UserProfile, 'selectedTrickIds' | 'manuallyUnlockedTrickIds'>;

export type ProfileRowMappingResult =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly issues: readonly ProfileMappingIssue[] }
  | { readonly status: 'valid'; readonly fields: ProfileScalarFields; readonly updatedAt: number };

export type TrickStateRowsMappingResult =
  | { readonly status: 'invalid'; readonly issues: readonly ProfileMappingIssue[] }
  | { readonly status: 'valid'; readonly fields: TrickStateFields };

export type UserProfileCompositionResult =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly issues: readonly ProfileMappingIssue[] }
  | { readonly status: 'valid'; readonly profile: UserProfile };

/**
 * Maps a single `profiles` row (or its explicit absence) to the scalar
 * fields of `UserProfile` -- everything except the two trick-id arrays,
 * which live in `user_trick_states` and are handled by
 * `mapTrickStateRowsToDomainFields`.
 */
export function mapProfileRowToDomainFields(
  row: ProfileRow | null,
  expectedUserId: string,
): ProfileRowMappingResult {
  if (row === null) return { status: 'absent' };

  if (row.user_id !== expectedUserId) {
    return {
      status: 'invalid',
      issues: [
        {
          path: 'user_id',
          reason: 'foreignUser',
          message: `Profile row belongs to user ${JSON.stringify(row.user_id)}, expected ${JSON.stringify(expectedUserId)}.`,
        },
      ],
    };
  }

  // Treat every field as effectively `unknown` -- the generated ProfileRow
  // type only describes what a well-formed row looks like, it doesn't
  // prove the value we actually received is well-formed.
  const raw = row as unknown as Record<string, unknown>;
  const issues: ProfileMappingIssue[] = [];

  const onboardingRaw = raw.has_completed_onboarding;
  const isOnboardingBoolean = typeof onboardingRaw === 'boolean';
  if (!isOnboardingBoolean) {
    issues.push({
      path: 'has_completed_onboarding',
      reason: 'wrongType',
      message: 'has_completed_onboarding must be a boolean.',
    });
  }

  const kenteiRankRaw = raw.kentei_rank;
  let kenteiRank: number | undefined;
  if (kenteiRankRaw !== null && kenteiRankRaw !== undefined) {
    if (typeof kenteiRankRaw !== 'number') {
      issues.push({ path: 'kentei_rank', reason: 'wrongType', message: 'kentei_rank must be a number or null.' });
    } else if (!isKenteiRank(kenteiRankRaw)) {
      issues.push({ path: 'kentei_rank', reason: 'outOfRange', message: 'kentei_rank must be an integer from 1 to 12.' });
    } else {
      kenteiRank = kenteiRankRaw;
    }
  }

  if (isOnboardingBoolean) {
    const kenteiRankIsNull = kenteiRankRaw === null || kenteiRankRaw === undefined;
    if (onboardingRaw === true && kenteiRankIsNull) {
      issues.push({
        path: 'kentei_rank',
        reason: 'invariantViolation',
        message: 'kentei_rank must be present once onboarding is complete.',
      });
    }
    if (onboardingRaw === false && !kenteiRankIsNull) {
      issues.push({
        path: 'kentei_rank',
        reason: 'invariantViolation',
        message: 'kentei_rank must be absent (null) until onboarding is complete.',
      });
    }
  }

  const lastSeshRaw = raw.last_sesh;
  let lastSesh: LastSesh | undefined;
  if (lastSeshRaw !== null && lastSeshRaw !== undefined) {
    if (!isLastSesh(lastSeshRaw)) {
      issues.push({ path: 'last_sesh', reason: 'malformedShape', message: 'last_sesh is not a valid LastSesh shape.' });
    } else {
      lastSesh = lastSeshRaw;
    }
  }

  const streakThresholdMsRaw = raw.streak_threshold_ms;
  let streakThresholdMs: number | undefined;
  if (streakThresholdMsRaw !== null && streakThresholdMsRaw !== undefined) {
    if (!isStreakThresholdMs(streakThresholdMsRaw)) {
      issues.push({
        path: 'streak_threshold_ms',
        reason: 'outOfRange',
        message: 'streak_threshold_ms must be a multiple of 60000 between 60000 and 3600000.',
      });
    } else {
      streakThresholdMs = streakThresholdMsRaw;
    }
  }

  const themeColorFields: {
    field: 'theme_background_color' | 'theme_accent_color' | 'theme_text_color';
    domainKey: 'themeBackgroundColor' | 'themeAccentColor' | 'themeTextColor';
  }[] = [
    { field: 'theme_background_color', domainKey: 'themeBackgroundColor' },
    { field: 'theme_accent_color', domainKey: 'themeAccentColor' },
    { field: 'theme_text_color', domainKey: 'themeTextColor' },
  ];

  const themeColors: Partial<Record<'themeBackgroundColor' | 'themeAccentColor' | 'themeTextColor', string>> = {};
  for (const { field, domainKey } of themeColorFields) {
    const value = raw[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') {
      issues.push({ path: field, reason: 'wrongType', message: `${field} must be a string or null.` });
      continue;
    }
    if (!isValidThemeHexColor(value)) {
      issues.push({ path: field, reason: 'malformedShape', message: `${field} must match ^#[0-9a-fA-F]{6}$.` });
      continue;
    }
    themeColors[domainKey] = value;
  }

  const updatedAtRaw = parseTimestampMs(raw.updated_at);
  if (updatedAtRaw === undefined) {
    issues.push({ path: 'updated_at', reason: 'wrongType', message: 'updated_at must be a parseable timestamp.' });
  }

  if (issues.length > 0) return { status: 'invalid', issues };

  return {
    status: 'valid',
    fields: {
      hasCompletedOnboarding: onboardingRaw as boolean,
      ...(kenteiRank !== undefined ? { kenteiRank } : {}),
      ...(lastSesh !== undefined ? { lastSesh } : {}),
      ...(streakThresholdMs !== undefined ? { streakThresholdMs } : {}),
      ...themeColors,
    },
    updatedAt: updatedAtRaw as number,
  };
}

/**
 * Maps a batch of `user_trick_states` rows to the two trick-id arrays.
 * A single malformed/foreign/duplicate row invalidates the whole batch --
 * a partial success here would mean silently wrong trick-selection state
 * for the user, which is worse than a loud failure.
 */
export function mapTrickStateRowsToDomainFields(
  rows: readonly UserTrickStateRow[],
  expectedUserId: string,
): TrickStateRowsMappingResult {
  const issues: ProfileMappingIssue[] = [];
  const seenTrickIds = new Set<string>();
  const duplicateTrickIds = new Set<string>();

  rows.forEach((row, index) => {
    const raw = row as unknown as Record<string, unknown>;
    const pathPrefix = `rows[${index}]`;

    if (raw.user_id !== expectedUserId) {
      issues.push({
        path: `${pathPrefix}.user_id`,
        reason: 'foreignUser',
        message: `Trick-state row belongs to user ${JSON.stringify(raw.user_id)}, expected ${JSON.stringify(expectedUserId)}.`,
      });
    }

    const trickIdRaw = raw.trick_id;
    const trickIdIsValid = typeof trickIdRaw === 'string' && trickIdRaw.length > 0;
    if (!trickIdIsValid) {
      issues.push({ path: `${pathPrefix}.trick_id`, reason: 'malformedShape', message: 'trick_id must be a non-empty string.' });
    } else {
      if (seenTrickIds.has(trickIdRaw)) duplicateTrickIds.add(trickIdRaw);
      seenTrickIds.add(trickIdRaw);
    }

    const isSelectedRaw = raw.is_selected;
    const isSelectedValid = typeof isSelectedRaw === 'boolean';
    if (!isSelectedValid) {
      issues.push({ path: `${pathPrefix}.is_selected`, reason: 'wrongType', message: 'is_selected must be a boolean.' });
    }

    const isManuallyUnlockedRaw = raw.is_manually_unlocked;
    const isManuallyUnlockedValid = typeof isManuallyUnlockedRaw === 'boolean';
    if (!isManuallyUnlockedValid) {
      issues.push({
        path: `${pathPrefix}.is_manually_unlocked`,
        reason: 'wrongType',
        message: 'is_manually_unlocked must be a boolean.',
      });
    }

    if (isSelectedValid && isManuallyUnlockedValid && !isSelectedRaw && !isManuallyUnlockedRaw) {
      issues.push({
        path: pathPrefix,
        reason: 'invariantViolation',
        message: 'a trick-state row must be selected or manually unlocked (or both).',
      });
    }
  });

  duplicateTrickIds.forEach((trickId) => {
    issues.push({
      path: `trick_id=${trickId}`,
      reason: 'duplicateTrickId',
      message: `Multiple trick-state rows share trick_id ${JSON.stringify(trickId)}.`,
    });
  });

  if (issues.length > 0) return { status: 'invalid', issues };

  return {
    status: 'valid',
    fields: {
      selectedTrickIds: rows.filter((row) => row.is_selected).map((row) => row.trick_id),
      manuallyUnlockedTrickIds: rows.filter((row) => row.is_manually_unlocked).map((row) => row.trick_id),
    },
  };
}

/**
 * Combines a `profiles` row and `user_trick_states` rows into a full
 * `UserProfile`. Also owns the "partial row" defensive case: trick-state
 * rows existing without an owning profile row shouldn't happen given the
 * FK cascade, but is cheap to detect and worth failing loudly on.
 */
export function composeUserProfileFromCloudRows(
  profileRow: ProfileRow | null,
  trickStateRows: readonly UserTrickStateRow[],
  expectedUserId: string,
): UserProfileCompositionResult {
  const profileResult = mapProfileRowToDomainFields(profileRow, expectedUserId);

  if (profileResult.status === 'absent') {
    if (trickStateRows.length === 0) return { status: 'absent' };
    return {
      status: 'invalid',
      issues: [
        {
          path: 'profile',
          reason: 'malformedShape',
          message: 'trick-state rows exist without an owning profile row',
        },
      ],
    };
  }

  if (profileResult.status === 'invalid') {
    return { status: 'invalid', issues: profileResult.issues };
  }

  const trickStateResult = mapTrickStateRowsToDomainFields(trickStateRows, expectedUserId);
  if (trickStateResult.status === 'invalid') {
    return { status: 'invalid', issues: trickStateResult.issues };
  }

  return {
    status: 'valid',
    profile: {
      ...profileResult.fields,
      selectedTrickIds: trickStateResult.fields.selectedTrickIds,
      // Canonicalized to `[]`, never `undefined`, on the way out. Cloud
      // storage can't distinguish "manuallyUnlockedTrickIds never
      // touched" from "touched then fully cleared" (both are zero
      // matching rows), so `[]` is the acceptable, documented lossy
      // reconstruction of that field.
      manuallyUnlockedTrickIds: trickStateResult.fields.manuallyUnlockedTrickIds,
      updatedAt: profileResult.updatedAt,
    },
  };
}

/**
 * Maps a trusted, reducer-constructed `UserProfile`'s scalar fields to a
 * `profiles` upsert input. Builds a fresh object literal -- never
 * spread-then-mutates `profile` -- so the caller's object is never
 * touched. Deliberately omits `created_at`/`updated_at`/`revision`, which
 * are server-owned.
 */
export function mapUserProfileToProfileUpsertInput(profile: UserProfile, userId: string): ProfileUpsertInput {
  return {
    user_id: userId,
    has_completed_onboarding: profile.hasCompletedOnboarding,
    kentei_rank: profile.kenteiRank ?? null,
    last_sesh: (profile.lastSesh ?? null) as unknown as Json | null,
    streak_threshold_ms: profile.streakThresholdMs ?? null,
    theme_background_color: profile.themeBackgroundColor ?? null,
    theme_accent_color: profile.themeAccentColor ?? null,
    theme_text_color: profile.themeTextColor ?? null,
  };
}

/**
 * Maps a trusted `UserProfile`'s two trick-id arrays to one
 * `user_trick_states` upsert input per referenced trick id. Does NOT
 * compute deletions for trick ids that were previously selected/unlocked
 * and no longer are -- that diff belongs to the sync layer, not this
 * mapping.
 */
export function mapUserProfileToTrickStateUpsertInputs(
  profile: UserProfile,
  userId: string,
): readonly UserTrickStateUpsertInput[] {
  const manuallyUnlockedTrickIds = profile.manuallyUnlockedTrickIds ?? [];

  const allTrickIds: string[] = [];
  const seen = new Set<string>();
  for (const trickId of [...profile.selectedTrickIds, ...manuallyUnlockedTrickIds]) {
    if (seen.has(trickId)) continue;
    seen.add(trickId);
    allTrickIds.push(trickId);
  }

  return allTrickIds.map((trickId) => ({
    user_id: userId,
    trick_id: trickId,
    is_selected: profile.selectedTrickIds.includes(trickId),
    // Every emitted row automatically satisfies `is_selected ||
    // is_manually_unlocked` (the `user_trick_states_has_state` CHECK)
    // since `trickId` only ever appears in `allTrickIds` because it came
    // from at least one of the two source arrays.
    is_manually_unlocked: manuallyUnlockedTrickIds.includes(trickId),
  }));
}

export function extractScalarFields(profile: UserProfile): ProfileScalarFields {
  // Spread-omit rather than destructure-with-underscore-prefixes so this
  // stays correct if UserProfile grows another scalar field later without
  // anyone needing to remember to update this function. `updatedAt` is
  // omitted alongside the two trick-id arrays -- see the
  // `ProfileScalarFields` comment for why it must never participate in
  // outbox-diffing.
  const {
    selectedTrickIds: _selectedTrickIds,
    manuallyUnlockedTrickIds: _manuallyUnlockedTrickIds,
    updatedAt: _updatedAt,
    ...scalarFields
  } = profile;
  return scalarFields;
}

function scalarFieldsEqual(a: ProfileScalarFields, b: ProfileScalarFields): boolean {
  // Every field on ProfileScalarFields is plain JSON-serializable data
  // (booleans, numbers, strings, or the small LastSesh shape) constructed
  // exclusively by the trusted reducer -- deep-equality via JSON is safe and
  // avoids hand-writing a field-by-field comparator that drifts from the
  // model as fields are added.
  return JSON.stringify(a) === JSON.stringify(b);
}

interface TrickStateFlags {
  readonly isSelected: boolean;
  readonly isManuallyUnlocked: boolean;
}

function trickStateFlagsByTrickId(
  upsertInputs: readonly UserTrickStateUpsertInput[],
): Map<string, TrickStateFlags> {
  const map = new Map<string, TrickStateFlags>();
  for (const input of upsertInputs) {
    map.set(input.trick_id, {
      isSelected: input.is_selected ?? false,
      isManuallyUnlocked: input.is_manually_unlocked ?? false,
    });
  }
  return map;
}

/**
 * Pure diff: given a `UserProfile` before and after a local mutation, emits
 * the outbox operations that would bring the server up to date. Stable,
 * deterministic op order (scalar op if any first, then trick ops in
 * ascending trick-id order) purely so downstream callers/tests are not
 * flaky -- order otherwise has no semantic meaning since each op targets a
 * distinct `recordId`.
 *
 * `userId` is used as `recordId` for the scalar `profile` row -- this is
 * what lets the push adapter route "is this the profile row or a
 * trick-state row?" by a single `request.recordId === userId` check, since
 * `userId` is always a UUID (`isValidVerifiedUserId`) and no trick id
 * (standard or `custom-<...>`) is ever UUID-shaped.
 */
export function diffProfileForOutboxOperations(
  previous: UserProfile,
  next: UserProfile,
  userId: string,
): readonly NewOutboxOperationInput[] {
  const operations: NewOutboxOperationInput[] = [];

  const previousScalarFields = extractScalarFields(previous);
  const nextScalarFields = extractScalarFields(next);
  if (!scalarFieldsEqual(previousScalarFields, nextScalarFields)) {
    operations.push({
      domain: 'profile',
      operationType: 'upsert',
      recordId: userId,
      payload: mapUserProfileToProfileUpsertInput(next, userId) as unknown as Record<string, unknown>,
    });
  }

  const previousTrickStates = trickStateFlagsByTrickId(mapUserProfileToTrickStateUpsertInputs(previous, userId));
  const nextTrickStateInputs = mapUserProfileToTrickStateUpsertInputs(next, userId);
  const nextTrickStates = trickStateFlagsByTrickId(nextTrickStateInputs);

  const nextTrickStateInputsByTrickId = new Map(nextTrickStateInputs.map((input) => [input.trick_id, input]));

  const trickIdsInStableOrder = Array.from(
    new Set([...previousTrickStates.keys(), ...nextTrickStates.keys()]),
  ).sort();

  for (const trickId of trickIdsInStableOrder) {
    const previousFlags = previousTrickStates.get(trickId);
    const nextFlags = nextTrickStates.get(trickId);

    if (nextFlags === undefined) {
      // Present before, absent now: the trick was fully deselected and
      // manually-unlock-removed in one diff.
      operations.push({ domain: 'profile', operationType: 'delete', recordId: trickId, payload: null });
      continue;
    }

    if (
      previousFlags === undefined ||
      previousFlags.isSelected !== nextFlags.isSelected ||
      previousFlags.isManuallyUnlocked !== nextFlags.isManuallyUnlocked
    ) {
      const input = nextTrickStateInputsByTrickId.get(trickId);
      if (input === undefined) continue; // unreachable: trickId came from nextTrickStates itself
      operations.push({
        domain: 'profile',
        operationType: 'upsert',
        recordId: trickId,
        payload: input as unknown as Record<string, unknown>,
      });
    }
  }

  return operations;
}

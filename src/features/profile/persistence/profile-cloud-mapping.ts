// T155.10: pure mapping + runtime response validation between `UserProfile`
// (plus its focused trick-selection/manual-unlock state) and the
// `profiles`/`user_trick_states` cloud rows. Explicitly does NOT wire into
// the provider, reducer, or any synchronization/diff logic -- see T157.3
// for deciding which trick-state rows to delete when a trick is
// deselected, and the profile-cloud-repository.ts header for why row
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
import type {
  ProfileRow,
  ProfileUpsertInput,
  UserTrickStateRow,
  UserTrickStateUpsertInput,
} from '@/features/profile/persistence/profile-cloud-repository';
import type { Json } from '@/shared/supabase/database-types';

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

export type ProfileScalarFields = Omit<UserProfile, 'selectedTrickIds' | 'manuallyUnlockedTrickIds'>;
export type TrickStateFields = Pick<UserProfile, 'selectedTrickIds' | 'manuallyUnlockedTrickIds'>;

export type ProfileRowMappingResult =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly issues: readonly ProfileMappingIssue[] }
  | { readonly status: 'valid'; readonly fields: ProfileScalarFields };

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
 * and no longer are -- that diff belongs to the future sync layer
 * (T157.3), not this mapping.
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

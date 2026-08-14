import type { LastSesh, UserProfile } from '@/features/profile/model/user-profile';
import { INITIAL_USER_PROFILE, isValidStreakThresholdMinutes } from '@/features/profile/model/user-profile';
import { isValidSeshTargetLandingCount, isValidTimedSeshMinutes } from '@/features/sesh/model/sesh';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const USER_PROFILE_STORAGE_KEY = 'daily-dama:user-profile';
export const USER_PROFILE_SCHEMA_VERSION = 1;

interface UserProfileDocumentV1 {
  readonly version: typeof USER_PROFILE_SCHEMA_VERSION;
  readonly profile: UserProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.length > 0) &&
    new Set(value).size === value.length
  );
}

function isKenteiRank(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12;
}

function isLastSesh(value: unknown): value is LastSesh {
  if (!isRecord(value)) return false;

  const { trickId, plan } = value;
  if (typeof trickId !== 'string' || trickId.length === 0 || !isRecord(plan)) return false;

  if (plan.kind === 'openEnded') {
    const keys = Object.keys(plan);
    if (keys.length === 1) return true;
    return (
      keys.length === 2 &&
      'targetLandingCount' in plan &&
      isValidSeshTargetLandingCount(Number(plan.targetLandingCount))
    );
  }
  if (plan.kind === 'timed') {
    return isValidTimedSeshMinutes(Number(plan.durationMinutes)) && Object.keys(plan).length === 2;
  }
  return false;
}

function isStreakThresholdMs(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value % 60_000 === 0 &&
    isValidStreakThresholdMinutes(value / 60_000)
  );
}

function parseUserProfile(value: unknown): UserProfile | undefined {
  if (!isRecord(value)) return undefined;

  const {
    hasCompletedOnboarding,
    kenteiRank,
    selectedTrickIds,
    lastSesh,
    streakThresholdMs,
    manuallyUnlockedTrickIds,
  } = value;
  if (typeof hasCompletedOnboarding !== 'boolean' || !isStringArray(selectedTrickIds)) {
    return undefined;
  }
  if (lastSesh !== undefined && !isLastSesh(lastSesh)) return undefined;
  if (streakThresholdMs !== undefined && !isStreakThresholdMs(streakThresholdMs)) return undefined;
  if (manuallyUnlockedTrickIds !== undefined && !isStringArray(manuallyUnlockedTrickIds)) {
    return undefined;
  }

  const lastSeshField = lastSesh === undefined ? {} : { lastSesh: lastSesh as LastSesh };
  const streakThresholdField =
    streakThresholdMs === undefined ? {} : { streakThresholdMs: streakThresholdMs as number };
  const manuallyUnlockedTrickIdsField =
    manuallyUnlockedTrickIds === undefined
      ? {}
      : { manuallyUnlockedTrickIds: manuallyUnlockedTrickIds as string[] };

  if (hasCompletedOnboarding) {
    if (!isKenteiRank(kenteiRank)) return undefined;
    return {
      hasCompletedOnboarding,
      kenteiRank,
      selectedTrickIds,
      ...lastSeshField,
      ...streakThresholdField,
      ...manuallyUnlockedTrickIdsField,
    };
  }

  if (kenteiRank !== undefined) return undefined;
  return {
    hasCompletedOnboarding,
    selectedTrickIds,
    ...lastSeshField,
    ...streakThresholdField,
    ...manuallyUnlockedTrickIdsField,
  };
}

export function serializeUserProfile(profile: UserProfile) {
  const document: UserProfileDocumentV1 = {
    version: USER_PROFILE_SCHEMA_VERSION,
    profile,
  };
  return JSON.stringify(document);
}

export function deserializeUserProfile(serialized: string): UserProfile | undefined {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (!isRecord(document) || document.version !== USER_PROFILE_SCHEMA_VERSION) {
    return undefined;
  }

  return parseUserProfile(document.profile);
}

export async function loadUserProfile(
  storage: KeyValueStorage,
): Promise<PersistenceLoadResult<UserProfile>> {
  try {
    const serialized = await storage.getItem(USER_PROFILE_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: INITIAL_USER_PROFILE };

    const profile = deserializeUserProfile(serialized);
    if (profile) return { status: 'loaded', value: profile };

    return {
      status: 'recovered',
      value: INITIAL_USER_PROFILE,
      error: new Error('The persisted user profile is malformed or uses an unsupported version.'),
    };
  } catch (error) {
    return { status: 'recovered', value: INITIAL_USER_PROFILE, error };
  }
}

export async function saveUserProfile(
  storage: KeyValueStorage,
  profile: UserProfile,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(USER_PROFILE_STORAGE_KEY, serializeUserProfile(profile));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

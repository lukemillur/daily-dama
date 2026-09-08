import { describe, expect, it } from '@jest/globals';

import type { UserProfile } from '@/features/profile/model/user-profile';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import {
  composeUserProfileFromCloudRows,
  diffProfileForOutboxOperations,
  mapProfileRowToDomainFields,
  mapTrickStateRowsToDomainFields,
  mapUserProfileToProfileUpsertInput,
  mapUserProfileToTrickStateUpsertInputs,
} from '@/features/profile/persistence/profile-cloud-mapping';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TIMESTAMP_MS = Date.parse(TIMESTAMP);

function makeProfileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: USER_ID,
    has_completed_onboarding: false,
    kentei_rank: null,
    last_sesh: null,
    revision: 1,
    streak_threshold_ms: null,
    theme_accent_color: null,
    theme_background_color: null,
    theme_text_color: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function makeTrickStateRow(overrides: Partial<UserTrickStateRow> = {}): UserTrickStateRow {
  return {
    id: `row-${overrides.trick_id ?? 'default'}`,
    user_id: USER_ID,
    trick_id: 'trick-1',
    is_selected: true,
    is_manually_unlocked: false,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze((value as Record<string, unknown>)[key]);
    });
    Object.freeze(value);
  }
  return value;
}

/** Splices a `mapUserProfileToProfileUpsertInput` result into a full row fixture. */
function toProfileRow(profile: UserProfile): ProfileRow {
  const input = mapUserProfileToProfileUpsertInput(profile, USER_ID);
  return {
    user_id: input.user_id,
    has_completed_onboarding: input.has_completed_onboarding ?? false,
    kentei_rank: input.kentei_rank ?? null,
    last_sesh: input.last_sesh ?? null,
    streak_threshold_ms: input.streak_threshold_ms ?? null,
    theme_background_color: input.theme_background_color ?? null,
    theme_accent_color: input.theme_accent_color ?? null,
    theme_text_color: input.theme_text_color ?? null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };
}

/** Splices `mapUserProfileToTrickStateUpsertInputs` results into row fixtures. */
function toTrickStateRows(profile: UserProfile): UserTrickStateRow[] {
  return mapUserProfileToTrickStateUpsertInputs(profile, USER_ID).map((input, index) => ({
    id: `row-${index}`,
    user_id: input.user_id,
    trick_id: input.trick_id,
    is_selected: input.is_selected ?? false,
    is_manually_unlocked: input.is_manually_unlocked ?? false,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  }));
}

function expectRoundTrip(profile: UserProfile) {
  const profileRow = toProfileRow(profile);
  const trickStateRows = toTrickStateRows(profile);

  const result = composeUserProfileFromCloudRows(profileRow, trickStateRows, USER_ID);

  expect(result).toEqual({
    status: 'valid',
    profile: {
      ...profile,
      manuallyUnlockedTrickIds: profile.manuallyUnlockedTrickIds ?? [],
      updatedAt: TIMESTAMP_MS,
    },
  });
}

describe('round-trip: domain -> rows -> domain', () => {
  it('round-trips an INITIAL_USER_PROFILE-shaped profile', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
    });
  });

  it('round-trips a fully onboarded minimal profile', () => {
    expectRoundTrip({
      hasCompletedOnboarding: true,
      kenteiRank: 1,
      selectedTrickIds: ['trick-1'],
    });
  });

  it('round-trips a fully onboarded profile with every optional field populated', () => {
    expectRoundTrip({
      hasCompletedOnboarding: true,
      kenteiRank: 12,
      selectedTrickIds: ['trick-1', 'trick-2', 'trick-3'],
      manuallyUnlockedTrickIds: ['trick-2', 'trick-4'],
      lastSesh: { trickId: 'trick-1', plan: { kind: 'openEnded' } },
      streakThresholdMs: 300_000,
      themeBackgroundColor: '#AaBbCc',
      themeAccentColor: '#112233',
      themeTextColor: '#FfFfFf',
    });
  });

  it('round-trips streak_threshold_ms at the lower boundary (60000)', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      streakThresholdMs: 60_000,
    });
  });

  it('round-trips streak_threshold_ms at the upper boundary (3600000)', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      streakThresholdMs: 3_600_000,
    });
  });

  it('round-trips an open-ended lastSesh with targetLandingCount at the lower boundary', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      lastSesh: { trickId: 'trick-1', plan: { kind: 'openEnded', targetLandingCount: 1 } },
    });
  });

  it('round-trips an open-ended lastSesh with targetLandingCount at the upper boundary', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      lastSesh: { trickId: 'trick-1', plan: { kind: 'openEnded', targetLandingCount: 999 } },
    });
  });

  it('round-trips a timed lastSesh with durationMinutes at the lower boundary', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      lastSesh: { trickId: 'trick-1', plan: { kind: 'timed', durationMinutes: 1 } },
    });
  });

  it('round-trips a timed lastSesh with durationMinutes at the upper boundary', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      lastSesh: { trickId: 'trick-1', plan: { kind: 'timed', durationMinutes: 60 } },
    });
  });

  it('round-trips a non-empty selectedTrickIds with a canonical empty manuallyUnlockedTrickIds', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: ['trick-1', 'trick-2'],
      manuallyUnlockedTrickIds: [],
    });
  });

  it('round-trips a non-empty manuallyUnlockedTrickIds with an empty selectedTrickIds', () => {
    expectRoundTrip({
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: ['trick-1', 'trick-2'],
    });
  });

  it('round-trips both standard-trick-id and custom-trick-id-shaped strings', () => {
    expectRoundTrip({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
      selectedTrickIds: ['kentei-1-1', 'custom-8f2c1a3b-9d4e-4f01-8b2a-1c3d5e7f9a0b'],
      manuallyUnlockedTrickIds: ['kentei-2-3'],
    });
  });
});

describe('mapProfileRowToDomainFields: malformed rows', () => {
  it.each([0, 13, 1.5])('rejects kentei_rank = %s', (kenteiRank) => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({ has_completed_onboarding: true, kentei_rank: kenteiRank }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'kentei_rank')).toBe(true);
  });

  it('rejects has_completed_onboarding: true with kentei_rank: null', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({ has_completed_onboarding: true, kentei_rank: null }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'kentei_rank' && issue.reason === 'invariantViolation'),
    ).toBe(true);
  });

  it('rejects has_completed_onboarding: false with kentei_rank: 5', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({ has_completed_onboarding: false, kentei_rank: 5 }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'kentei_rank' && issue.reason === 'invariantViolation'),
    ).toBe(true);
  });

  it('rejects a non-boolean has_completed_onboarding', () => {
    const row = makeProfileRow({ has_completed_onboarding: 1 as unknown as boolean });
    const result = mapProfileRowToDomainFields(row, USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'has_completed_onboarding' && issue.reason === 'wrongType'),
    ).toBe(true);
  });

  it.each([90_000, 30_000, 3_660_000])('rejects streak_threshold_ms = %s', (streakThresholdMs) => {
    const result = mapProfileRowToDomainFields(makeProfileRow({ streak_threshold_ms: streakThresholdMs }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'streak_threshold_ms' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });

  it.each<['theme_background_color' | 'theme_accent_color' | 'theme_text_color', string]>([
    ['theme_background_color', 'AABBCC'],
    ['theme_accent_color', '#ABC'],
    ['theme_text_color', '#GGHHII'],
  ])('rejects a malformed %s', (field, value) => {
    const result = mapProfileRowToDomainFields(makeProfileRow({ [field]: value }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.path === field && issue.reason === 'malformedShape'),
    ).toBe(true);
  });

  it('rejects a last_sesh missing trickId', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({ last_sesh: { plan: { kind: 'openEnded' } } as unknown as ProfileRow['last_sesh'] }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'last_sesh')).toBe(true);
  });

  it('rejects a last_sesh with a missing plan.kind', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({
        last_sesh: { trickId: 'trick-1', plan: {} } as unknown as ProfileRow['last_sesh'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
  });

  it('rejects a last_sesh with an unknown plan.kind', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({
        last_sesh: { trickId: 'trick-1', plan: { kind: 'unknown' } } as unknown as ProfileRow['last_sesh'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
  });

  it('rejects a last_sesh plan with an extra unrecognized key', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({
        last_sesh: {
          trickId: 'trick-1',
          plan: { kind: 'openEnded', extra: true },
        } as unknown as ProfileRow['last_sesh'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
  });

  it('rejects a last_sesh with targetLandingCount out of range', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({
        last_sesh: {
          trickId: 'trick-1',
          plan: { kind: 'openEnded', targetLandingCount: 1000 },
        } as unknown as ProfileRow['last_sesh'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
  });

  it('rejects a last_sesh with durationMinutes out of range', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({
        last_sesh: {
          trickId: 'trick-1',
          plan: { kind: 'timed', durationMinutes: 61 },
        } as unknown as ProfileRow['last_sesh'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
  });

  it('collects multiple simultaneous issues rather than failing fast', () => {
    const result = mapProfileRowToDomainFields(
      makeProfileRow({ kentei_rank: 13, streak_threshold_ms: 90_000 }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.path === 'kentei_rank'),
    ).toBe(true);
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.path === 'streak_threshold_ms'),
    ).toBe(true);
  });
});

describe('partial rows', () => {
  it('rejects trick-state rows existing without an owning profile row', () => {
    const result = composeUserProfileFromCloudRows(null, [makeTrickStateRow()], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'profile')).toBe(true);
  });

  it('rejects a trick-state row with both is_selected and is_manually_unlocked false', () => {
    const result = mapTrickStateRowsToDomainFields(
      [makeTrickStateRow({ is_selected: false, is_manually_unlocked: false })],
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'invariantViolation'),
    ).toBe(true);
  });

  it('rejects a trick-state row with an empty trick_id', () => {
    const result = mapTrickStateRowsToDomainFields([makeTrickStateRow({ trick_id: '' })], USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'malformedShape'),
    ).toBe(true);
  });
});

describe('foreign-user rows', () => {
  it('rejects a profile row belonging to a different user', () => {
    const result = mapProfileRowToDomainFields(makeProfileRow({ user_id: OTHER_USER_ID }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.path === 'user_id' && issue.reason === 'foreignUser'),
    ).toBe(true);
  });

  it('does not fall through to trick-state rows when the profile row is foreign', () => {
    const result = composeUserProfileFromCloudRows(
      makeProfileRow({ user_id: OTHER_USER_ID, has_completed_onboarding: true, kentei_rank: 'not-a-rank' as unknown as number }),
      [],
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.length === 1 &&
        result.issues[0].reason === 'foreignUser',
    ).toBe(true);
  });

  it('rejects the whole trick-state batch when one row belongs to a different user', () => {
    const result = mapTrickStateRowsToDomainFields(
      [makeTrickStateRow({ trick_id: 'trick-1' }), makeTrickStateRow({ trick_id: 'trick-2', user_id: OTHER_USER_ID })],
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'foreignUser'),
    ).toBe(true);
  });
});

describe('duplicate trick-state identity', () => {
  it('rejects two rows sharing the same trick_id', () => {
    const result = mapTrickStateRowsToDomainFields(
      [
        makeTrickStateRow({ id: 'row-a', trick_id: 'trick-1' }),
        makeTrickStateRow({ id: 'row-b', trick_id: 'trick-1' }),
      ],
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'duplicateTrickId'),
    ).toBe(true);
  });
});

describe('explicit absence', () => {
  it('composeUserProfileFromCloudRows reports absence when there is no profile row and no trick-state rows', () => {
    expect(composeUserProfileFromCloudRows(null, [], USER_ID)).toEqual({ status: 'absent' });
  });

  it('mapProfileRowToDomainFields reports absence for a null row', () => {
    expect(mapProfileRowToDomainFields(null, USER_ID)).toEqual({ status: 'absent' });
  });
});

describe('no input mutation', () => {
  it('does not mutate a frozen UserProfile passed to the domain -> row mappers', () => {
    const profile = deepFreeze<UserProfile>({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
      selectedTrickIds: ['trick-1', 'trick-2'],
      manuallyUnlockedTrickIds: ['trick-2'],
      lastSesh: { trickId: 'trick-1', plan: { kind: 'timed', durationMinutes: 10 } },
      streakThresholdMs: 300_000,
      themeBackgroundColor: '#AABBCC',
    });
    const before = JSON.stringify(profile);

    expect(() => mapUserProfileToProfileUpsertInput(profile, USER_ID)).not.toThrow();
    expect(() => mapUserProfileToTrickStateUpsertInputs(profile, USER_ID)).not.toThrow();

    expect(JSON.stringify(profile)).toBe(before);
  });

  it('does not mutate frozen ProfileRow/UserTrickStateRow inputs passed to composeUserProfileFromCloudRows', () => {
    const profileRow = deepFreeze<ProfileRow>(
      makeProfileRow({ has_completed_onboarding: true, kentei_rank: 3 }),
    );
    const trickStateRows = deepFreeze<UserTrickStateRow[]>([makeTrickStateRow({ trick_id: 'trick-1' })]);
    const profileRowBefore = JSON.stringify(profileRow);
    const trickStateRowsBefore = JSON.stringify(trickStateRows);

    expect(() => composeUserProfileFromCloudRows(profileRow, trickStateRows, USER_ID)).not.toThrow();

    expect(JSON.stringify(profileRow)).toBe(profileRowBefore);
    expect(JSON.stringify(trickStateRows)).toBe(trickStateRowsBefore);
  });
});

describe('diffProfileForOutboxOperations', () => {
  const BASE: UserProfile = { hasCompletedOnboarding: false, selectedTrickIds: [] };

  it('emits no operations when nothing relevant changed', () => {
    const ops = diffProfileForOutboxOperations(BASE, { ...BASE }, USER_ID);
    expect(ops).toEqual([]);
  });

  it('emits a scalar-only upsert when only a scalar field changed', () => {
    const next: UserProfile = { ...BASE, hasCompletedOnboarding: true, kenteiRank: 5 };
    const ops = diffProfileForOutboxOperations(BASE, next, USER_ID);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ domain: 'profile', operationType: 'upsert', recordId: USER_ID });
    expect(ops[0].payload).toMatchObject({ has_completed_onboarding: true, kentei_rank: 5 });
  });

  it('emits an upsert when a trick is added', () => {
    const next: UserProfile = { ...BASE, selectedTrickIds: ['trick-1'] };
    const ops = diffProfileForOutboxOperations(BASE, next, USER_ID);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ domain: 'profile', operationType: 'upsert', recordId: 'trick-1' });
    expect(ops[0].payload).toMatchObject({ trick_id: 'trick-1', is_selected: true, is_manually_unlocked: false });
  });

  it('emits a delete when a trick is removed entirely', () => {
    const previous: UserProfile = { ...BASE, selectedTrickIds: ['trick-1'] };
    const next: UserProfile = { ...BASE, selectedTrickIds: [] };
    const ops = diffProfileForOutboxOperations(previous, next, USER_ID);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ domain: 'profile', operationType: 'delete', recordId: 'trick-1', payload: null });
  });

  it('emits an upsert when a trick flag changes without full removal', () => {
    const previous: UserProfile = { ...BASE, selectedTrickIds: ['trick-1'] };
    const next: UserProfile = { ...BASE, selectedTrickIds: [], manuallyUnlockedTrickIds: ['trick-1'] };
    const ops = diffProfileForOutboxOperations(previous, next, USER_ID);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ domain: 'profile', operationType: 'upsert', recordId: 'trick-1' });
    expect(ops[0].payload).toMatchObject({ is_selected: false, is_manually_unlocked: true });
  });

  it('handles a batch of several trick ids and scalar changes at once, with a stable, deterministic op order', () => {
    const previous: UserProfile = {
      ...BASE,
      selectedTrickIds: ['trick-b', 'trick-c'],
      manuallyUnlockedTrickIds: [],
    };
    const next: UserProfile = {
      ...BASE,
      hasCompletedOnboarding: true,
      kenteiRank: 3,
      selectedTrickIds: ['trick-a', 'trick-b'],
      manuallyUnlockedTrickIds: ['trick-d'],
    };
    // trick-a: added (upsert). trick-b: unchanged (selected both times, no op).
    // trick-c: removed entirely (delete). trick-d: added via manual unlock (upsert).
    const ops = diffProfileForOutboxOperations(previous, next, USER_ID);

    expect(ops.map((op) => ({ recordId: op.recordId, operationType: op.operationType }))).toEqual([
      { recordId: USER_ID, operationType: 'upsert' },
      { recordId: 'trick-a', operationType: 'upsert' },
      { recordId: 'trick-c', operationType: 'delete' },
      { recordId: 'trick-d', operationType: 'upsert' },
    ]);
  });
});

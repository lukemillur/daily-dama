import { describe, expect, it } from '@jest/globals';

import { INITIAL_USER_PROFILE, userProfileReducer } from '@/features/profile/model/user-profile';

describe('user profile trick selection', () => {
  it('selects and deselects a custom trick by its stable identifier', () => {
    const selected = userProfileReducer(INITIAL_USER_PROFILE, {
      type: 'selectedTrickToggled',
      trickId: 'custom-stable-id',
    });
    const deselected = userProfileReducer(selected, {
      type: 'selectedTrickToggled',
      trickId: 'custom-stable-id',
    });

    expect(selected.selectedTrickIds).toEqual(['custom-stable-id']);
    expect(deselected.selectedTrickIds).toEqual([]);
  });

  it('removes a deleted custom trick without affecting other selections', () => {
    const state = {
      ...INITIAL_USER_PROFILE,
      selectedTrickIds: ['big-cup', 'custom-delete', 'airplane'],
    };

    expect(
      userProfileReducer(state, {
        type: 'selectedTrickRemoved',
        trickId: 'custom-delete',
      }).selectedTrickIds,
    ).toEqual(['big-cup', 'airplane']);
  });

  it('caches and overwrites the last specified sesh', () => {
    const firstSesh = userProfileReducer(INITIAL_USER_PROFILE, {
      type: 'lastSeshUpdated',
      lastSesh: { trickId: 'big-cup', plan: { kind: 'timed', durationMinutes: 5 } },
    });
    expect(firstSesh.lastSesh).toEqual({
      trickId: 'big-cup',
      plan: { kind: 'timed', durationMinutes: 5 },
    });

    const secondSesh = userProfileReducer(firstSesh, {
      type: 'lastSeshUpdated',
      lastSesh: { trickId: 'airplane', plan: { kind: 'openEnded' } },
    });
    expect(secondSesh.lastSesh).toEqual({ trickId: 'airplane', plan: { kind: 'openEnded' } });
  });

  it('overwrites the streak threshold on update', () => {
    const updated = userProfileReducer(INITIAL_USER_PROFILE, {
      type: 'streakThresholdUpdated',
      thresholdMs: 300_000,
    });
    expect(updated.streakThresholdMs).toBe(300_000);

    const overwritten = userProfileReducer(updated, {
      type: 'streakThresholdUpdated',
      thresholdMs: 60_000,
    });
    expect(overwritten.streakThresholdMs).toBe(60_000);
  });

  it('toggles a manual unlock flag on and off', () => {
    const set = userProfileReducer(INITIAL_USER_PROFILE, {
      type: 'manualUnlockToggled',
      trickId: 'big-cup',
    });
    expect(set.manuallyUnlockedTrickIds).toEqual(['big-cup']);

    const cleared = userProfileReducer(set, {
      type: 'manualUnlockToggled',
      trickId: 'big-cup',
    });
    expect(cleared.manuallyUnlockedTrickIds).toEqual([]);
  });

  it('removes a manual unlock flag without affecting other flagged tricks', () => {
    const state = {
      ...INITIAL_USER_PROFILE,
      manuallyUnlockedTrickIds: ['big-cup', 'custom-delete', 'airplane'],
    };

    expect(
      userProfileReducer(state, {
        type: 'manualUnlockRemoved',
        trickId: 'custom-delete',
      }).manuallyUnlockedTrickIds,
    ).toEqual(['big-cup', 'airplane']);
  });

  it('seeds manuallyUnlockedTrickIds from lacedTrickIds when none existed before', () => {
    const result = userProfileReducer(INITIAL_USER_PROFILE, {
      type: 'onboardingCompleted',
      kenteiRank: 4,
      selectedTrickIds: ['big-cup'],
      lacedTrickIds: ['trick-a', 'trick-b'],
    });

    expect(result.manuallyUnlockedTrickIds).toEqual(['trick-a', 'trick-b']);
  });

  it('unions lacedTrickIds with a pre-existing manuallyUnlockedTrickIds instead of clobbering it', () => {
    const state = { ...INITIAL_USER_PROFILE, manuallyUnlockedTrickIds: ['existing-trick'] };

    const result = userProfileReducer(state, {
      type: 'onboardingCompleted',
      kenteiRank: 4,
      selectedTrickIds: ['big-cup'],
      lacedTrickIds: ['trick-a'],
    });

    expect(result.manuallyUnlockedTrickIds).toEqual(['existing-trick', 'trick-a']);
  });

  it('de-duplicates when lacedTrickIds overlaps existing manuallyUnlockedTrickIds', () => {
    const state = { ...INITIAL_USER_PROFILE, manuallyUnlockedTrickIds: ['trick-a', 'existing-trick'] };

    const result = userProfileReducer(state, {
      type: 'onboardingCompleted',
      kenteiRank: 4,
      selectedTrickIds: ['big-cup'],
      lacedTrickIds: ['trick-a', 'trick-b'],
    });

    expect(result.manuallyUnlockedTrickIds).toEqual(['trick-a', 'existing-trick', 'trick-b']);
  });

  it('preserves the current practice list while an assessment is being retaken', () => {
    const completedProfile = {
      hasCompletedOnboarding: true,
      kenteiRank: 4,
      selectedTrickIds: ['big-cup', 'custom-morning-line'],
    } as const;

    expect(
      userProfileReducer(completedProfile, { type: 'onboardingRestarted' }),
    ).toEqual({
      hasCompletedOnboarding: false,
      kenteiRank: undefined,
      selectedTrickIds: ['big-cup', 'custom-morning-line'],
    });
  });

  it('advances the assessed Kentei rank', () => {
    const state = { ...INITIAL_USER_PROFILE, kenteiRank: 1 };

    expect(
      userProfileReducer(state, { type: 'kenteiRankAdvanced', rank: 2 }).kenteiRank,
    ).toBe(2);
  });

  it('is a no-op when advancing to the already-current rank', () => {
    const state = { ...INITIAL_USER_PROFILE, kenteiRank: 3 };
    const result = userProfileReducer(state, { type: 'kenteiRankAdvanced', rank: 3 });

    expect(result).toBe(state);
  });
});

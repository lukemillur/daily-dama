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
});

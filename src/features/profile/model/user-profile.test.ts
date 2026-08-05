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
});

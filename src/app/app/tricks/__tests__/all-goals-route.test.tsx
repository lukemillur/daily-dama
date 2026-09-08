import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import AllGoalsRoute from '@/app/app/tricks/goals';

const mockRouter = { replace: jest.fn() };
const mockRenderedProps: {
  tricks?: readonly { readonly id: string; readonly name: string }[];
  focusedTrickIds?: readonly string[];
} = {};

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
}));
jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  useCustomTricks: () => ({ tricks: [{ id: 'custom-one', name: 'Custom one', kind: 'standalone' }] }),
}));
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({ selectedTrickIds: ['standard-one', 'custom-one'] }),
}));
jest.mock('@/features/goals/components/all-trick-goals-screen', () => ({
  AllTrickGoalsScreen: (props: typeof mockRenderedProps) => {
    mockRenderedProps.tricks = props.tricks;
    mockRenderedProps.focusedTrickIds = props.focusedTrickIds;
    return null;
  },
}));

describe('AllGoalsRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRenderedProps.tricks = undefined;
    mockRenderedProps.focusedTrickIds = undefined;
  });

  it('passes persisted profile focus separately from the authoritative directory input', () => {
    act(() => {
      create(<AllGoalsRoute />);
    });

    expect(mockRenderedProps.focusedTrickIds).toEqual(['standard-one', 'custom-one']);
    expect(mockRenderedProps.tricks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'custom-one', name: 'Custom one', customKind: 'standalone' }),
      ]),
    );
  });
});

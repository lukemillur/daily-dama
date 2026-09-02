import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import AccountDeletionRoute from '@/app/app/profile/account/delete';

const mockScreen = jest.fn(() => null);
let mockIsOnboardingComplete = true;

jest.mock('@/features/auth/components/account-deletion-screen', () => ({
  AccountDeletionScreen: () => mockScreen(),
}));
jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => mockIsOnboardingComplete,
}));

describe('AccountDeletionRoute', () => {
  it('renders the deletion screen only after onboarding is complete', () => {
    mockIsOnboardingComplete = true;
    act(() => {
      create(<AccountDeletionRoute />);
    });
    expect(mockScreen).toHaveBeenCalledTimes(1);

    mockScreen.mockClear();
    mockIsOnboardingComplete = false;
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<AccountDeletionRoute />);
    });
    expect(root.toJSON()).toBeNull();
    expect(mockScreen).not.toHaveBeenCalled();
  });
});

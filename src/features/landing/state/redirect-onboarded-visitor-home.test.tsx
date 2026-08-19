import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { useRedirectOnboardedVisitorHome } from '@/features/landing/state/redirect-onboarded-visitor-home';
import type { UserProfile } from '@/features/profile/model/user-profile';

const mockRouter = { replace: jest.fn() };
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

const mockUseUserProfile = jest.fn<() => UserProfile>();
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

function HookHost({ onResult }: { onResult: (result: boolean) => void }) {
  const result = useRedirectOnboardedVisitorHome();
  onResult(result);
  return <Text>{String(result)}</Text>;
}

function mountHook() {
  let latest: boolean | undefined;
  act(() => {
    create(<HookHost onResult={(result) => { latest = result; }} />);
  });
  return latest as boolean;
}

beforeEach(() => {
  mockRouter.replace.mockClear();
  mockUseUserProfile.mockReset();
  mockSearchParams = {};
});

describe('useRedirectOnboardedVisitorHome', () => {
  it('redirects a fresh arrival to /app/home when onboarding is complete', () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });

    const result = mountHook();

    expect(result).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/home');
  });

  it('skips the redirect when the in-app arrival signal is present', () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });
    mockSearchParams = { from: 'app' };

    const result = mountHook();

    expect(result).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('never redirects when onboarding is incomplete, regardless of the signal', () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: false,
      kenteiRank: undefined,
    });
    mockSearchParams = { from: 'app' };

    const result = mountHook();

    expect(result).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

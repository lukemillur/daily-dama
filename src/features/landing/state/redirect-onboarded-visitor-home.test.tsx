import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

import { useRedirectOnboardedVisitorHome } from '@/features/landing/state/redirect-onboarded-visitor-home';
import type { CachedOnboardingStatus } from '@/features/profile/persistence/read-cached-onboarding-status';

const mockRouter = { replace: jest.fn() };
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

const mockUseCachedOnboardingStatus = jest.fn<() => CachedOnboardingStatus>();
jest.mock('@/features/landing/state/use-cached-onboarding-status', () => ({
  useCachedOnboardingStatus: () => mockUseCachedOnboardingStatus(),
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
  mockUseCachedOnboardingStatus.mockReset();
  mockSearchParams = {};
});

describe('useRedirectOnboardedVisitorHome', () => {
  it('redirects a fresh arrival to /app/home when onboarding is complete', () => {
    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });

    const result = mountHook();

    expect(result).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/home');
  });

  it('skips the redirect when the in-app arrival signal is present', () => {
    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });
    mockSearchParams = { from: 'app' };

    const result = mountHook();

    expect(result).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('never redirects when onboarding is incomplete, regardless of the signal', () => {
    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: false,
      kenteiRank: undefined,
    });
    mockSearchParams = { from: 'app' };

    const result = mountHook();

    expect(result).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

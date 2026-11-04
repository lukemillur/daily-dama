import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';

import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import type { NativeStartDecision } from '../model/resolve-native-start-route';
import { useNativeStartRoute } from './use-native-start-route';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

function profile(overrides: object) {
  return JSON.stringify({
    version: 1,
    profile: { hasCompletedOnboarding: false, selectedTrickIds: [], ...overrides },
  });
}

async function renderDecision(): Promise<NativeStartDecision[]> {
  const seen: NativeStartDecision[] = [];
  function Probe() {
    seen.push(useNativeStartRoute());
    return null;
  }
  await act(async () => {
    create(<Probe />);
  });
  return seen;
}

describe('useNativeStartRoute', () => {
  beforeEach(async () => {
    mockReplace.mockClear();
    await AsyncStorage.clear();
  });

  it('is loading first, then shows Start on a fresh install without redirecting', async () => {
    const seen = await renderDecision();
    expect(seen[0]).toBe('loading');
    expect(seen.at(-1)).toBe('show-start');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects a completed onboarding to Home and never shows Start', async () => {
    await AsyncStorage.setItem(KEY, profile({ hasCompletedOnboarding: true, kenteiRank: 2 }));
    const seen = await renderDecision();
    expect(seen).not.toContain('show-start');
    expect(seen.at(-1)).toBe('redirect-home');
    expect(mockReplace).toHaveBeenCalledWith('/app/home');
  });

  it('shows Start when the storage read rejects', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('boom'));
    const seen = await renderDecision();
    expect(seen.at(-1)).toBe('show-start');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

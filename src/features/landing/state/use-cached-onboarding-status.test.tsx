import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
// See landing-page.test.tsx for why a CommonJS require (rather than `import * as ReactNative`)
// is needed to mutate Platform.OS in a way LandingPage's own import sees.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native') as typeof import('react-native');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import { useCachedOnboardingStatus } from './use-cached-onboarding-status';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

function validDocument(hasCompletedOnboarding: boolean, kenteiRank?: number): string {
  return JSON.stringify({
    version: 1,
    profile: {
      hasCompletedOnboarding,
      selectedTrickIds: [],
      ...(kenteiRank !== undefined ? { kenteiRank } : {}),
    },
  });
}

function HookHost({
  onResult,
}: {
  onResult: (result: ReturnType<typeof useCachedOnboardingStatus>) => void;
}) {
  const result = useCachedOnboardingStatus();
  onResult(result);
  return <Text>{String(result.hasCompletedOnboarding)}</Text>;
}

async function mountHook() {
  let latest: ReturnType<typeof useCachedOnboardingStatus> | undefined;
  await act(async () => {
    create(<HookHost onResult={(result) => { latest = result; }} />);
  });
  return latest!;
}

const originalPlatformOS = ReactNative.Platform.OS;

describe('useCachedOnboardingStatus (web)', () => {
  beforeEach(() => {
    ReactNative.Platform.OS = 'web';
    (globalThis as { window?: unknown }).window = globalThis;
  });

  afterEach(() => {
    ReactNative.Platform.OS = originalPlatformOS;
    delete (window as unknown as { localStorage?: unknown }).localStorage;
  });

  it('returns the default status when no value is cached', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: () => null },
      configurable: true,
    });

    const result = await mountHook();

    expect(result).toEqual({ hasCompletedOnboarding: false, kenteiRank: undefined });
  });

  it('returns the cached onboarding status synchronously on the first render', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: () => validDocument(true, 7) },
      configurable: true,
    });

    const result = await mountHook();

    expect(result).toEqual({ hasCompletedOnboarding: true, kenteiRank: 7 });
  });

  it('reads a fresh guest identity from the guest-scoped key even when a stale bare-key snapshot claims completed onboarding (post-logout)', async () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument(false),
      [USER_PROFILE_STORAGE_KEY]: validDocument(true, 6),
    };
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: (key: string) => store[key] ?? null },
      configurable: true,
    });

    const result = await mountHook();

    expect(result).toEqual({ hasCompletedOnboarding: false, kenteiRank: undefined });
  });
});

describe('useCachedOnboardingStatus (native)', () => {
  beforeEach(async () => {
    ReactNative.Platform.OS = 'ios';
    await AsyncStorage.clear();
  });

  afterEach(() => {
    ReactNative.Platform.OS = originalPlatformOS;
  });

  it('resolves the cached onboarding status via an async AsyncStorage read', async () => {
    await AsyncStorage.setItem(GUEST_SCOPED_KEY, validDocument(true, 3));

    const result = await mountHook();

    expect(result).toEqual({ hasCompletedOnboarding: true, kenteiRank: 3 });
  });

  it('returns the default status when nothing is cached', async () => {
    const result = await mountHook();

    expect(result).toEqual({ hasCompletedOnboarding: false, kenteiRank: undefined });
  });
});

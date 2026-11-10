import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { StatusBar } from 'expo-status-bar';
import * as ReactNative from 'react-native';
import { act, create } from 'react-test-renderer';

import AppShellLayout from '@/app/app/_layout';

type Children = { children?: React.ReactNode };
const passThrough = ({ children }: Children) => children;

let mockProfile: { hasCompletedOnboarding: boolean; themeBackgroundColor?: string } = {
  hasCompletedOnboarding: true,
};
let mockThemeBackground = '#fbdcd6';

jest.mock('expo-router', () => ({ usePathname: () => '/app/home' }));
jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));
jest.mock('@/components/app-tabs', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/local-durability-warning-banner', () => ({
  LocalDurabilityWarningBanner: () => null,
}));
jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  CustomTrickProvider: passThrough,
}));
jest.mock('@/features/goals/state/goal-provider', () => ({ GoalProvider: passThrough }));
jest.mock('@/features/notes/state/note-provider', () => ({ NoteProvider: passThrough }));
jest.mock('@/features/profile/components/app-theme-provider', () => ({
  AppThemeProvider: passThrough,
}));
jest.mock('@/features/profile/state/kentei-rank-auto-promotion', () => ({
  KenteiRankAutoPromotion: () => null,
}));
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  UserProfileProvider: passThrough,
  useUserProfile: () => mockProfile,
}));
jest.mock('@/features/profile/state/use-resolved-theme', () => ({
  useResolvedTheme: () => ({ background: mockThemeBackground }),
}));
jest.mock('@/features/stats/state/practice-history-provider', () => ({
  PracticeHistoryProvider: passThrough,
}));
jest.mock('@/shared/persistence/identity-provider', () => ({ IdentityProvider: passThrough }));
jest.mock('@/shared/splash/splash-ready', () => ({ HideSplashWhenMounted: () => null }));
jest.mock('@/shared/sync/sync-coordinator-provider', () => ({
  SyncCoordinatorProvider: passThrough,
}));

const originalPlatformOS = ReactNative.Platform.OS;

function mount() {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<AppShellLayout />);
  });
  return root;
}

describe('AppShellLayout status bar', () => {
  afterEach(() => {
    ReactNative.Platform.OS = originalPlatformOS;
  });

  it('mounts exactly one bar with dark icons on the pale Red theme and light on a dark theme', () => {
    ReactNative.Platform.OS = 'android';
    mockProfile = { hasCompletedOnboarding: true };

    mockThemeBackground = '#fbdcd6';
    const pale = mount();
    expect(pale.root.findAllByType(StatusBar)).toHaveLength(1);
    expect(pale.root.findByType(StatusBar).props.style).toBe('dark');

    mockThemeBackground = '#101820';
    expect(mount().root.findByType(StatusBar).props.style).toBe('light');
  });

  it('follows the onboarding page background before onboarding completes', () => {
    ReactNative.Platform.OS = 'android';
    mockThemeBackground = '#101820';
    mockProfile = { hasCompletedOnboarding: false };
    expect(mount().root.findByType(StatusBar).props.style).toBe('dark');
  });
});

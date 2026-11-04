import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';

import RootRoute from '@/app/index';

const mockUseRedirectOnboardedVisitorHome = jest.fn<() => boolean>();
const mockLandingPage = jest.fn(() => null);
const mockHead = jest.fn(() => null);
jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: () => mockHead(),
}));
jest.mock('@/features/landing/state/redirect-onboarded-visitor-home', () => ({
  useRedirectOnboardedVisitorHome: () => mockUseRedirectOnboardedVisitorHome(),
}));

const mockNativeStartRoute = jest.fn(() => null);
jest.mock('@/features/native-start/components/native-start-route', () => ({
  NativeStartRoute: () => mockNativeStartRoute(),
}));
jest.mock('@/features/landing/components/landing-page', () => ({ LandingPage: () => mockLandingPage() }));

describe('RootRoute', () => {
  beforeEach(() => {
    mockUseRedirectOnboardedVisitorHome.mockReset();
    mockLandingPage.mockClear();
    mockHead.mockClear();
    mockNativeStartRoute.mockClear();
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['ios', 'android', 'web'] as const)(
    'renders website metadata only on web (%s)',
    (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      mockUseRedirectOnboardedVisitorHome.mockReturnValue(false);

      act(() => {
        create(<RootRoute />);
      });

      const isWeb = platform === 'web';
      expect(mockHead).toHaveBeenCalledTimes(isWeb ? 1 : 0);
      expect(mockLandingPage).toHaveBeenCalledTimes(isWeb ? 1 : 0);
      expect(mockNativeStartRoute).toHaveBeenCalledTimes(isWeb ? 0 : 1);
      expect(mockUseRedirectOnboardedVisitorHome).toHaveBeenCalledTimes(isWeb ? 1 : 0);
    },
  );

  it('renders the landing-page boundary when no redirect is required', () => {
    mockUseRedirectOnboardedVisitorHome.mockReturnValue(false);

    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<RootRoute />);
    });

    expect(root.toJSON()).toBeNull();
    expect(mockLandingPage).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the redirect hook owns navigation', () => {
    mockUseRedirectOnboardedVisitorHome.mockReturnValue(true);

    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<RootRoute />);
    });

    expect(root.toJSON()).toBeNull();
  });
});

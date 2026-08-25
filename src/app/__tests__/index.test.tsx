import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import RootRoute from '@/app/index';

const mockUseRedirectOnboardedVisitorHome = jest.fn<() => boolean>();
const mockLandingPage = jest.fn(() => null);
jest.mock('@/features/landing/state/redirect-onboarded-visitor-home', () => ({
  useRedirectOnboardedVisitorHome: () => mockUseRedirectOnboardedVisitorHome(),
}));

jest.mock('@/features/landing/components/landing-page', () => ({ LandingPage: () => mockLandingPage() }));

describe('RootRoute', () => {
  beforeEach(() => {
    mockUseRedirectOnboardedVisitorHome.mockReset();
    mockLandingPage.mockClear();
  });

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

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';
import { networkFailure } from '@/features/auth/model/auth-test-fixtures';

import { LandingAuthCta } from '@/features/landing/components/landing-auth-cta';

let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };
const mockPush = jest.fn();
const mockSignOut = jest.fn<() => Promise<{ error: unknown }>>();
const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function findAllByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.props.accessibilityLabel === label);
}

function authenticatedState(): AuthState {
  return {
    status: 'authenticated',
    session: { access_token: 'tok', user: { email: 'someone@example.com' } } as never,
    lastEvent: 'SIGNED_IN',
  };
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<LandingAuthCta />);
  });
  return root;
}

describe('LandingAuthCta', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
  });

  it('renders nothing while initializing', async () => {
    mockAuthState = { status: 'initializing' };
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
    expect(findAllByLabel(root, 'Log out').length).toBe(0);
  });

  it('renders the Daily Dama header bar with a log out control when authenticated', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(findAllByLabel(root, 'Log out').length).toBeGreaterThan(0);
    expect(root.root.findAll((node) => node.props.children === 'Daily Dama').length).toBeGreaterThan(0);
    expect(root.root.findAllByProps({ testID: 'landing-header-bar' }).length).toBeGreaterThan(0);
    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
  });

  it('renders nothing during password recovery', async () => {
    mockAuthState = { status: 'passwordRecovery', session: { access_token: 'tok' } as never };
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
    expect(findAllByLabel(root, 'Log out').length).toBe(0);
  });

  it('renders Sign up and Sign in entry points for a guest', async () => {
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBeGreaterThan(0);
    expect(findAllByLabel(root, 'Sign in').length).toBeGreaterThan(0);
    expect(findAllByLabel(root, 'Log out').length).toBe(0);
  });

  it('navigates to /auth/sign-up on Sign up', async () => {
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Sign up').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/auth/sign-up');
  });

  it('navigates to /auth/sign-in on Sign in', async () => {
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Sign in').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('calls signOut exactly once when Log out is pressed', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Log out').props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows an in-flight state while signing out', async () => {
    mockAuthState = authenticatedState();
    let resolveSignOut!: (value: { error: null }) => void;
    mockSignOut.mockReturnValue(
      new Promise((resolve) => {
        resolveSignOut = resolve;
      }),
    );
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Log out').props.onPress();
    });

    const inFlightButton = findByLabel(root, 'Log out');
    expect(inFlightButton.props.children).toBe('Logging out...');
    expect(inFlightButton.props.disabled).toBe(true);

    await act(async () => {
      resolveSignOut({ error: null });
    });

    const settledButton = findByLabel(root, 'Log out');
    expect(settledButton.props.children).toBe('Log out');
    expect(settledButton.props.disabled).toBe(false);
  });

  it('shows an error and re-enables Log out when signOut fails', async () => {
    mockAuthState = authenticatedState();
    mockSignOut.mockResolvedValue({ error: networkFailure() as unknown as null });
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Log out').props.onPress();
    });

    expect(
      root.root.findAll(
        (node) => node.props.children === 'You are offline. Check your connection and try again.',
      ).length,
    ).toBeGreaterThan(0);
    const button = findByLabel(root, 'Log out');
    expect(button.props.children).toBe('Log out');
    expect(button.props.disabled).toBe(false);
  });
});

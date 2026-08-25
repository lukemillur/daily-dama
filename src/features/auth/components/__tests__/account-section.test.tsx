import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';
import { networkFailure } from '@/features/auth/model/auth-test-fixtures';

import { AccountSection } from '@/features/auth/components/account-section';

const mockSignOut = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ signOut: mockSignOut }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));

const EMAIL = 'someone@example.com';

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function findAllByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.props.accessibilityLabel === label);
}

function containsText(renderer: ReactTestRenderer, text: string | RegExp) {
  return (
    renderer.root.findAll((node) => {
      const { children } = node.props;
      if (typeof children !== 'string') return false;
      return typeof text === 'string' ? children === text : text.test(children);
    }).length > 0
  );
}

function authenticatedState(): AuthState {
  return {
    status: 'authenticated',
    session: { access_token: 'tok', user: { email: EMAIL } } as never,
    lastEvent: 'SIGNED_IN',
  };
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<AccountSection />);
  });
  return root;
}

async function pressLogOut(root: ReactTestRenderer) {
  const button = findByLabel(root, 'Log out');
  await act(async () => {
    await button.props.onPress();
  });
}

describe('AccountSection', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockPush.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
  });

  it('renders nothing while initializing', async () => {
    mockAuthState = { status: 'initializing' };
    const root = await mount();

    expect(findAllByLabel(root, 'Log out').length).toBe(0);
  });

  it('renders nothing when a guest', async () => {
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    const root = await mount();

    expect(findAllByLabel(root, 'Log out').length).toBe(0);
  });

  it('renders nothing during password recovery', async () => {
    mockAuthState = { status: 'passwordRecovery', session: { access_token: 'tok' } as never };
    const root = await mount();

    expect(findAllByLabel(root, 'Log out').length).toBe(0);
  });

  it('renders the account email and an enabled Log out button when authenticated', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(containsText(root, EMAIL)).toBe(true);
    const button = findByLabel(root, 'Log out');
    expect(button.props.disabled).toBe(false);
  });

  it('renders a Manage account security link when authenticated, and navigates to the security route', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    const link = findByLabel(root, 'Manage account security');
    await act(async () => {
      link.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/app/profile/account/security');
  });

  it('has no Manage account security link when not authenticated', async () => {
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    const root = await mount();

    expect(findAllByLabel(root, 'Manage account security').length).toBe(0);
  });

  it('falls back to a generic label when the session has no email', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: { access_token: 'tok', user: {} } as never,
      lastEvent: 'SIGNED_IN',
    };
    const root = await mount();

    expect(containsText(root, 'Your account')).toBe(true);
  });

  it('signs out successfully and re-enables the button, tracking log_out_success', async () => {
    mockAuthState = authenticatedState();
    mockSignOut.mockResolvedValue({ error: null });
    const root = await mount();

    await pressLogOut(root);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('log_out_success');
    const button = findByLabel(root, 'Log out');
    expect(button.props.disabled).toBe(false);
    expect(button.props.children).toBe('Log out');
  });

  it('surfaces a retryable offline error and does not fake a guest transition', async () => {
    mockAuthState = authenticatedState();
    mockSignOut.mockResolvedValue({ error: networkFailure() });
    const root = await mount();

    await pressLogOut(root);

    expect(containsText(root, /offline/i)).toBe(true);
    expect(mockLogAuthWarning).toHaveBeenCalledWith('Log out failed.', networkFailure());
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('log_out_error', 'offline');

    // The UI must not force its own guest transition -- it still reflects the authenticated
    // state its mocked hook was given, and the button is re-enabled so the user can retry.
    expect(containsText(root, EMAIL)).toBe(true);
    const button = findByLabel(root, 'Log out');
    expect(button.props.disabled).toBe(false);
  });

  it('shows generic copy for an unexpected non-offline error', async () => {
    mockAuthState = authenticatedState();
    mockSignOut.mockResolvedValue({ error: { message: 'server error' } });
    const root = await mount();

    await pressLogOut(root);

    expect(containsText(root, 'Something went wrong. Please try again.')).toBe(true);
  });

  it('never renders a raw error message', async () => {
    mockAuthState = authenticatedState();
    mockSignOut.mockResolvedValue({ error: { message: 'some raw supabase detail' } });
    const root = await mount();

    await pressLogOut(root);

    expect(containsText(root, 'some raw supabase detail')).toBe(false);
  });

  it('guards against a repeat press firing signOut twice', async () => {
    mockAuthState = authenticatedState();
    let resolveFirst!: (value: { error: unknown }) => void;
    mockSignOut.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const root = await mount();

    const button = findByLabel(root, 'Log out');
    await act(async () => {
      button.props.onPress();
      await button.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ error: null });
    });
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';

import { SignInScreen } from '@/features/auth/components/sign-in-screen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native') as typeof import('react-native');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { CachedAppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);
const originalPlatformOS = ReactNative.Platform.OS;

function seedGuestProfile(overrides: { themeBackgroundColor?: string; themeAccentColor?: string }) {
  return JSON.stringify({
    version: 1,
    profile: { hasCompletedOnboarding: false, selectedTrickIds: [], ...overrides },
  });
}

// Mirrors resolvedButtonRootStyle from button.test.tsx: styled-components/native flattens
// ButtonRoot's template into a resolved RN style object on the innermost host node carrying the
// accessibility label; other wrapper layers keep an unresolved styled-components descriptor.
function resolvedButtonRootStyle(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  const withPlainStyle = matches.find(
    (node) =>
      typeof node.props.style === 'object' &&
      node.props.style !== null &&
      !Array.isArray(node.props.style) &&
      typeof node.props.style.backgroundColor === 'string',
  );
  return withPlainStyle?.props.style as { backgroundColor?: string } | undefined;
}

function resolvedButtonLabelColor(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  for (const match of matches) {
    const textNode = match.findAll(
      (node) =>
        typeof node.props.style === 'object' &&
        node.props.style !== null &&
        !Array.isArray(node.props.style) &&
        typeof node.props.style.color === 'string',
    )[0];
    if (textNode) return (textNode.props.style as { color: string }).color;
  }
  return undefined;
}

async function mountWithTheme() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <CachedAppThemeProvider>
        <SignInScreen />
      </CachedAppThemeProvider>,
    );
  });
  return root;
}

function useWebLocalStorage(getItem: (key: string) => string | null) {
  ReactNative.Platform.OS = 'web';
  (globalThis as { window?: unknown }).window = globalThis;
  Object.defineProperty(window, 'localStorage', { value: { getItem }, configurable: true });
}

function restorePlatform() {
  ReactNative.Platform.OS = originalPlatformOS;
  delete (window as unknown as { localStorage?: unknown }).localStorage;
}

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

const mockSignInWithPassword = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'initializing' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ signInWithPassword: mockSignInWithPassword }),
}));

const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));

const EMAIL = 'someone@example.com';
const PASSWORD = 'whateverpassword';

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
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

function countInputs(root: ReactTestRenderer): number {
  return root.root.findAll(
    (node) => node.props.accessibilityLabel === 'Email' || node.props.accessibilityLabel === 'Password',
  ).length;
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<SignInScreen />);
  });
  return root;
}

async function setInput(root: ReactTestRenderer, label: string, value: string) {
  const input = findByLabel(root, label);
  await act(async () => {
    input.props.onChangeText(value);
  });
}

async function submit(root: ReactTestRenderer) {
  const button = findByLabel(root, 'Sign in');
  await act(async () => {
    await button.props.onPress();
  });
}

async function fillValidForm(root: ReactTestRenderer) {
  await setInput(root, 'Email', EMAIL);
  await setInput(root, 'Password', PASSWORD);
}

describe('SignInScreen', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
  });

  it('navigates to /auth/forgot-password when "Forgot password?" is pressed', async () => {
    const root = await mount();
    const button = findByLabel(root, 'Forgot password?');

    await act(async () => {
      button.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/auth/forgot-password');
  });

  it('shows loading copy and no inputs while initializing', async () => {
    mockAuthState = { status: 'initializing' };
    const root = await mount();

    expect(containsText(root, /Checking your session/)).toBe(true);
    expect(countInputs(root)).toBe(0);
  });

  it('redirects to /app/home immediately when already authenticated, without showing the form', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: { access_token: 'tok' } as never,
      lastEvent: 'SIGNED_IN',
    };
    const root = await mount();

    expect(mockReplace).toHaveBeenCalledWith('/app/home');
    expect(countInputs(root)).toBe(0);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('shows field errors for empty email and password and never calls signInWithPassword', async () => {
    const root = await mount();

    await submit(root);

    expect(containsText(root, 'Enter your email.')).toBe(true);
    expect(containsText(root, 'Enter your password.')).toBe(true);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('renders a working password visibility toggle', async () => {
    const root = await mount();
    await setInput(root, 'Password', PASSWORD);

    expect(findByLabel(root, 'Password').props.secureTextEntry).toBe(true);
    await act(async () => {
      findByLabel(root, 'Show Password').props.onPress();
    });

    expect(findByLabel(root, 'Password').props.secureTextEntry).toBe(false);
    expect(findByLabel(root, 'Hide Password')).toBeTruthy();
  });

  it('renders the exact same copy for an unknown email and a wrong password (enumeration safety)', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { code: 'user_not_found', message: 'nope' } });
    const unknownEmailRoot = await mount();
    await fillValidForm(unknownEmailRoot);
    await submit(unknownEmailRoot);

    mockSignInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'nope' } });
    const wrongPasswordRoot = await mount();
    await fillValidForm(wrongPasswordRoot);
    await submit(wrongPasswordRoot);

    const sharedCopy = 'Incorrect email or password. Try again.';
    expect(containsText(unknownEmailRoot, sharedCopy)).toBe(true);
    expect(containsText(wrongPasswordRoot, sharedCopy)).toBe(true);
  });

  it('shows unverified-email copy, distinct from the generic invalid-credentials copy', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'nope' } });
    const root = await mount();
    await fillValidForm(root);
    await submit(root);

    expect(containsText(root, /Verify your email before signing in/)).toBe(true);
    expect(containsText(root, 'Incorrect email or password. Try again.')).toBe(false);
  });

  it('shows offline copy and keeps the form on an offline-shaped error', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: new TypeError('Failed to fetch') });
    const root = await mount();
    await fillValidForm(root);
    await submit(root);

    expect(containsText(root, /offline/i)).toBe(true);
    expect(countInputs(root)).toBeGreaterThan(0);
  });

  it('shows rate-limited copy when throttled', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { code: 'over_request_rate_limit', message: 'slow down' } });
    const root = await mount();
    await fillValidForm(root);
    await submit(root);

    expect(containsText(root, /Too many attempts/)).toBe(true);
  });

  it('shows expired-session copy when signInWithPassword resolves a session_expired error', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { code: 'session_expired', message: 'expired' } });
    const root = await mount();
    await fillValidForm(root);
    await submit(root);

    expect(containsText(root, /Your session has expired/)).toBe(true);
  });

  it('signs in successfully, calling signInWithPassword once with trimmed input and then replacing to /app/home', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const root = await mount();
    await setInput(root, 'Email', `  ${EMAIL}  `);
    await setInput(root, 'Password', PASSWORD);
    await submit(root);

    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
    expect(mockSignInWithPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(mockReplace).toHaveBeenCalledWith('/app/home');
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('sign_in_success');
  });

  it('guards against a repeat submission firing signInWithPassword twice', async () => {
    let resolveFirst!: (value: { error: unknown }) => void;
    mockSignInWithPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const root = await mount();
    await fillValidForm(root);

    const button = findByLabel(root, 'Sign in');
    await act(async () => {
      button.props.onPress();
      await button.props.onPress();
    });

    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ error: null });
    });
  });

  it('lets a guest continue to /app/home without calling signInWithPassword', async () => {
    const root = await mount();
    const guestButton = findByLabel(root, 'Continue as guest');

    await act(async () => {
      guestButton.props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith('/app/home');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('never exposes the raw password outside the controlled input value', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'nope' } });
    const root = await mount();
    await fillValidForm(root);
    await submit(root);

    const textNodes = root.root.findAll((node) => typeof node.props.children === 'string');
    for (const node of textNodes) {
      expect(node.props.children as string).not.toContain(PASSWORD);
    }
  });

  it('routes failures only through logAuthWarning/trackAuthEvent, with the right category tracked', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'nope' } });
    const root = await mount();
    await fillValidForm(root);
    await submit(root);

    expect(mockLogAuthWarning).toHaveBeenCalledWith('Sign-in failed.', { code: 'invalid_credentials', message: 'nope' });
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('sign_in_error', 'invalidCredentials');
  });

  it('renders the default palette (guest, no cached theme) via CachedAppThemeProvider', async () => {
    useWebLocalStorage(() => null);
    try {
      const defaultTheme = resolveTheme({});
      mockAuthState = { status: 'guest', reason: 'signedOut' };
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Sign in')?.backgroundColor).toBe(defaultTheme.buttonBackground);
      expect(resolvedButtonLabelColor(root, 'Sign in')).toBe(defaultTheme.accent);
    } finally {
      restorePlatform();
    }
  });

  it("renders the user's persisted guest theme background/accent via CachedAppThemeProvider", async () => {
    const customBackground = '#123456';
    const customAccent = '#abcdef';
    useWebLocalStorage((key) =>
      key === GUEST_SCOPED_KEY
        ? seedGuestProfile({ themeBackgroundColor: customBackground, themeAccentColor: customAccent })
        : null,
    );
    try {
      const customTheme = resolveTheme({
        themeBackgroundColor: customBackground,
        themeAccentColor: customAccent,
      });
      mockAuthState = { status: 'guest', reason: 'signedOut' };
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Sign in')?.backgroundColor).toBe(customTheme.buttonBackground);
      expect(resolvedButtonLabelColor(root, 'Sign in')).toBe(customTheme.accent);
    } finally {
      restorePlatform();
    }
  });
});

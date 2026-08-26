import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';

import { SignUpScreen } from '@/features/auth/components/sign-up-screen';

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
        <SignUpScreen />
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

const mockSignUp = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ signUp: mockSignUp }),
}));

const mockSetPendingVerificationEmail = jest.fn();
jest.mock('@/features/auth/state/pending-verification-email', () => ({
  useSetPendingVerificationEmail: () => mockSetPendingVerificationEmail,
}));

const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));

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

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<SignUpScreen />);
  });
  return root;
}

async function fillAndSubmit(
  root: ReactTestRenderer,
  { email, password, confirmPassword }: { email: string; password: string; confirmPassword: string },
) {
  await act(async () => {
    findByLabel(root, 'Email').props.onChangeText(email);
    findByLabel(root, 'Password').props.onChangeText(password);
    findByLabel(root, 'Confirm password').props.onChangeText(confirmPassword);
  });
  await act(async () => {
    await findByLabel(root, 'Sign up').props.onPress();
  });
}

describe('SignUpScreen', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
    mockSetPendingVerificationEmail.mockReset();
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
  });

  it('redirects to /app/home when already authenticated', async () => {
    mockAuthState = { status: 'authenticated', session: {} as never, lastEvent: 'SIGNED_IN' };

    await mount();

    expect(mockReplace).toHaveBeenCalledWith('/app/home');
  });

  it('blocks submission and shows a field error for an empty email', async () => {
    const root = await mount();

    await fillAndSubmit(root, {
      email: '',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(containsText(root, 'Enter your email.')).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('renders working visibility toggles for both password fields', async () => {
    const root = await mount();

    expect(findByLabel(root, 'Show Password')).toBeTruthy();
    expect(findByLabel(root, 'Show Confirm password')).toBeTruthy();
    await act(async () => {
      findByLabel(root, 'Show Confirm password').props.onPress();
    });

    expect(findByLabel(root, 'Confirm password').props.secureTextEntry).toBe(false);
    expect(findByLabel(root, 'Hide Confirm password')).toBeTruthy();
  });

  it('blocks submission and shows a field error for a malformed email', async () => {
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'not-an-email',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(containsText(root, 'Enter a valid email address.')).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('blocks submission and shows a field error for a short password', async () => {
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'person@example.com',
      password: 'short',
      confirmPassword: 'short',
    });

    expect(containsText(root, 'Use at least 10 characters.')).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('blocks submission and shows a field error for a mismatched confirm password', async () => {
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'person@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-different-password',
    });

    expect(containsText(root, 'Passwords do not match.')).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('on true success, sets the pending email, tracks sign_up_success, and navigates to check-email', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'fresh@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(mockSetPendingVerificationEmail).toHaveBeenCalledWith('fresh@example.com');
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('sign_up_success');
    expect(mockReplace).toHaveBeenCalledWith('/auth/check-email');
  });

  it('on an accountAlreadyExists error, takes the identical path as true success (enumeration-safe)', async () => {
    mockSignUp.mockResolvedValue({
      error: { message: 'already registered', code: 'user_already_exists' },
    });
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'duplicate@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(mockSetPendingVerificationEmail).toHaveBeenCalledWith('duplicate@example.com');
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('sign_up_success');
    expect(mockTrackAuthEvent).not.toHaveBeenCalledWith('sign_up_error', expect.anything());
    expect(mockReplace).toHaveBeenCalledWith('/auth/check-email');
    expect(mockLogAuthWarning).not.toHaveBeenCalled();
  });

  it('shows offline copy and stays on the form for an offline-shaped error', async () => {
    mockSignUp.mockResolvedValue({ error: new TypeError('Failed to fetch') });
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'person@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(containsText(root, /offline/i)).toBe(true);
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/check-email');
  });

  it('shows throttled copy and stays on the form for a rate-limited error', async () => {
    mockSignUp.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'rate limited' },
    });
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'person@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(containsText(root, /Too many attempts/i)).toBe(true);
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/check-email');
  });

  it('shows weak-password copy and stays on the form for a weak_password error', async () => {
    mockSignUp.mockResolvedValue({ error: { code: 'weak_password', message: 'too weak' } });
    const root = await mount();

    await fillAndSubmit(root, {
      email: 'person@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
    });

    expect(containsText(root, /stronger password/i)).toBe(true);
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/check-email');
  });

  it('calls signUp exactly once on a rapid double-submit', async () => {
    let resolveFn: (value: { error: unknown }) => void;
    mockSignUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Email').props.onChangeText('person@example.com');
      findByLabel(root, 'Password').props.onChangeText('a-long-enough-password');
      findByLabel(root, 'Confirm password').props.onChangeText('a-long-enough-password');
    });

    const button = findByLabel(root, 'Sign up');
    await act(async () => {
      const first = button.props.onPress();
      const second = button.props.onPress();
      resolveFn!({ error: null });
      await Promise.all([first, second]);
    });

    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it('never renders the raw password anywhere in the tree', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const root = await mount();
    const rawPassword = 'a-very-specific-password-1';

    await fillAndSubmit(root, {
      email: 'person@example.com',
      password: rawPassword,
      confirmPassword: rawPassword,
    });

    const textNodes = root.root.findAll((node) => typeof node.props.children === 'string');
    for (const node of textNodes) {
      expect(node.props.children as string).not.toContain(rawPassword);
    }
  });

  it('renders the default palette (guest, no cached theme) via CachedAppThemeProvider', async () => {
    useWebLocalStorage(() => null);
    try {
      const defaultTheme = resolveTheme({});
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Sign up')?.backgroundColor).toBe(defaultTheme.buttonBackground);
      expect(resolvedButtonLabelColor(root, 'Sign up')).toBe(defaultTheme.accent);
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
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Sign up')?.backgroundColor).toBe(customTheme.buttonBackground);
      expect(resolvedButtonLabelColor(root, 'Sign up')).toBe(customTheme.accent);
    } finally {
      restorePlatform();
    }
  });
});

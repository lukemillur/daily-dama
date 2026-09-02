import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import type { AuthState } from '@/features/auth/model/auth-state';

import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen';

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
        <ForgotPasswordScreen />
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
let mockSearchParams: { from?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockSearchParams,
}));

const mockRequestPasswordReset = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ requestPasswordReset: mockRequestPasswordReset }),
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
    root = create(<ForgotPasswordScreen />);
  });
  return root;
}

async function setEmail(root: ReactTestRenderer, value: string) {
  const input = findByLabel(root, 'Email');
  await act(async () => {
    input.props.onChangeText(value);
  });
}

async function submit(root: ReactTestRenderer, label = 'Send reset link') {
  const button = findByLabel(root, label);
  await act(async () => {
    await button.props.onPress();
  });
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockRequestPasswordReset.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    mockSearchParams = {};
  });

  it('shows a Back to Profile control when reached from the authenticated account-security flow', async () => {
    mockSearchParams = { from: 'account-security' };
    const root = await mount();

    const button = findByLabel(root, 'Back to Profile');
    expect(button).toBeDefined();
    await act(async () => {
      button.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/app/profile');
  });

  it('omits the Back to Profile control for a guest reaching this screen from sign-in', async () => {
    mockSearchParams = {};
    const root = await mount();

    expect(() => findByLabel(root, 'Back to Profile')).toThrow();
  });

  it('shows the Back to Profile control on the confirmation view too when reached from account-security', async () => {
    mockSearchParams = { from: 'account-security' };
    mockRequestPasswordReset.mockResolvedValue({ error: null });
    const root = await mount();

    await setEmail(root, 'person@example.com');
    await submit(root);

    expect(findByLabel(root, 'Back to Profile')).toBeDefined();
  });

  it('redirects to /app/home when already authenticated', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: {} as never,
      lastEvent: 'SIGNED_IN',
    };

    await mount();

    expect(mockReplace).toHaveBeenCalledWith('/app/home');
  });

  it('shows a field error and never calls requestPasswordReset for an empty email', async () => {
    const root = await mount();

    await submit(root);

    expect(containsText(root, 'Enter your email.')).toBe(true);
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows a field error and never calls requestPasswordReset for a malformed email', async () => {
    const root = await mount();

    await setEmail(root, 'not-an-email');
    await submit(root);

    expect(containsText(root, 'Enter a valid email address.')).toBe(true);
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows the identical generic confirmation regardless of the submitted email (enumeration-safe)', async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: null });

    const firstRoot = await mount();
    await setEmail(firstRoot, 'known@example.com');
    await submit(firstRoot);
    const firstConfirmation = containsText(
      firstRoot,
      "If an account exists for that email, we've sent a link to reset the password.",
    );

    const secondRoot = await mount();
    await setEmail(secondRoot, 'never-registered@example.com');
    await submit(secondRoot);
    const secondConfirmation = containsText(
      secondRoot,
      "If an account exists for that email, we've sent a link to reset the password.",
    );

    expect(firstConfirmation).toBe(true);
    expect(secondConfirmation).toBe(true);
  });

  it('shows offline copy and keeps the form when requestPasswordReset resolves an offline-shaped error', async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: new TypeError('Failed to fetch') });
    const root = await mount();

    await setEmail(root, 'person@example.com');
    await submit(root);

    expect(containsText(root, /offline/i)).toBe(true);
    expect(() => findByLabel(root, 'Email')).not.toThrow();
    expect(
      root.root.findAll((node) => typeof node.props.children === 'string').some((node) =>
        (node.props.children as string).includes("If an account exists"),
      ),
    ).toBe(false);
  });

  it('shows throttled copy and keeps the form when requestPasswordReset resolves a rate-limited error', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'rate limited' },
    });
    const root = await mount();

    await setEmail(root, 'person@example.com');
    await submit(root);

    expect(containsText(root, /Too many attempts/i)).toBe(true);
  });

  it('calls requestPasswordReset exactly once on a rapid double-submit', async () => {
    let resolveFn: (value: { error: unknown }) => void;
    mockRequestPasswordReset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const root = await mount();
    await setEmail(root, 'person@example.com');

    const button = findByLabel(root, 'Send reset link');
    await act(async () => {
      const first = button.props.onPress();
      const second = button.props.onPress();
      resolveFn!({ error: null });
      await Promise.all([first, second]);
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('resend calls requestPasswordReset again with the same email, guarded against a rapid double-click', async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: null });
    const root = await mount();

    await setEmail(root, 'person@example.com');
    await submit(root);
    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('person@example.com');

    let resolveFn: (value: { error: unknown }) => void;
    mockRequestPasswordReset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );

    const resendButton = findByLabel(root, 'Resend');
    await act(async () => {
      const first = resendButton.props.onPress();
      const second = resendButton.props.onPress();
      resolveFn!({ error: null });
      await Promise.all([first, second]);
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(2);
    expect(mockRequestPasswordReset).toHaveBeenLastCalledWith('person@example.com');
  });

  it('shows the same-browser/device guidance on both the form and the confirmation view', async () => {
    const formRoot = await mount();
    expect(containsText(formRoot, /same browser, on this device/i)).toBe(true);

    mockRequestPasswordReset.mockResolvedValue({ error: null });
    await setEmail(formRoot, 'person@example.com');
    await submit(formRoot);
    expect(containsText(formRoot, /same browser, on this device/i)).toBe(true);
  });

  it('never exposes the raw email outside the controlled input value', async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: null });
    const email = 'someone-specific@example.com';
    const root = await mount();

    await setEmail(root, email);
    await submit(root);

    const textNodes = root.root.findAll((node) => typeof node.props.children === 'string');
    for (const node of textNodes) {
      expect(node.props.children as string).not.toContain(email);
    }
  });

  it('renders the default palette (guest, no cached theme) via CachedAppThemeProvider', async () => {
    useWebLocalStorage(() => null);
    try {
      const defaultTheme = resolveTheme({});
      mockAuthState = { status: 'guest', reason: 'signedOut' };
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Send reset link')?.backgroundColor).toBe(defaultTheme.buttonBackground);
      expect(resolvedButtonLabelColor(root, 'Send reset link')).toBe(defaultTheme.accent);
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

      expect(resolvedButtonRootStyle(root, 'Send reset link')?.backgroundColor).toBe(customTheme.buttonBackground);
      expect(resolvedButtonLabelColor(root, 'Send reset link')).toBe(customTheme.accent);
    } finally {
      restorePlatform();
    }
  });
  it('resolves the primary-form background and email field colors from the active theme', async () => {
    const customTheme: DefaultTheme = {
      background: '#123456',
      accent: '#abcdef',
      text: '#fedcba',
      textMuted: '#997755',
      buttonBackground: '#111111',
      buttonBackgroundSecondary: '#222222',
    };
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <StyledThemeProvider theme={customTheme}>
          <ForgotPasswordScreen />
        </StyledThemeProvider>,
      );
    });

    const screenStyle = root.root.findAll(
      (node) =>
        typeof node.props.style === 'object' &&
        node.props.style !== null &&
        !Array.isArray(node.props.style) &&
        node.props.style.backgroundColor === customTheme.background,
    );
    expect(screenStyle.length).toBeGreaterThan(0);

    const emailInputs = root.root.findAll((node) => node.props.accessibilityLabel === 'Email');
    const emailInputStyle = emailInputs.find(
      (node) =>
        typeof node.props.style === 'object' &&
        node.props.style !== null &&
        !Array.isArray(node.props.style),
    )?.props.style as Record<string, string> | undefined;
    expect(emailInputStyle).toMatchObject({
      backgroundColor: customTheme.background,
      borderColor: customTheme.text,
      color: customTheme.text,
    });
    expect(
      emailInputs.find((node) => typeof node.props.placeholderTextColor === 'string')?.props
        .placeholderTextColor,
    ).toBe(customTheme.textMuted);
  });
});

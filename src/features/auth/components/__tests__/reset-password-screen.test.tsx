import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Session } from '@supabase/supabase-js';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MIN_PASSWORD_LENGTH } from '@/features/auth/model/password-policy';
import type { AuthState } from '@/features/auth/model/auth-state';

import { ResetPasswordScreen } from '@/features/auth/components/reset-password-screen';

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
        <ResetPasswordScreen />
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
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));

const mockCompletePasswordRecovery = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'initializing' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ completePasswordRecovery: mockCompletePasswordRecovery }),
}));

const recoverySession = { access_token: 'recovery-token' } as unknown as Session;
const NEW_PASSWORD = 'S3curePassw0rd!';

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
    (node) =>
      node.props.accessibilityLabel === 'New password' ||
      node.props.accessibilityLabel === 'Confirm new password',
  ).length;
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ResetPasswordScreen />);
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
  const button = findByLabel(root, 'Set new password');
  await act(async () => {
    await button.props.onPress();
  });
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    mockCompletePasswordRecovery.mockReset();
    mockReplace.mockReset();
    mockAuthState = { status: 'initializing' };
  });

  it('shows loading copy and no inputs while initializing', async () => {
    mockAuthState = { status: 'initializing' };
    const root = await mount();

    expect(containsText(root, /Checking your recovery link/)).toBe(true);
    expect(countInputs(root)).toBe(0);
  });

  it('shows expired/invalid copy for a direct visit with no recovery session (guest)', async () => {
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    const root = await mount();

    expect(containsText(root, 'This link is no longer valid.')).toBe(true);
    expect(countInputs(root)).toBe(0);
  });

  it('shows the same expired/invalid copy for a plain authenticated session (not via recovery)', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: recoverySession,
      lastEvent: 'SIGNED_IN',
    };
    const root = await mount();

    expect(containsText(root, 'This link is no longer valid.')).toBe(true);
    expect(countInputs(root)).toBe(0);
  });

  describe('when status is passwordRecovery', () => {
    beforeEach(() => {
      mockAuthState = { status: 'passwordRecovery', session: recoverySession };
    });

    it('shows a mismatch error on submit and never calls completePasswordRecovery', async () => {
      const root = await mount();

      await setInput(root, 'New password', NEW_PASSWORD);
      await setInput(root, 'Confirm new password', 'something-else-entirely');
      await submit(root);

      expect(containsText(root, 'Passwords do not match.')).toBe(true);
      expect(mockCompletePasswordRecovery).not.toHaveBeenCalled();
    });

    it('shows a weak-password error on submit and never calls completePasswordRecovery', async () => {
      const root = await mount();
      const weak = 'short1';

      await setInput(root, 'New password', weak);
      await setInput(root, 'Confirm new password', weak);
      await submit(root);

      expect(containsText(root, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)).toBe(true);
      expect(mockCompletePasswordRecovery).not.toHaveBeenCalled();
    });

    it('calls completePasswordRecovery exactly once with valid matching input, then shows completion copy', async () => {
      mockCompletePasswordRecovery.mockResolvedValue({ error: null });
      const root = await mount();

      await setInput(root, 'New password', NEW_PASSWORD);
      await setInput(root, 'Confirm new password', NEW_PASSWORD);
      await submit(root);

      expect(mockCompletePasswordRecovery).toHaveBeenCalledTimes(1);
      expect(mockCompletePasswordRecovery).toHaveBeenCalledWith(NEW_PASSWORD);
      expect(containsText(root, /Your password has been updated/)).toBe(true);
      expect(countInputs(root)).toBe(0);
    });

    it('does not call completePasswordRecovery again on a repeat submission after completion', async () => {
      mockCompletePasswordRecovery.mockResolvedValue({ error: null });
      const root = await mount();

      await setInput(root, 'New password', NEW_PASSWORD);
      await setInput(root, 'Confirm new password', NEW_PASSWORD);
      await submit(root);
      expect(mockCompletePasswordRecovery).toHaveBeenCalledTimes(1);

      // Completion view has no submit button anymore -- simulate a stale re-invoke
      // of the button handler captured before the completed re-render, which is the
      // repeat-submission guard's actual job.
      const stillNoButton = root.root.findAll((node) => node.props.accessibilityLabel === 'Set new password');
      expect(stillNoButton.length).toBe(0);
      expect(mockCompletePasswordRecovery).toHaveBeenCalledTimes(1);
    });

    it('shows offline copy and keeps the form when completePasswordRecovery resolves an offline-shaped error', async () => {
      mockCompletePasswordRecovery.mockResolvedValue({ error: new TypeError('Failed to fetch') });
      const root = await mount();

      await setInput(root, 'New password', NEW_PASSWORD);
      await setInput(root, 'Confirm new password', NEW_PASSWORD);
      await submit(root);

      expect(containsText(root, /offline/i)).toBe(true);
      expect(countInputs(root)).toBeGreaterThan(0);
    });

    it('shows expired-session copy when completePasswordRecovery resolves a session_expired error', async () => {
      mockCompletePasswordRecovery.mockResolvedValue({ error: { code: 'session_expired', message: 'expired' } });
      const root = await mount();

      await setInput(root, 'New password', NEW_PASSWORD);
      await setInput(root, 'Confirm new password', NEW_PASSWORD);
      await submit(root);

      expect(containsText(root, /recovery link has expired/i)).toBe(true);
    });

    it('never exposes the raw password outside the controlled input value', async () => {
      mockCompletePasswordRecovery.mockResolvedValue({ error: null });
      const root = await mount();

      await setInput(root, 'New password', NEW_PASSWORD);
      await setInput(root, 'Confirm new password', NEW_PASSWORD);
      await submit(root);

      const textNodes = root.root.findAll((node) => typeof node.props.children === 'string');
      for (const node of textNodes) {
        expect(node.props.children as string).not.toContain(NEW_PASSWORD);
      }
    });
  });

  it('renders the default palette (no guest-cached theme on this device) via CachedAppThemeProvider', async () => {
    useWebLocalStorage(() => null);
    try {
      const defaultTheme = resolveTheme({});
      mockAuthState = { status: 'passwordRecovery', session: recoverySession };
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Set new password')?.backgroundColor).toBe(
        defaultTheme.buttonBackground,
      );
      expect(resolvedButtonLabelColor(root, 'Set new password')).toBe(defaultTheme.accent);
    } finally {
      restorePlatform();
    }
  });

  it("renders this device's guest-cached theme background/accent via CachedAppThemeProvider (documented reset-password approximation)", async () => {
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
      mockAuthState = { status: 'passwordRecovery', session: recoverySession };
      const root = await mountWithTheme();

      expect(resolvedButtonRootStyle(root, 'Set new password')?.backgroundColor).toBe(
        customTheme.buttonBackground,
      );
      expect(resolvedButtonLabelColor(root, 'Set new password')).toBe(customTheme.accent);
    } finally {
      restorePlatform();
    }
  });
});

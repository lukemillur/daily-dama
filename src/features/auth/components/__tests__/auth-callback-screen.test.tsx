import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect, useState } from 'react';
// See use-cached-onboarding-status.test.tsx for why a CommonJS require (rather than
// `import * as ReactNative`) is needed to mutate Platform.OS in a way the component under test sees.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native') as typeof import('react-native');

import { AuthCallbackScreen } from '@/features/auth/components/auth-callback-screen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  // A fresh object every call -- mirrors expo-router potentially returning a new params
  // object identity across re-renders even when the underlying values haven't changed.
  useLocalSearchParams: () => ({ ...mockParams }),
}));

const mockExchangeCodeForSession = jest.fn<
  () => Promise<{ redirectType: 'recovery' | null; error: unknown }>
>();

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthActions: () => ({ exchangeCodeForSession: mockExchangeCodeForSession }),
}));

const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));

let mockParams: Record<string, string | string[] | undefined> = {};

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
    root = create(<AuthCallbackScreen />);
  });
  return root;
}

let forceHarnessRerender: (() => void) | undefined;

function Harness() {
  const [, setTick] = useState(0);
  useEffect(() => {
    forceHarnessRerender = () => setTick((tick) => tick + 1);
  });
  return <AuthCallbackScreen />;
}

async function mountWithForcedRerender() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<Harness />);
  });
  return root;
}

describe('AuthCallbackScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockExchangeCodeForSession.mockReset();
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockParams = {};
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('web hash-fragment error (Supabase can redirect with error/error_code in the hash)', () => {
    const originalPlatformOS = ReactNative.Platform.OS;

    beforeEach(() => {
      ReactNative.Platform.OS = 'web';
      (globalThis as { window?: unknown }).window = globalThis;
      Object.defineProperty(window, 'location', {
        value: { hash: '' },
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      ReactNative.Platform.OS = originalPlatformOS;
      delete (globalThis as { window?: unknown }).window;
    });

    it('catches an expired-link error carried in the URL hash fragment (no query params) without exchanging', async () => {
      window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=Link+expired';
      mockParams = {};

      const root = await mount();

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(containsText(root, 'This link is no longer valid.')).toBe(true);
    });
  });

  it('exchanges a valid confirmation code exactly once and redirects to /app/home after the minimum-visible-duration floor', async () => {
    jest.useFakeTimers();
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: null });
    mockParams = { code: 'valid-confirmation-code' };

    await mount();

    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-confirmation-code');
    // Even though exchangeCodeForSession resolved instantly, the redirect is held behind the
    // CALLBACK_MIN_VISIBLE_MS floor -- see the "does not redirect before the minimum..." test
    // below for the precise boundary assertion.
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/app/home', params: { newAccount: '1' } });
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('auth_callback_success');
  });

  it('does not redirect to /app/home before the minimum-visible-duration floor elapses even when the exchange resolves instantly, and does redirect once it does', async () => {
    jest.useFakeTimers();
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: null });
    mockParams = { code: 'instant-confirmation-code' };

    await mount();

    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(599);
    });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/app/home', params: { newAccount: '1' } });
  });

  it('exchanges a valid recovery code exactly once and redirects to /auth/reset-password', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: 'recovery', error: null });
    mockParams = { code: 'valid-recovery-code' };

    await mount();

    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/auth/reset-password');
  });

  it('exchanges a completing email-change code (flow=email_change) and redirects to the account security route', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: null });
    mockParams = { code: 'completing-email-change-code', flow: 'email_change' };

    await mount();

    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/app/profile/account/security');
  });

  it('ignores an unrecognized flow value and falls back to /app/home (fail closed, not open)', async () => {
    jest.useFakeTimers();
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: null });
    mockParams = { code: 'valid-code', flow: 'not-a-real-flow' } as never;

    await mount();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/app/home', params: { newAccount: '1' } });
  });

  it('shows mid-flow guidance (not an error) and does not exchange when only a message param is present', async () => {
    mockParams = { message: 'Confirmation link accepted. Please proceed to confirm link sent to the other email' };

    const root = await mount();

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, 'One more step.')).toBe(true);
    expect(containsText(root, 'This link is no longer valid.')).toBe(false);
  });

  it('never accepts or forwards an arbitrary next/destination param', async () => {
    jest.useFakeTimers();
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: null });
    mockParams = { code: 'valid-code', next: '/some/other/route' } as never;

    await mount();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/app/home', params: { newAccount: '1' } });
  });

  it('shows error copy and never exchanges when the code param is missing', async () => {
    mockParams = {};

    const root = await mount();

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, 'This link is no longer valid.')).toBe(true);
  });

  it('shows error copy and never exchanges when the code param is malformed (array value)', async () => {
    mockParams = { code: ['a', 'b'] };

    const root = await mount();

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, 'This link is no longer valid.')).toBe(true);
  });

  it('maps a query-string error/error_code param through categorizeAuthError without exchanging', async () => {
    mockParams = { error: 'access_denied', error_code: 'otp_expired' };

    const root = await mount();

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, 'This link is no longer valid.')).toBe(true);
    expect(
      root.root.findAll((node) => typeof node.props.children === 'string').some((node) =>
        (node.props.children as string).includes('otp_expired'),
      ),
    ).toBe(false);
  });

  it('shows expired/invalid copy when the exchange resolves an expired/reused/verifier-mismatch error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      redirectType: null,
      error: { code: 'flow_state_expired', message: 'expired' },
    });
    mockParams = { code: 'expired-code' };

    const root = await mount();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, /expired or was already used/i)).toBe(true);
  });

  it('shows missing-verifier copy for a code opened in a different browser/device (bad_code_verifier)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      redirectType: null,
      error: { code: 'bad_code_verifier', message: 'mismatch' },
    });
    mockParams = { code: 'reused-code' };

    const root = await mount();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, /browser and device you requested it from/i)).toBe(true);
  });

  it('shows offline copy when the exchange resolves an offline-shaped error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      redirectType: null,
      error: new TypeError('Failed to fetch'),
    });
    mockParams = { code: 'some-code' };

    const root = await mount();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(containsText(root, /offline/i)).toBe(true);
  });

  it('logs the exchange failure via the redacting logger and tracks a categorized analytics event, never raw error text', async () => {
    const rawError = { code: 'flow_state_expired', message: 'raw supabase detail' };
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: rawError });
    mockParams = { code: 'expired-code' };

    const root = await mount();

    expect(mockLogAuthWarning).toHaveBeenCalledWith('Auth callback exchange failed.', rawError);
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('auth_callback_error', 'expiredOrInvalidLink');
    expect(
      root.root
        .findAll((node) => typeof node.props.children === 'string')
        .some((node) => (node.props.children as string).includes('raw supabase detail')),
    ).toBe(false);
  });

  it('exchanges exactly once when the effect re-fires for the same code after a params-identity-changing re-render', async () => {
    jest.useFakeTimers();
    mockExchangeCodeForSession.mockResolvedValue({ redirectType: null, error: null });
    mockParams = { code: 'same-code' };

    await mountWithForcedRerender();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);

    // Force a parent re-render; useLocalSearchParams() returns a brand-new object each call
    // (same `code` value), which would re-fire the effect without the one-shot ref guard.
    await act(async () => {
      forceHarnessRerender?.();
    });

    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});

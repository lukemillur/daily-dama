import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';

import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

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
});

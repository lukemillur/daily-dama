import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';

import { CheckEmailScreen } from '@/features/auth/components/check-email-screen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

const mockResendSignupConfirmation = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ resendSignupConfirmation: mockResendSignupConfirmation }),
}));

let mockPendingEmail: string | undefined;
jest.mock('@/features/auth/state/pending-verification-email', () => ({
  usePendingVerificationEmail: () => mockPendingEmail,
}));

const mockTrackAuthEvent = jest.fn();
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: jest.fn(),
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
    root = create(<CheckEmailScreen />);
  });
  return root;
}

describe('CheckEmailScreen', () => {
  beforeEach(() => {
    mockResendSignupConfirmation.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
    mockTrackAuthEvent.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    mockPendingEmail = undefined;
  });

  describe('with a pending email', () => {
    beforeEach(() => {
      mockPendingEmail = 'person@example.com';
    });

    it('renders check-email guidance including the same-browser instruction', async () => {
      const root = await mount();

      expect(containsText(root, /Check your email\./)).toBe(true);
      expect(containsText(root, /same browser, on this device/i)).toBe(true);
    });

    it('shows the pending email address so the user can confirm it was entered correctly', async () => {
      const root = await mount();

      expect(containsText(root, /person@example\.com/)).toBe(true);
    });

    it('resend calls resendSignupConfirmation with the pending email', async () => {
      mockResendSignupConfirmation.mockResolvedValue({ error: null });
      const root = await mount();

      await act(async () => {
        await findByLabel(root, 'Resend').props.onPress();
      });

      expect(mockResendSignupConfirmation).toHaveBeenCalledWith('person@example.com');
      expect(mockTrackAuthEvent).toHaveBeenCalledWith('sign_up_resend_success');
    });

    it('shows offline copy on an offline-shaped resend error', async () => {
      mockResendSignupConfirmation.mockResolvedValue({ error: new TypeError('Failed to fetch') });
      const root = await mount();

      await act(async () => {
        await findByLabel(root, 'Resend').props.onPress();
      });

      expect(containsText(root, /offline/i)).toBe(true);
    });

    it('shows throttled copy on a rate-limited resend error', async () => {
      mockResendSignupConfirmation.mockResolvedValue({
        error: { code: 'over_email_send_rate_limit', message: 'rate limited' },
      });
      const root = await mount();

      await act(async () => {
        await findByLabel(root, 'Resend').props.onPress();
      });

      expect(containsText(root, /Too many attempts/i)).toBe(true);
    });

    it('shows generic copy on an unknown resend error', async () => {
      mockResendSignupConfirmation.mockResolvedValue({
        error: { code: 'some_unknown_code', message: 'boom' },
      });
      const root = await mount();

      await act(async () => {
        await findByLabel(root, 'Resend').props.onPress();
      });

      expect(containsText(root, /Something went wrong/i)).toBe(true);
    });

    it('resets the button label to Sent and keeps guidance on resend success', async () => {
      mockResendSignupConfirmation.mockResolvedValue({ error: null });
      const root = await mount();

      await act(async () => {
        await findByLabel(root, 'Resend').props.onPress();
      });

      expect(containsText(root, 'Sent')).toBe(true);
      expect(containsText(root, /Check your email\./)).toBe(true);
    });

    it('redirects to /app/home when already authenticated', async () => {
      mockAuthState = { status: 'authenticated', session: {} as never, lastEvent: 'SIGNED_IN' };

      await mount();

      expect(mockReplace).toHaveBeenCalledWith('/app/home');
    });
  });

  describe('without a pending email', () => {
    it('renders a generic fallback with a link back to sign-up', async () => {
      const root = await mount();

      expect(containsText(root, 'Back to sign up')).toBe(true);
    });

    it('never renders a Resend control', async () => {
      const root = await mount();

      expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Resend')).toHaveLength(0);
    });

    it('never calls resendSignupConfirmation', async () => {
      await mount();

      expect(mockResendSignupConfirmation).not.toHaveBeenCalled();
    });
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { CheckEmailScreen } from '@/features/auth/components/check-email-screen';
import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen';
import { SignInScreen } from '@/features/auth/components/sign-in-screen';
import { SignUpScreen } from '@/features/auth/components/sign-up-screen';
import { setPlatformOS } from '@/shared/navigation/test-platform';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockRequestPasswordReset = jest.fn<() => Promise<{ error: unknown }>>();
jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => ({ status: 'guest', reason: 'signedOut' }),
  useAuthActions: () => ({
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    resendSignupConfirmation: jest.fn(),
    requestPasswordReset: mockRequestPasswordReset,
  }),
}));

jest.mock('@/features/landing/state/use-cached-onboarding-status', () => ({
  useCachedOnboardingStatus: () => ({ hasCompletedOnboarding: false, kenteiRank: undefined }),
}));
jest.mock('@/features/auth/state/pending-verification-email', () => ({
  usePendingVerificationEmail: () => 'person@example.com',
  useSetPendingVerificationEmail: () => jest.fn(),
}));
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: jest.fn(),
  logAuthWarning: jest.fn(),
}));

async function mount(element: React.ReactElement) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(element);
  });
  return root;
}

// The host TextInput is the only node carrying textContentType for a given accessibility label.
function field(root: ReactTestRenderer, label: string): ReactTestInstance {
  return root.root.find(
    (node) => node.props.accessibilityLabel === label && node.props.textContentType !== undefined,
  );
}

function passwordFields(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) =>
      typeof node.props.textContentType === 'string' &&
      node.props.textContentType !== 'username' &&
      node.props.secureTextEntry === true &&
      typeof node.type === 'string',
  );
}

function formScroll(root: ReactTestRenderer) {
  return root.root.find(
    (node) => node.props.automaticallyAdjustKeyboardInsets === true && typeof node.type === 'string',
  );
}

describe('auth screens on iOS', () => {
  setPlatformOS('ios');

  beforeEach(() => {
    mockRequestPasswordReset.mockReset();
    mockRequestPasswordReset.mockResolvedValue({ error: null });
  });

  it('sign-in uses the saved-password content type and current-password autofill', async () => {
    const root = await mount(<SignInScreen />);

    expect(field(root, 'Email').props).toMatchObject({ textContentType: 'username', autoComplete: 'email' });
    const [password] = passwordFields(root);
    expect(password.props).toMatchObject({ textContentType: 'password', autoComplete: 'current-password' });
  });

  it('sign-up marks both password fields as new passwords', async () => {
    const root = await mount(<SignUpScreen />);

    const fields = passwordFields(root);
    expect(fields).toHaveLength(2);
    for (const input of fields) {
      expect(input.props).toMatchObject({ textContentType: 'newPassword', autoComplete: 'new-password' });
    }
  });

  it('forgot-password sends from the keyboard return key', async () => {
    const root = await mount(<ForgotPasswordScreen />);
    const email = field(root, 'Email');

    expect(email.props).toMatchObject({ textContentType: 'username', autoComplete: 'email', returnKeyType: 'send' });
    await act(async () => {
      email.props.onChangeText('person@example.com');
    });
    await act(async () => {
      await field(root, 'Email').props.onSubmitEditing();
    });
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('person@example.com');
  });

  it('check-email renders', async () => {
    const root = await mount(<CheckEmailScreen />);

    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Resend').length).toBeGreaterThan(0);
  });

  it.each([
    ['sign-in', <SignInScreen key="a" />],
    ['sign-up', <SignUpScreen key="b" />],
    ['forgot-password', <ForgotPasswordScreen key="c" />],
  ])('%s scrolls with keyboard-aware insets and interactive dismissal', async (_name, element) => {
    const root = await mount(element);

    expect(formScroll(root).props).toMatchObject({
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'interactive',
    });
  });
});

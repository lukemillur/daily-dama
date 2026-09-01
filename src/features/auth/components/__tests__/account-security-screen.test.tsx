import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import type { AuthState } from '@/features/auth/model/auth-state';
import { networkFailure } from '@/features/auth/model/auth-test-fixtures';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/model/password-policy';

import { AccountSecurityScreen } from '@/features/auth/components/account-security-screen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockChangePassword = jest.fn<() => Promise<{ error: unknown }>>();
const mockChangeEmail = jest.fn<() => Promise<{ error: unknown }>>();
const mockSignOut = jest.fn<() => Promise<{ error: unknown }>>();
let mockAuthState: AuthState = { status: 'initializing' };

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({
    changePassword: mockChangePassword,
    changeEmail: mockChangeEmail,
    signOut: mockSignOut,
  }),
}));

const mockTrackAuthEvent = jest.fn();
const mockLogAuthWarning = jest.fn();
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
  logAuthWarning: (...args: unknown[]) => mockLogAuthWarning(...args),
}));

const EMAIL = 'someone@example.com';
const CURRENT_PASSWORD = 'currentpassword1';
const EMAIL_CURRENT_PASSWORD = 'emailcurrentpassword1';
const NEW_PASSWORD = 'S3curePassw0rd!';
const customTheme: DefaultTheme = {
  background: '#123456',
  accent: '#abcdef',
  text: '#fedcba',
  textMuted: '#997755',
  buttonBackground: '#111111',
  buttonBackgroundSecondary: '#222222',
};

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
    root = create(<AccountSecurityScreen />);
  });
  return root;
}

async function mountWithTheme() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <StyledThemeProvider theme={customTheme}>
        <AccountSecurityScreen />
      </StyledThemeProvider>,
    );
  });
  return root;
}

function resolvedStyle(nodes: ReturnType<ReactTestRenderer['root']['findAll']>) {
  const node = nodes.find(
    (candidate) =>
      typeof candidate.props.style === 'object' &&
      candidate.props.style !== null &&
      !Array.isArray(candidate.props.style),
  );
  return node?.props.style as Record<string, string | number> | undefined;
}

function resolvedButtonLabelColor(renderer: ReactTestRenderer, label: string) {
  for (const button of renderer.root.findAll((node) => node.props.accessibilityLabel === label)) {
    const labelNode = button.findAll(
      (node) =>
        typeof node.props.style === 'object' &&
        node.props.style !== null &&
        !Array.isArray(node.props.style) &&
        typeof node.props.style.color === 'string',
    )[0];
    if (labelNode) return (labelNode.props.style as { color: string }).color;
  }
  return undefined;
}

async function setInput(root: ReactTestRenderer, label: string, value: string) {
  const input = findByLabel(root, label);
  await act(async () => {
    input.props.onChangeText(value);
  });
}

async function fillValidPasswordForm(root: ReactTestRenderer) {
  await setInput(root, 'Current password', CURRENT_PASSWORD);
  await setInput(root, 'New password', NEW_PASSWORD);
  await setInput(root, 'Confirm new password', NEW_PASSWORD);
}

async function fillValidEmailForm(root: ReactTestRenderer, email: string) {
  await setInput(root, 'Password', EMAIL_CURRENT_PASSWORD);
  await setInput(root, 'New email', email);
}

async function pressLabel(root: ReactTestRenderer, label: string) {
  const button = findByLabel(root, label);
  await act(async () => {
    await button.props.onPress();
  });
}

describe('AccountSecurityScreen', () => {
  beforeEach(() => {
    mockChangePassword.mockReset();
    mockChangeEmail.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
    mockTrackAuthEvent.mockReset();
    mockLogAuthWarning.mockReset();
    mockPush.mockReset();
    mockAuthState = { status: 'initializing' };
  });

  it('shows a checking-session state while initializing, with no form and no SDK calls', async () => {
    mockAuthState = { status: 'initializing' };
    const root = await mount();

    expect(findAllByLabel(root, 'Current password').length).toBe(0);
    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });

  it('navigates back to Profile via the back control', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await pressLabel(root, 'Back to Profile');
    expect(mockPush).toHaveBeenCalledWith('/app/profile');
  });

  it('shows a sign-in guard with no form when a guest', async () => {
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    const root = await mount();

    expect(findAllByLabel(root, 'Current password').length).toBe(0);
    expect(containsText(root, 'Sign in to manage account security.')).toBe(true);
    const link = findByLabel(root, 'Go to sign in');
    await act(async () => {
      link.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('shows a sign-in guard with no form during password recovery', async () => {
    mockAuthState = { status: 'passwordRecovery', session: { access_token: 'tok' } as never };
    const root = await mount();

    expect(findAllByLabel(root, 'Current password').length).toBe(0);
    expect(containsText(root, 'Sign in to manage account security.')).toBe(true);
  });

  it('resolves the Account Security surface, field, feedback, and buttons from the active theme', async () => {
    mockAuthState = authenticatedState();
    const root = await mountWithTheme();

    const emailInputs = root.root.findAll((node) => node.props.accessibilityLabel === 'New email');
    const emailInputStyle = resolvedStyle(emailInputs);
    expect(emailInputStyle).toMatchObject({
      backgroundColor: customTheme.background,
      borderColor: customTheme.text,
      color: customTheme.text,
    });
    expect(
      emailInputs.find((node) => typeof node.props.placeholderTextColor === 'string')?.props
        .placeholderTextColor,
    ).toBe(customTheme.textMuted);

    const dividerStyle = resolvedStyle(
      root.root.findAll((node) => node.props.style?.height === 2),
    );
    expect(dividerStyle?.backgroundColor).toBe(customTheme.text);

    const screenStyle = resolvedStyle(
      root.root.findAll((node) => node.props.style?.backgroundColor === customTheme.background),
    );
    expect(screenStyle?.backgroundColor).toBe(customTheme.background);

    const buttonStyle = resolvedStyle(root.root.findAll((node) => node.props.accessibilityLabel === 'Update email'));
    expect(buttonStyle?.backgroundColor).toBe(customTheme.buttonBackgroundSecondary);
    expect(resolvedButtonLabelColor(root, 'Update email')).toBe(customTheme.text);

    await setInput(root, 'New email', 'not-an-email');
    await pressLabel(root, 'Update email');
    const errorStyle = resolvedStyle(
      root.root.findAll((node) => node.props.children === 'Enter a valid email address.'),
    );
    expect(errorStyle?.color).toBe(customTheme.text);
  });

  it('changes the password on the happy path, clears fields, and shows success copy', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({ error: null });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(mockChangePassword).toHaveBeenCalledWith(CURRENT_PASSWORD, NEW_PASSWORD);
    expect(containsText(root, 'Your password has been updated.')).toBe(true);
    expect(findByLabel(root, 'Current password').props.value).toBe('');
    expect(findByLabel(root, 'New password').props.value).toBe('');
    expect(findByLabel(root, 'Confirm new password').props.value).toBe('');
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('account_security_password_success');
  });

  it('shares the visibility toggle across the change-password fields, rendered as an icon', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(findByLabel(root, 'Show Current password')).toBeTruthy();
    expect(findByLabel(root, 'Show New password')).toBeTruthy();
    expect(findByLabel(root, 'Show Confirm new password')).toBeTruthy();
    expect(root.root.findAll((node) => node.props.children === 'Show')).toHaveLength(0);
    expect(root.root.findAll((node) => node.props.children === 'Hide')).toHaveLength(0);

    await pressLabel(root, 'Show Current password');

    // Toggling the current-password field reveals the new/confirm fields too -- they share one
    // PasswordVisibilityProvider. The unrelated change-email "Password" field is not affected.
    expect(findByLabel(root, 'Current password').props.secureTextEntry).toBe(false);
    expect(findByLabel(root, 'New password').props.secureTextEntry).toBe(false);
    expect(findByLabel(root, 'Confirm new password').props.secureTextEntry).toBe(false);
    expect(findByLabel(root, 'Hide Current password')).toBeTruthy();
    expect(findByLabel(root, 'Hide New password')).toBeTruthy();
    expect(findByLabel(root, 'Hide Confirm new password')).toBeTruthy();
    expect(findByLabel(root, 'Show Password')).toBeTruthy();
  });

  it('shows a specific, non-generic error for a wrong current password, without disturbing the email section', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({
      error: { message: 'invalid credentials', code: 'invalid_credentials' },
    });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(containsText(root, 'Your current password is incorrect.')).toBe(true);
    expect(findByLabel(root, 'New email')).toBeTruthy();
  });

  it('does not render a forgot-password link by default', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(findAllByLabel(root, 'Forgot password?').length).toBe(0);
  });

  it('shows a forgot-password link with a sign-out warning after a wrong current password', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({
      error: { message: 'invalid credentials', code: 'invalid_credentials' },
    });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(findByLabel(root, 'Forgot password?')).toBeTruthy();
    expect(containsText(root, /using the link below will sign you out/i)).toBe(true);
  });

  it('signs the user out and navigates to /auth/forgot-password when the gated link is selected', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({
      error: { message: 'invalid credentials', code: 'invalid_credentials' },
    });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');
    await pressLabel(root, 'Forgot password?');

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/auth/forgot-password?from=account-security');
  });

  it('blocks submit and calls neither current-password check message nor changePassword for an empty current password', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await setInput(root, 'New password', NEW_PASSWORD);
    await setInput(root, 'Confirm new password', NEW_PASSWORD);
    await pressLabel(root, 'Update password');

    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(containsText(root, 'Enter your current password.')).toBe(true);
  });

  it('blocks submit for a weak new password, without calling changePassword', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await setInput(root, 'Current password', CURRENT_PASSWORD);
    await setInput(root, 'New password', 'short');
    await setInput(root, 'Confirm new password', 'short');
    await pressLabel(root, 'Update password');

    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(containsText(root, new RegExp(String(MIN_PASSWORD_LENGTH) + ' characters'))).toBe(true);
  });

  it('blocks submit for mismatched new/confirm passwords, without calling changePassword', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await setInput(root, 'Current password', CURRENT_PASSWORD);
    await setInput(root, 'New password', NEW_PASSWORD);
    await setInput(root, 'Confirm new password', 'SomethingElse123!');
    await pressLabel(root, 'Update password');

    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(containsText(root, 'Passwords do not match.')).toBe(true);
  });

  it('shows offline copy for an offline password-change failure', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({ error: networkFailure() });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(containsText(root, /offline/i)).toBe(true);
  });

  it('shows rate-limited copy for a rate-limited password-change failure', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({
      error: { message: 'rate limited', code: 'over_request_rate_limit' },
    });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(containsText(root, /too many attempts/i)).toBe(true);
  });

  it('guards against a repeat press firing changePassword twice', async () => {
    mockAuthState = authenticatedState();
    let resolveFirst!: (value: { error: unknown }) => void;
    mockChangePassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const root = await mount();
    await fillValidPasswordForm(root);

    const button = findByLabel(root, 'Update password');
    await act(async () => {
      button.props.onPress();
      await button.props.onPress();
    });

    expect(mockChangePassword).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ error: null });
    });
  });

  it('requests an email change on the happy path and shows pending-confirmation guidance without navigating', async () => {
    mockAuthState = authenticatedState();
    mockChangeEmail.mockResolvedValue({ error: null });
    const root = await mount();

    await fillValidEmailForm(root, 'new-address@example.com');
    await pressLabel(root, 'Update email');

    expect(mockChangeEmail).toHaveBeenCalledWith('new-address@example.com', EMAIL_CURRENT_PASSWORD);
    expect(containsText(root, /check both your current and new email inboxes/i)).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockTrackAuthEvent).toHaveBeenCalledWith('account_security_email_requested');
  });

  it('blocks an invalid new-email shape, without calling changeEmail', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await setInput(root, 'Password', EMAIL_CURRENT_PASSWORD);
    await setInput(root, 'New email', 'not-an-email');
    await pressLabel(root, 'Update email');

    expect(mockChangeEmail).not.toHaveBeenCalled();
    expect(containsText(root, 'Enter a valid email address.')).toBe(true);
  });

  it('blocks submit and calls neither the current-password message nor changeEmail for an empty current password', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    await setInput(root, 'New email', 'new-address@example.com');
    await pressLabel(root, 'Update email');

    expect(mockChangeEmail).not.toHaveBeenCalled();
    expect(containsText(root, 'Enter your current password.')).toBe(true);
  });

  it('shows a specific, non-generic error for a wrong current password on the email form, without disturbing the password section', async () => {
    mockAuthState = authenticatedState();
    mockChangeEmail.mockResolvedValue({
      error: { message: 'invalid credentials', code: 'invalid_credentials' },
    });
    const root = await mount();

    await fillValidEmailForm(root, 'new-address@example.com');
    await pressLabel(root, 'Update email');

    expect(containsText(root, 'Your current password is incorrect.')).toBe(true);
    expect(findByLabel(root, 'Current password')).toBeTruthy();
    expect(findByLabel(root, 'New password')).toBeTruthy();
    expect(findByLabel(root, 'Confirm new password')).toBeTruthy();
  });

  it('shows offline copy for an offline email-change failure', async () => {
    mockAuthState = authenticatedState();
    mockChangeEmail.mockResolvedValue({ error: networkFailure() });
    const root = await mount();

    await fillValidEmailForm(root, 'new-address@example.com');
    await pressLabel(root, 'Update email');

    expect(containsText(root, /offline/i)).toBe(true);
  });

  it('shows rate-limited copy for a rate-limited email-change failure', async () => {
    mockAuthState = authenticatedState();
    mockChangeEmail.mockResolvedValue({
      error: { message: 'rate limited', code: 'over_email_send_rate_limit' },
    });
    const root = await mount();

    await fillValidEmailForm(root, 'new-address@example.com');
    await pressLabel(root, 'Update email');

    expect(containsText(root, /too many attempts/i)).toBe(true);
  });

  it('guards against a repeat press firing changeEmail twice', async () => {
    mockAuthState = authenticatedState();
    let resolveFirst!: (value: { error: unknown }) => void;
    mockChangeEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const root = await mount();
    await fillValidEmailForm(root, 'new-address@example.com');

    const button = findByLabel(root, 'Update email');
    await act(async () => {
      button.props.onPress();
      await button.props.onPress();
    });

    expect(mockChangeEmail).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ error: null });
    });
  });

  it('never renders the raw current or new password, and never passes them as a trackAuthEvent argument', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({ error: null });
    const root = await mount();

    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(containsText(root, CURRENT_PASSWORD)).toBe(false);
    expect(containsText(root, NEW_PASSWORD)).toBe(false);
    for (const call of mockTrackAuthEvent.mock.calls) {
      for (const arg of call) {
        expect(JSON.stringify(arg)).not.toContain(CURRENT_PASSWORD);
        expect(JSON.stringify(arg)).not.toContain(NEW_PASSWORD);
      }
    }
  });

  it('a failure in one section does not disturb the other section\'s state', async () => {
    mockAuthState = authenticatedState();
    mockChangePassword.mockResolvedValue({
      error: { message: 'invalid credentials', code: 'invalid_credentials' },
    });
    const root = await mount();

    await setInput(root, 'New email', 'new-address@example.com');
    await fillValidPasswordForm(root);
    await pressLabel(root, 'Update password');

    expect(containsText(root, 'Your current password is incorrect.')).toBe(true);
    expect(findByLabel(root, 'New email').props.value).toBe('new-address@example.com');
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });
});

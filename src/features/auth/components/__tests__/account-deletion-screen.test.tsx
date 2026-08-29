import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AccountDeletionScreen } from '@/features/auth/components/account-deletion-screen';

const mockPush = jest.fn();
const mockDeleteAccount = jest.fn<(
  currentPassword: string,
  confirmation: string,
) => Promise<{ error: unknown }>>();
let mockAuthState: { status: 'authenticated' | 'guest' | 'initializing' } = { status: 'authenticated' };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ deleteAccount: mockDeleteAccount }),
}));

function findByLabel(root: ReactTestRenderer, label: string) {
  return root.root.find((node) => node.props.accessibilityLabel === label);
}

function containsText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) =>
    node.children.some((child) => typeof child === 'string' && (typeof text === 'string' ? child === text : text.test(child))),
  ).length > 0;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AccountDeletionScreen', () => {
  afterEach(() => {
    mockPush.mockReset();
    mockDeleteAccount.mockReset();
    mockDeleteAccount.mockResolvedValue({ error: null });
    mockAuthState = { status: 'authenticated' };
  });

  it('shows a signed-in warning and keeps deletion disabled until both exact confirmations are present', async () => {
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<AccountDeletionScreen />); });
    const button = findByLabel(root, 'Delete account permanently');
    expect(button.props.disabled).toBe(true);

    act(() => findByLabel(root, 'Current password').props.onChangeText('correct-password'));
    expect(button.props.disabled).toBe(true);
    act(() => findByLabel(root, 'Type DELETE to confirm').props.onChangeText('delete'));
    expect(findByLabel(root, 'Delete account permanently').props.disabled).toBe(true);
    expect(containsText(root, /immediately and permanently/i)).toBe(true);
  });

  it('requires exact DELETE, forwards credentials only to the action, and prevents same-tick double submission', async () => {
    let resolve!: (value: { error: null }) => void;
    mockDeleteAccount.mockImplementation(() => new Promise((nextResolve) => { resolve = nextResolve; }));
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<AccountDeletionScreen />); });
    act(() => {
      findByLabel(root, 'Current password').props.onChangeText('correct-password');
      findByLabel(root, 'Type DELETE to confirm').props.onChangeText('DELETE');
    });
    const button = findByLabel(root, 'Delete account permanently');
    act(() => { button.props.onPress(); button.props.onPress(); });
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount).toHaveBeenCalledWith('correct-password', 'DELETE');
    expect(findByLabel(root, 'Delete account permanently').props.disabled).toBe(true);
    await act(async () => resolve({ error: null }));
    expect(containsText(root, /permanently deleted/i)).toBe(true);
    expect(() => findByLabel(root, 'Delete account permanently')).toThrow();
  });

  it('keeps rendering the success view even if authState has already flipped to guest by the time this renders', async () => {
    let resolve!: (value: { error: null }) => void;
    mockDeleteAccount.mockImplementation(() => new Promise((nextResolve) => { resolve = nextResolve; }));
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<AccountDeletionScreen />); });
    act(() => {
      findByLabel(root, 'Current password').props.onChangeText('correct-password');
      findByLabel(root, 'Type DELETE to confirm').props.onChangeText('DELETE');
    });
    act(() => { findByLabel(root, 'Delete account permanently').props.onPress(); });

    // Simulate the real production race: by the time deleteAccount's
    // promise resolves, IdentityProvider's reactive SIGNED_OUT handling has
    // already flipped authState to guest.
    mockAuthState = { status: 'guest' };
    await act(async () => resolve({ error: null }));

    expect(containsText(root, /permanently deleted/i)).toBe(true);
    expect(() => findByLabel(root, 'Go to sign in')).toThrow();
  });

  it('renders closed-set actionable errors without raw backend detail or credentials', async () => {
    mockDeleteAccount.mockResolvedValue({ error: { status: 429, message: 'raw backend secret' } });
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<AccountDeletionScreen />); });
    act(() => {
      findByLabel(root, 'Current password').props.onChangeText('correct-password');
      findByLabel(root, 'Type DELETE to confirm').props.onChangeText('DELETE');
    });
    await act(async () => { findByLabel(root, 'Delete account permanently').props.onPress(); });
    await flush();
    expect(containsText(root, /too many attempts/i)).toBe(true);
    expect(containsText(root, /raw backend secret|correct-password/i)).toBe(false);
  });

  it('offers sign-in guidance to guests and does not render the deletion form', async () => {
    mockAuthState = { status: 'guest' };
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<AccountDeletionScreen />); });
    expect(findByLabel(root, 'Go to sign in')).toBeDefined();
    expect(() => findByLabel(root, 'Delete account permanently')).toThrow();
  });
});

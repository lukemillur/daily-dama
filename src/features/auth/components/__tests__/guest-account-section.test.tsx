import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AuthState } from '@/features/auth/model/auth-state';

import { GuestAccountSection } from '@/features/auth/components/guest-account-section';

let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };
const mockPush = jest.fn();

jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function findAllByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.props.accessibilityLabel === label);
}

function authenticatedState(): AuthState {
  return {
    status: 'authenticated',
    session: { access_token: 'tok', user: { email: 'someone@example.com' } } as never,
    lastEvent: 'SIGNED_IN',
  };
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<GuestAccountSection />);
  });
  return root;
}

describe('GuestAccountSection', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockAuthState = { status: 'guest', reason: 'signedOut' };
  });

  it('renders nothing while initializing', async () => {
    mockAuthState = { status: 'initializing' };
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
  });

  it('renders nothing when authenticated', async () => {
    mockAuthState = authenticatedState();
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
  });

  it('renders nothing during password recovery', async () => {
    mockAuthState = { status: 'passwordRecovery', session: { access_token: 'tok' } as never };
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
  });

  it('renders Sign up and Sign in entry points for a guest', async () => {
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBeGreaterThan(0);
    expect(findAllByLabel(root, 'Sign in').length).toBeGreaterThan(0);
  });

  it('navigates to /auth/sign-up on Sign up', async () => {
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Sign up').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/auth/sign-up');
  });

  it('navigates to /auth/sign-in on Sign in', async () => {
    const root = await mount();

    await act(async () => {
      findByLabel(root, 'Sign in').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
});

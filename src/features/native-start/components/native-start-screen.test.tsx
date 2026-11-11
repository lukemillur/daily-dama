import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { NativeStartScreen } from './native-start-screen';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

function textOf(node: ReturnType<ReturnType<typeof create>['toJSON']>): string {
  return JSON.stringify(node);
}

describe('NativeStartScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it('shows the wordmark with Get started and Sign in actions', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<NativeStartScreen />);
    });

    expect(textOf(root.toJSON())).toContain('Daily Dama');
    expect(textOf(root.toJSON())).toContain('Get started');
    expect(textOf(root.toJSON())).toContain('Sign in');
    expect(root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.type === 'string')).toHaveLength(2);
  });

  it('opens Home, which hosts onboarding, when Get started is pressed', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<NativeStartScreen />);
    });

    const button = root.root.find(
      (n) => n.props.accessibilityLabel === 'Get started' && typeof n.props.onPress === 'function',
    );
    act(() => {
      button.props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith('/app/home');
  });

  it('opens the sign-in route when Sign in is pressed', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<NativeStartScreen />);
    });

    const button = root.root.find(
      (n) => n.props.accessibilityLabel === 'Sign in' && typeof n.props.onPress === 'function',
    );
    act(() => {
      button.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

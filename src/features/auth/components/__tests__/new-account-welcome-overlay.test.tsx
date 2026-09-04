import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);

import {
  NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS,
  NewAccountWelcomeOverlay,
} from '@/features/auth/components/new-account-welcome-overlay';

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

describe('NewAccountWelcomeOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders with the "Account verified" accessibility label', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NewAccountWelcomeOverlay onDismiss={jest.fn()} />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not call onDismiss before the auto-dismiss duration elapses', () => {
    const onDismiss = jest.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NewAccountWelcomeOverlay onDismiss={onDismiss} />);
    });

    act(() => {
      jest.advanceTimersByTime(NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS - 100);
    });

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it('calls onDismiss exactly once after the auto-dismiss duration elapses, with no tap required', () => {
    const onDismiss = jest.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NewAccountWelcomeOverlay onDismiss={onDismiss} />);
    });

    act(() => {
      jest.advanceTimersByTime(NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS + 1000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('clears its timers on unmount so onDismiss is never called afterward', () => {
    const onDismiss = jest.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NewAccountWelcomeOverlay onDismiss={onDismiss} />);
    });

    act(() => {
      root.unmount();
    });

    act(() => {
      jest.advanceTimersByTime(NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS + 1000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});

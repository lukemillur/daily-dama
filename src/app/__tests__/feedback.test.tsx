// The feedback route shows the same form on every platform.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@/features/feedback/persistence/submit-feedback', () => ({
  submitFeedback: jest.fn(),
}));
// The release component schedules an animation frame that would outlive the test environment.
jest.mock('@/shared/splash/splash-ready', () => ({ HideSplashWhenMounted: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import FeedbackRoute from '@/app/feedback';

function labels(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll((node) => node.props.accessibilityLabel === label);
}

describe('FeedbackRoute', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it.each(['ios', 'android', 'web'] as const)('shows the form on %s', (os) => {
    Platform.OS = os;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FeedbackRoute />);
    });
    expect(labels(tree, 'Send feedback').length).toBeGreaterThan(0);
    expect(labels(tree, 'Back to Profile')).toHaveLength(0);
  });
});

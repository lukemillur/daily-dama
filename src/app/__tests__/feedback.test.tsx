// The feedback route picks the form on web and the honest unavailable state
// on native; FeedbackScreen itself stays platform-agnostic.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@/features/feedback/persistence/submit-feedback', () => ({
  submitFeedback: jest.fn(),
}));
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

  it('shows the unavailable state on native', () => {
    Platform.OS = 'ios';
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FeedbackRoute />);
    });
    expect(labels(tree, 'Back to Profile').length).toBeGreaterThan(0);
    expect(labels(tree, 'Send feedback')).toHaveLength(0);
  });

  it('shows the form on web', () => {
    Platform.OS = 'web';
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FeedbackRoute />);
    });
    expect(labels(tree, 'Send feedback').length).toBeGreaterThan(0);
  });
});

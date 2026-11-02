// Native (guest-only) builds have no Supabase client, so feedback cannot be
// sent. The unavailable state must say so, offer Back to Profile, and expose
// no submission controls. jest-expo defaults Platform.OS to 'ios'.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockSubmitFeedback = jest.fn<(...args: any[]) => any>();
jest.mock('@/features/feedback/persistence/submit-feedback', () => ({
  submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { FeedbackUnavailableScreen } from '@/features/feedback/components/feedback-unavailable-screen';

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

describe('FeedbackUnavailableScreen', () => {
  beforeEach(() => {
    mockSubmitFeedback.mockReset();
    mockPush.mockReset();
  });

  it('explains unavailability and returns to Profile', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FeedbackUnavailableScreen />);
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Feedback is not available in the app yet.');

    const back = findByAccessibilityLabel(tree, 'Back to Profile')[0];
    expect(back).toBeDefined();
    act(() => {
      back.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/app/profile');
  });

  it('offers no way to submit feedback', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FeedbackUnavailableScreen />);
    });
    expect(findByAccessibilityLabel(tree, 'Name')).toHaveLength(0);
    expect(findByAccessibilityLabel(tree, 'Message')).toHaveLength(0);
    expect(findByAccessibilityLabel(tree, 'Send feedback')).toHaveLength(0);
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });
});

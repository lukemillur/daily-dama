// T217.2: confirms the standalone feedback form renders all three fields,
// keeps submit disabled until `message` is non-empty, and shows
// success/error state after a mocked insert resolves/rejects.

import { describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockSubmitFeedback = jest.fn<(...args: any[]) => any>();
jest.mock('@/features/feedback/persistence/submit-feedback', () => ({
  submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { FeedbackScreen } from '@/features/feedback/components/feedback-screen';

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll(
    (node) => node.props.accessibilityLabel === label,
  )[0];
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll(
    (node) => Array.isArray(node.children) && node.children.includes(text),
  )[0];
}

describe('FeedbackScreen', () => {
  beforeEach(() => {
    mockSubmitFeedback.mockReset();
    mockPush.mockReset();
  });

  it('renders name, email, and message fields', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    expect(findByAccessibilityLabel(root, 'Name')).toBeTruthy();
    expect(findByAccessibilityLabel(root, 'Email')).toBeTruthy();
    expect(findByAccessibilityLabel(root, 'Message')).toBeTruthy();
  });

  it('keeps submit disabled until message is non-empty', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    const submitButton = findByAccessibilityLabel(root, 'Send feedback');
    expect(submitButton.props.disabled).toBe(true);

    const messageField = findByAccessibilityLabel(root, 'Message');
    act(() => {
      messageField.props.onChangeText('Bug: the sesh timer is off by one.');
    });

    const updatedSubmitButton = findByAccessibilityLabel(root, 'Send feedback');
    expect(updatedSubmitButton.props.disabled).toBe(false);

    act(() => {
      messageField.props.onChangeText('   ');
    });
    const blankMessageButton = findByAccessibilityLabel(root, 'Send feedback');
    expect(blankMessageButton.props.disabled).toBe(true);
  });

  it('shows a success state after a mocked insert resolves', async () => {
    mockSubmitFeedback.mockResolvedValue({ status: 'succeeded', value: undefined });

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    const messageField = findByAccessibilityLabel(root, 'Message');
    act(() => {
      messageField.props.onChangeText('Loving the app so far.');
    });

    const submitButton = findByAccessibilityLabel(root, 'Send feedback');
    await act(async () => {
      await submitButton.props.onPress();
    });

    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
    expect(findByText(root, 'Thanks for the feedback.')).toBeTruthy();
  });

  it('shows an error state after a mocked insert rejects', async () => {
    mockSubmitFeedback.mockResolvedValue({
      status: 'failed',
      error: { kind: 'network', message: 'offline' },
    });

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    const messageField = findByAccessibilityLabel(root, 'Message');
    act(() => {
      messageField.props.onChangeText('Loving the app so far.');
    });

    const submitButton = findByAccessibilityLabel(root, 'Send feedback');
    await act(async () => {
      await submitButton.props.onPress();
    });

    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
    expect(
      findByText(root, 'Something went wrong sending your feedback. Please try again.'),
    ).toBeTruthy();
  });
});

// T217.2/T258: confirms the standalone feedback form renders Name and
// Message only (no Email field -- email is server-owned, derived from the
// caller's own JWT via a BEFORE INSERT trigger, never client-supplied), keeps
// submit disabled until `message` is non-empty and within the server's
// message-length bound, and shows success/error state after a mocked insert
// resolves/rejects.

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

  it('renders name and message fields, and no email field anywhere', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    expect(findByAccessibilityLabel(root, 'Name')).toBeTruthy();
    expect(findByAccessibilityLabel(root, 'Message')).toBeTruthy();
    expect(findByAccessibilityLabel(root, 'Email')).toBeFalsy();
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

  it('shows a success state after a mocked insert resolves, never sending a client-supplied email', async () => {
    // This component has no auth/session awareness at all -- the server
    // derives `email` entirely from the caller's own JWT via the BEFORE
    // INSERT trigger, so there's nothing session-shaped to mock here. This
    // proves the client never sends an email field at all, unconditionally,
    // which covers "a signed-in submission never sends a client-supplied
    // email" regardless of the submitter's auth state.
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
    expect(mockSubmitFeedback).toHaveBeenCalledWith({ name: '', message: 'Loving the app so far.' });
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

  it('stays enabled at exactly the message character limit, with no warning shown', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    const messageField = findByAccessibilityLabel(root, 'Message');
    act(() => {
      messageField.props.onChangeText('x'.repeat(2000));
    });

    const submitButton = findByAccessibilityLabel(root, 'Send feedback');
    expect(submitButton.props.disabled).toBe(false);
    expect(messageField.props.error).toBeUndefined();
  });

  it('warns and disables submit once the message exceeds the character limit', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<FeedbackScreen />);
    });

    const messageField = findByAccessibilityLabel(root, 'Message');
    // react-test-renderer doesn't enforce native `maxLength` truncation, so
    // this is the only way to reach the over-limit branch in this harness.
    act(() => {
      messageField.props.onChangeText('x'.repeat(2001));
    });

    const submitButton = findByAccessibilityLabel(root, 'Send feedback');
    expect(submitButton.props.disabled).toBe(true);
    expect(messageField.props.error).toBeTruthy();
  });
});

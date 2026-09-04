import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AccountDeletedScreen } from '@/features/auth/components/account-deleted-screen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  ...(jest.requireActual('expo-router') as Record<string, unknown>),
  useRouter: () => ({ replace: mockReplace }),
}));

function containsText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) =>
    node.children.some((child) => typeof child === 'string' && (typeof text === 'string' ? child === text : text.test(child))),
  ).length > 0;
}

describe('AccountDeletedScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the terminal deletion confirmation copy and the redirect subtitle', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<AccountDeletedScreen />);
    });
    expect(containsText(root, /permanently deleted/i)).toBe(true);
    expect(containsText(root, /returned to the landing page/i)).toBe(true);
  });

  it('redirects to the landing page only after the delay elapses', () => {
    act(() => {
      create(<AccountDeletedScreen />);
    });

    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

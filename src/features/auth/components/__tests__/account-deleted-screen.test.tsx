import { describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AccountDeletedScreen } from '@/features/auth/components/account-deleted-screen';

function containsText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) =>
    node.children.some((child) => typeof child === 'string' && (typeof text === 'string' ? child === text : text.test(child))),
  ).length > 0;
}

describe('AccountDeletedScreen', () => {
  it('renders the terminal deletion confirmation copy', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<AccountDeletedScreen />);
    });
    expect(containsText(root, /permanently deleted/i)).toBe(true);
  });
});

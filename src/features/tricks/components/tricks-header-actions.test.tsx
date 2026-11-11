import { describe, expect, it, jest } from '@jest/globals';
import { Modal } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TricksHeaderActions } from './tricks-header-actions';

jest.mock('@/features/profile/state/use-resolved-theme', () => ({
  useResolvedTheme: () => ({ background: '#000000', text: '#ffffff' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

function setup() {
  const handlers = { onDefine: jest.fn(), onOpenGoals: jest.fn(), onOpenNotes: jest.fn(), onOpenLaced: jest.fn() };
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<TricksHeaderActions {...handlers} />);
  });
  const byLabel = (label: string) =>
    root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  // styled-components wrap Pressable, so each item matches twice; keep the outermost match.
  const menuItems = () =>
    root.root
      .findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'menuitem')
      .filter((n, i, all) => all.findIndex((m) => m.props.onPress === n.props.onPress) === i);
  return { root, handlers, byLabel, menuItems };
}

describe('TricksHeaderActions', () => {
  it('exposes a labelled define button that calls onDefine', () => {
    const { byLabel, handlers } = setup();
    const define = byLabel('Define new trick');
    expect(define.props.accessibilityRole).toBe('button');
    act(() => define.props.onPress());
    expect(handlers.onDefine).toHaveBeenCalledTimes(1);
  });

  it('opens the menu with the three destinations and routes each, closing first', () => {
    const { root, byLabel, menuItems, handlers } = setup();
    expect(byLabel('More trick actions').props.accessibilityState).toEqual({ expanded: false });
    expect(root.root.findByType(Modal).props.visible).toBe(false);

    const names = ['onOpenGoals', 'onOpenNotes', 'onOpenLaced'] as const;
    names.forEach((name, index) => {
      act(() => byLabel('More trick actions').props.onPress());
      expect(root.root.findByType(Modal).props.visible).toBe(true);
      expect(byLabel('More trick actions').props.accessibilityState).toEqual({ expanded: true });
      const items = menuItems();
      expect(items).toHaveLength(3);
      act(() => items[index].props.onPress());
      expect(handlers[name]).toHaveBeenCalledTimes(1);
      expect(root.root.findByType(Modal).props.visible).toBe(false);
    });
  });

  it('lists items in order with text labels', () => {
    const { byLabel, menuItems } = setup();
    act(() => byLabel('More trick actions').props.onPress());
    const labels = menuItems().map((item) =>
      item.findAll((c) => typeof c.props.children === 'string').map((c) => c.props.children as string)[0],
    );
    expect(labels).toEqual(['Trick goals', 'Trick notes', 'Laced tricks']);
  });

  it('closes via Back (onRequestClose) or backdrop without navigating', () => {
    const { root, byLabel, handlers } = setup();
    act(() => byLabel('More trick actions').props.onPress());
    act(() => root.root.findByType(Modal).props.onRequestClose());
    expect(root.root.findByType(Modal).props.visible).toBe(false);

    act(() => byLabel('More trick actions').props.onPress());
    act(() => byLabel('Close menu').props.onPress());
    expect(root.root.findByType(Modal).props.visible).toBe(false);
    Object.values(handlers).forEach((h) => expect(h).not.toHaveBeenCalled());
  });
});

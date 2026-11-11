import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import TricksScreen from '@/app/app/tricks/index';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockScreenOptions: Record<string, any> | undefined;
let mockDirectoryProps: Record<string, any> | undefined;

jest.mock('expo-router', () => {
  const Stack = {
    Screen: ({ options }: { options: Record<string, any> }) => {
      mockScreenOptions = options;
      return null;
    },
  };
  return { Stack, useRouter: () => mockRouter };
});
jest.mock('@/features/onboarding/state/require-onboarding', () => ({ useRequireOnboarding: () => true }));
jest.mock('@/features/profile/state/use-resolved-theme', () => ({
  useResolvedTheme: () => ({ background: '#000000', text: '#ffffff' }),
}));
jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  useCustomTricks: () => ({ tricks: [] }),
  useCustomTrickActions: () => ({}),
}));
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({ selectedTrickIds: ['a', 'b'] }),
  useUserProfileActions: () => ({ toggleSelectedTrick: jest.fn() }),
}));
jest.mock('@/features/stats/state/practice-history-provider', () => ({
  usePracticeHistory: () => ({ sessions: [] }),
}));
jest.mock('@/features/notes/state/note-provider', () => ({ useNotes: () => ({ notes: [] }) }));
jest.mock('@/features/goals/state/goal-provider', () => ({ useGoals: () => ({ goals: [] }) }));
jest.mock('@/features/tricks/components/trick-directory', () => ({
  TrickDirectory: (props: Record<string, any>) => {
    mockDirectoryProps = props;
    return null;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function mount(os: 'ios' | 'android' | 'web'): ReactTestRenderer {
  jest.replaceProperty(Platform, 'OS', os);
  let root!: ReactTestRenderer;
  act(() => {
    root = create(<TricksScreen />);
  });
  return root;
}

describe('Tricks index route', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockScreenOptions = undefined;
    mockDirectoryProps = undefined;
    mockRouter.push.mockClear();
  });

  it('native: moves title, search and actions into the navigation header', () => {
    const root = mount('ios');

    expect(mockDirectoryProps?.nativeHeader).toBe(true);
    expect(mockDirectoryProps?.header).toBeUndefined();
    expect(mockDirectoryProps?.headerAction).toBeUndefined();
    expect(mockDirectoryProps?.search.query).toBe('');

    const search = mockScreenOptions!.headerSearchBarOptions;
    act(() => search.onChangeText({ nativeEvent: { text: 'cup' } }));
    expect(mockDirectoryProps?.search.query).toBe('cup');
    act(() => search.onCancelButtonPress());
    expect(mockDirectoryProps?.search.query).toBe('');

    const [plus, more] = mockScreenOptions!.unstable_headerRightItems();
    expect(plus.accessibilityLabel).toBe('Define new trick');
    plus.onPress();
    expect(more.accessibilityLabel).toBe('More trick actions');
    const actions = more.menu.items as { label: string; onPress: () => void }[];
    expect(actions.map((item) => item.label)).toEqual(['Trick goals', 'Trick notes', 'Laced tricks']);
    actions.forEach((item) => item.onPress());
    expect(mockRouter.push.mock.calls.map((call) => call[0])).toEqual([
      '/app/tricks/custom/new',
      '/app/tricks/goals',
      '/app/tricks/notes',
      '/app/tricks/laced',
    ]);
    act(() => root.unmount());
  });

  it('android: supplies headerRight actions that route to create, goals, notes and laced', () => {
    const root = mount('android');
    const search = mockScreenOptions!.headerSearchBarOptions;
    act(() => search.onChangeText({ nativeEvent: { text: 'cup' } }));
    expect(mockDirectoryProps?.search.query).toBe('cup');
    act(() => search.onCancelButtonPress());
    expect(mockDirectoryProps?.search.query).toBe('');

    let header!: ReactTestRenderer;
    act(() => {
      header = create(mockScreenOptions!.headerRight());
    });
    const press = (label: string) =>
      act(() => header.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onPress)[0].props.onPress());
    const menuItem = (index: number) =>
      act(() =>
        header.root
          .findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'menuitem')
          .filter((n, i, all) => all.findIndex((m) => m.props.onPress === n.props.onPress) === i)
          [index].props.onPress(),
      );
    press('Define new trick');
    [0, 1, 2].forEach((index) => {
      press('More trick actions');
      menuItem(index);
    });
    expect(mockRouter.push.mock.calls.map((call) => call[0])).toEqual([
      '/app/tricks/custom/new',
      '/app/tricks/goals',
      '/app/tricks/notes',
      '/app/tricks/laced',
    ]);
    act(() => header.unmount());
    act(() => root.unmount());
  });

  it('ios: leaves headerRight to unstable_headerRightItems', () => {
    const root = mount('ios');
    expect(mockScreenOptions!.headerRight).toBeUndefined();
    act(() => root.unmount());
  });

  it('web: keeps the in-list header block and registers no native header options', () => {
    const root = mount('web');

    expect(mockScreenOptions).toBeUndefined();
    expect(mockDirectoryProps?.nativeHeader).toBeUndefined();
    expect(mockDirectoryProps?.search).toBeUndefined();
    expect(mockDirectoryProps?.header).toMatchObject({ eyebrow: 'Your trick library', title: "What's up next?" });
    expect(mockDirectoryProps?.header.introduction).toContain('2 tricks ready');
    expect(mockDirectoryProps?.headerAction).toBeDefined();
    act(() => root.unmount());
  });
});

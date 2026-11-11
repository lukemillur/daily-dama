import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard, Platform, ScrollView, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';

import { KeyboardAwareScroll } from './keyboard-aware-scroll';

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});

function renderProps(os: typeof Platform.OS, extra: object = {}) {
  Platform.OS = os;
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <KeyboardAwareScroll {...extra}>
        <Text>x</Text>
      </KeyboardAwareScroll>,
    );
  });
  return tree.root.findByType(ScrollView).props as Record<string, unknown>;
}

describe('KeyboardAwareScroll', () => {
  it('applies keyboard-aware defaults on iOS', () => {
    const props = renderProps('ios');
    expect(props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(props.keyboardDismissMode).toBe('interactive');
    expect(props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('omits native-only props on web', () => {
    const props = renderProps('web');
    expect(props.automaticallyAdjustKeyboardInsets).toBeUndefined();
    expect(props.keyboardDismissMode).toBeUndefined();
    expect(props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('lets callers override defaults and forwards styles', () => {
    const props = renderProps('ios', {
      keyboardShouldPersistTaps: 'never',
      style: { flex: 1 },
      contentContainerStyle: { paddingBottom: 24 },
    });
    expect(props.keyboardShouldPersistTaps).toBe('never');
    expect(props.style).toEqual({ flex: 1 });
    expect(props.contentContainerStyle).toEqual({ paddingBottom: 24 });
  });
});

describe('KeyboardAwareScroll Android keyboard overlap', () => {
  type Handler = (e: { endCoordinates: { screenY: number } }) => void;
  type Measure = (cb: (x: number, y: number, w: number, h: number) => void) => void;
  let handlers: Record<string, Handler>;
  let removed: string[];
  let measure: Measure;
  let mounted: ReturnType<typeof create>[] = [];

  beforeEach(() => {
    handlers = {};
    removed = [];
    measure = (cb) => cb(0, 100, 400, 900); // scroll view bottom edge at y=1000
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: Handler) => {
      handlers[name] = h;
      return { remove: () => removed.push(name) };
    }) as never);
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(null as never);
  });
  afterEach(() => {
    mounted.forEach((tree) => act(() => tree.unmount()));
    mounted = [];
    jest.restoreAllMocks();
  });

  function mount(os: typeof Platform.OS) {
    Platform.OS = os;
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <KeyboardAwareScroll
          ref={(node) => {
            if (node) (node as unknown as { measureInWindow: Measure }).measureInWindow = (cb) => measure(cb);
          }}
        >
          <Text>x</Text>
        </KeyboardAwareScroll>,
      );
    });
    mounted.push(tree);
    return tree;
  }
  const spacers = (tree: ReturnType<typeof create>) => tree.root.findAllByProps({ testID: 'keyboard-overlap-spacer' });

  it('adds a spacer equal to the measured overlap and removes it on hide', () => {
    const tree = mount('android');
    act(() => handlers.keyboardDidShow({ endCoordinates: { screenY: 700 } }));
    expect(spacers(tree)[0].props.style).toEqual({ height: 300 });
    act(() => handlers.keyboardDidHide({ endCoordinates: { screenY: 0 } }));
    expect(spacers(tree)).toHaveLength(0);
  });

  it('adds no spacer when the keyboard does not cover the scroll view', () => {
    const tree = mount('android');
    act(() => handlers.keyboardDidShow({ endCoordinates: { screenY: 1200 } }));
    expect(spacers(tree)).toHaveLength(0);
  });

  it('drops a measurement that resolves after the keyboard hid', () => {
    let pending: Parameters<Measure>[0] | undefined;
    const tree = mount('android');
    measure = (cb) => {
      pending = cb;
    };
    act(() => handlers.keyboardDidShow({ endCoordinates: { screenY: 700 } }));
    act(() => handlers.keyboardDidHide({ endCoordinates: { screenY: 0 } }));
    act(() => pending?.(0, 100, 400, 900));
    expect(spacers(tree)).toHaveLength(0);
  });

  it('removes listeners on unmount', () => {
    const tree = mount('android');
    act(() => tree.unmount());
    expect(removed.sort()).toEqual(['keyboardDidChangeFrame', 'keyboardDidHide', 'keyboardDidShow']);
  });

  it.each(['ios', 'web'] as const)('does not subscribe or add a spacer on %s', (os) => {
    const tree = mount(os);
    expect(Keyboard.addListener).not.toHaveBeenCalled();
    expect(spacers(tree)).toHaveLength(0);
  });
});

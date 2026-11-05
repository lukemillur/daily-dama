import { afterEach, describe, expect, it } from '@jest/globals';
import { Platform, ScrollView, Text } from 'react-native';
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

import { describe, expect, it } from '@jest/globals';
import { Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create } from 'react-test-renderer';

import { Screen, withNativeTabClearance } from '@/components/ui/screen';

describe('withNativeTabClearance', () => {
  it('adds the bottom edge on native so content clears the floating tab bar', () => {
    expect(withNativeTabClearance(['top', 'left', 'right'], 'ios')).toEqual(['top', 'left', 'right', 'bottom']);
    expect(withNativeTabClearance(['left', 'right'], 'ios')).toEqual(['left', 'right', 'bottom']);
  });

  it('does not duplicate an explicit bottom edge', () => {
    expect(withNativeTabClearance(['top', 'bottom'], 'ios')).toEqual(['top', 'bottom']);
  });

  it('defaults to all four edges on native when none are given', () => {
    expect(withNativeTabClearance(undefined, 'ios')).toEqual(['top', 'left', 'right', 'bottom']);
  });

  it('leaves web edges untouched', () => {
    expect(withNativeTabClearance(['top', 'left', 'right'], 'web')).toEqual(['top', 'left', 'right']);
    expect(withNativeTabClearance(undefined, 'web')).toBeUndefined();
  });
});

describe('Screen', () => {
  it('requests the bottom safe-area edge on native even when callers list only top/left/right', () => {
    const metrics = {
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 100 },
    };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <Screen edges={['top', 'left', 'right']}>
            <Text>content</Text>
          </Screen>
        </SafeAreaProvider>,
      );
    });
    expect(Platform.OS).not.toBe('web');
    // The native SafeAreaView applies insets itself; the contract is that bottom is requested.
    const root = renderer.root.findByType('RNCSafeAreaView' as never);
    expect(root.props.edges).toMatchObject({ top: 'additive', bottom: 'additive' });
  });
});

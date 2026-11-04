import { describe, expect, it } from '@jest/globals';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { act, create } from 'react-test-renderer';

import { Screen } from './screen';

function renderEdges(headerHeight: number | undefined, edges?: readonly ('top' | 'left' | 'right' | 'bottom')[]) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <HeaderHeightContext.Provider value={headerHeight}>
        <Screen edges={edges}>
          <Text>content</Text>
        </Screen>
      </HeaderHeightContext.Provider>,
    );
  });
  return tree.root.findByType(SafeAreaView).props.edges as unknown;
}

describe('Screen top inset under a native header', () => {
  it('drops the top edge when a stack header is visible', () => {
    expect(renderEdges(96, ['top', 'left', 'right'])).toEqual(['left', 'right']);
  });

  it('removes the top edge from the default edges too', () => {
    expect(renderEdges(96)).toEqual(['right', 'bottom', 'left']);
  });

  it('keeps the top edge when no header is shown', () => {
    expect(renderEdges(0, ['top', 'left', 'right'])).toEqual(['top', 'left', 'right']);
    expect(renderEdges(undefined, ['top', 'left', 'right'])).toEqual(['top', 'left', 'right']);
  });
});

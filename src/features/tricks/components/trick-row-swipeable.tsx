import { type ReactNode, useRef } from 'react';
import { Pressable } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { styled } from 'styled-components/native';

import type { TrickRowAction } from '@/features/tricks/model/trick-row-actions';

interface TrickRowSwipeableProps {
  readonly actions: readonly TrickRowAction[];
  /** Called when this row starts opening so the list can close whichever row was open before. */
  readonly onWillOpen: (methods: SwipeableMethods) => void;
  readonly onClosed: (methods: SwipeableMethods) => void;
  readonly children: ReactNode;
}

// Actions only ever run from an explicit tap on a revealed button: a long swipe just opens the
// panel (no full-swipe trigger), so Delete can never fire from a stray drag.
export function TrickRowSwipeable({ actions, onWillOpen, onClosed, children }: TrickRowSwipeableProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const leading = actions.filter((action) => action.side === 'leading');
  const trailing = actions.filter((action) => action.side === 'trailing');

  const renderPanel = (panelActions: readonly TrickRowAction[]) => (
    // ReanimatedSwipeable keeps both panels mounted (clipped off-screen) at all times, so hide them
    // from VoiceOver: the same actions are exposed once, as custom actions on the row itself.
    <Panel
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="trick-row-swipe-panel">
      {panelActions.map((action) => (
        <PanelButton
          key={action.id}
          $destructive={action.destructive}
          $primary={action.side === 'leading'}
          accessibilityLabel={action.accessibilityLabel}
          accessibilityRole="button"
          onPress={() => {
            swipeableRef.current?.close();
            action.onSelect();
          }}>
          <PanelButtonText $dark={action.side === 'leading'}>{action.label}</PanelButtonText>
        </PanelButton>
      ))}
    </Panel>
  );

  if (actions.length === 0) return <>{children}</>;

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={1}
      overshootLeft={false}
      overshootRight={false}
      dragOffsetFromLeftEdge={24}
      dragOffsetFromRightEdge={24}
      renderLeftActions={leading.length > 0 ? () => renderPanel(leading) : undefined}
      renderRightActions={trailing.length > 0 ? () => renderPanel(trailing) : undefined}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onWillOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) onClosed(swipeableRef.current);
      }}>
      {children}
    </ReanimatedSwipeable>
  );
}

const Panel = styled.View`
  flex-direction: row;
  align-items: stretch;
`;

const PanelButton = styled(Pressable)<{ readonly $destructive: boolean; readonly $primary: boolean }>`
  min-width: 72px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  background-color: ${({ $destructive, $primary }) =>
    $destructive ? '#b8381d' : $primary ? '#f4c94d' : '#274137'};
`;

// Label text always names the action, so Delete never relies on its red fill alone.
const PanelButtonText = styled.Text<{ readonly $dark: boolean }>`
  color: ${({ $dark }) => ($dark ? '#18382e' : '#fff8e5')};
  font-size: 14px;
  font-weight: 900;
`;

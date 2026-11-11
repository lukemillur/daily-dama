import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { deriveNestedHeaderColors } from '@/components/nested-stack-options';
import { useResolvedTheme } from '@/features/profile/state/use-resolved-theme';

const MIN_TOUCH_TARGET = 48;
const HEADER_CONTENT_HEIGHT = 56;

type Colors = ReturnType<typeof deriveNestedHeaderColors>;

/**
 * Android `headerRight` content for Tricks. iOS supplies the same actions through
 * `unstable_headerRightItems` (SF-symbol items and a native menu), which Android ignores.
 * The menu is a transparent Modal so Android Back dismisses it instead of popping Tricks.
 */
export function TricksHeaderActions({
  onDefine,
  onOpenGoals,
  onOpenNotes,
  onOpenLaced,
}: {
  readonly onDefine: () => void;
  readonly onOpenGoals: () => void;
  readonly onOpenNotes: () => void;
  readonly onOpenLaced: () => void;
}) {
  const colors = deriveNestedHeaderColors(useResolvedTheme());
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const choose = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <Row>
      <IconButton
        accessibilityRole="button"
        accessibilityLabel="Define new trick"
        onPress={onDefine}
      >
        <Glyph $color={colors.tint}>+</Glyph>
      </IconButton>
      <IconButton
        accessibilityRole="button"
        accessibilityLabel="More trick actions"
        accessibilityState={{ expanded: menuOpen }}
        onPress={() => setMenuOpen(true)}
      >
        <Glyph $color={colors.tint}>…</Glyph>
      </IconButton>
      <Modal transparent statusBarTranslucent animationType="fade" visible={menuOpen} onRequestClose={close}>
        <Backdrop accessibilityRole="button" accessibilityLabel="Close menu" onPress={close} />
        <Panel
          $colors={colors}
          style={{ top: insets.top + HEADER_CONTENT_HEIGHT }}
          accessibilityViewIsModal
        >
          <MenuItem accessibilityRole="menuitem" onPress={choose(onOpenGoals)}>
            <MenuLabel $color={colors.title}>Trick goals</MenuLabel>
          </MenuItem>
          <MenuItem accessibilityRole="menuitem" onPress={choose(onOpenNotes)}>
            <MenuLabel $color={colors.title}>Trick notes</MenuLabel>
          </MenuItem>
          <MenuItem accessibilityRole="menuitem" onPress={choose(onOpenLaced)}>
            <MenuLabel $color={colors.title}>Laced tricks</MenuLabel>
          </MenuItem>
        </Panel>
      </Modal>
    </Row>
  );
}

const Row = styled(View)`
  flex-direction: row;
  align-items: center;
`;

const IconButton = styled(Pressable)`
  min-width: ${MIN_TOUCH_TARGET}px;
  min-height: ${MIN_TOUCH_TARGET}px;
  align-items: center;
  justify-content: center;
`;

const Glyph = styled(Text)<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: 28px;
  line-height: 32px;
  font-weight: 700;
`;

const Backdrop = styled(Pressable)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`;

const Panel = styled(View)<{ $colors: Colors }>`
  position: absolute;
  right: 12px;
  min-width: 200px;
  background-color: ${({ $colors }) => $colors.background};
  border: 2px solid ${({ $colors }) => $colors.title};
`;

const MenuItem = styled(Pressable)`
  min-height: ${MIN_TOUCH_TARGET}px;
  justify-content: center;
  padding: 0 16px;
`;

const MenuLabel = styled(Text)<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: 16px;
  font-weight: 600;
`;

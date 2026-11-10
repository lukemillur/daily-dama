import { forwardRef, useCallback, useRef } from 'react';
import {
  Platform,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { useAndroidKeyboardOverlap } from './use-android-keyboard-overlap';

/**
 * Scroll container for long forms. On iOS, `automaticallyAdjustKeyboardInsets` makes UIKit grow the
 * bottom inset by the real overlap between the keyboard and this view, so the focused field scrolls
 * into view without device-specific offsets for headers, the in-flow tab bar, or safe areas.
 * On Android the IME overlays an edge-to-edge window, so a trailing spacer sized to the measured
 * overlap makes the content scrollable past the keyboard (see `useAndroidKeyboardOverlap`).
 * Native-only behavior is omitted elsewhere so web rendering stays unchanged. Callers keep their
 * own headers and action layout; this is a scroll primitive, not a visual shell.
 */
export const KeyboardAwareScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScroll(
  props,
  forwardedRef,
) {
  const innerRef = useRef<ScrollView | null>(null);
  const scrollOffset = useRef(0);
  const overlap = useAndroidKeyboardOverlap(innerRef, scrollOffset);
  const isAndroid = Platform.OS === 'android';

  const setRefs = useCallback(
    (node: ScrollView | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const { onScroll, children } = props;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const nativeDefaults: ScrollViewProps =
    Platform.OS === 'ios' ? { automaticallyAdjustKeyboardInsets: true, keyboardDismissMode: 'interactive' } : {};
  const androidProps: ScrollViewProps = isAndroid ? { onScroll: handleScroll, scrollEventThrottle: 16 } : {};
  return (
    <ScrollView ref={setRefs} keyboardShouldPersistTaps="handled" {...nativeDefaults} {...props} {...androidProps}>
      {children}
      {isAndroid && overlap > 0 ? <View testID="keyboard-overlap-spacer" style={{ height: overlap }} /> : null}
    </ScrollView>
  );
});

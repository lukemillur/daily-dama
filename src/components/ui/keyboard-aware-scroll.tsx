import { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

/**
 * Scroll container for long forms. On iOS, `automaticallyAdjustKeyboardInsets` makes UIKit grow the
 * bottom inset by the real overlap between the keyboard and this view, so the focused field scrolls
 * into view without device-specific offsets for headers, the in-flow tab bar, or safe areas.
 * The native-only props are omitted elsewhere so web rendering stays unchanged. Callers keep their
 * own headers and action layout; this is a scroll primitive, not a visual shell.
 */
export const KeyboardAwareScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScroll(
  props,
  ref,
) {
  const nativeDefaults: ScrollViewProps =
    Platform.OS === 'ios' ? { automaticallyAdjustKeyboardInsets: true, keyboardDismissMode: 'interactive' } : {};
  return <ScrollView ref={ref} keyboardShouldPersistTaps="handled" {...nativeDefaults} {...props} />;
});

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, TextInput, type ScrollView } from 'react-native';

const FOCUSED_FIELD_MARGIN = 16;

// ScrollView's public type omits the host-component measurement methods that the instance exposes.
type WindowMeasurable = {
  measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void;
};
const measurable = (scroll: ScrollView) => scroll as unknown as WindowMeasurable;

/**
 * Android draws the IME over an edge-to-edge window without resizing or panning it, so a scroll
 * view needs to leave room for the part of the keyboard that actually covers it. The overlap is
 * measured against the scroll view's real window position (not the keyboard height) so in-flow
 * tab bars and system insets are absorbed. Returns 0 and subscribes to nothing on iOS and web,
 * where UIKit (`automaticallyAdjustKeyboardInsets`) or the browser owns this behavior.
 *
 * After the spacer is applied, the focused field is scrolled above the keyboard.
 */
export function useAndroidKeyboardOverlap(scrollRef: RefObject<ScrollView | null>, scrollOffset: RefObject<number>) {
  const [overlap, setOverlap] = useState(0);
  // Incremented on every keyboard event so a measurement that resolves after a newer event is dropped.
  const generation = useRef(0);
  const keyboardTop = useRef<number | undefined>(undefined);

  const revealFocusedField = useCallback(() => {
    const scroll = scrollRef.current;
    const top = keyboardTop.current;
    const field = TextInput.State.currentlyFocusedInput();
    if (!scroll || top === undefined || !field) return;
    const current = generation.current;
    measurable(scroll).measureInWindow((_sx, scrollY) => {
      field.measureInWindow((_fx, fieldY, _fw, fieldHeight) => {
        if (current !== generation.current) return;
        const hiddenBelow = fieldY + fieldHeight + FOCUSED_FIELD_MARGIN - top;
        const hiddenAbove = scrollY - fieldY + FOCUSED_FIELD_MARGIN;
        const delta = hiddenBelow > 0 ? hiddenBelow : hiddenAbove > 0 ? -hiddenAbove : 0;
        if (delta !== 0) scroll.scrollTo({ y: Math.max(0, (scrollOffset.current ?? 0) + delta), animated: true });
      });
    });
  }, [scrollRef, scrollOffset]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const measure = (screenY: number) => {
      const current = ++generation.current;
      keyboardTop.current = screenY;
      if (scrollRef.current) measurable(scrollRef.current).measureInWindow((_x, y, _w, height) => {
        if (current !== generation.current) return;
        setOverlap(Math.max(0, Math.round(y + height - screenY)));
      });
    };
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      measure(e.endCoordinates.screenY);
      // Wait for the spacer to commit so the content is tall enough to scroll.
      clearTimeout(revealTimer);
      revealTimer = setTimeout(revealFocusedField, 100);
    });
    const change = Keyboard.addListener('keyboardDidChangeFrame', (e) => {
      if (keyboardTop.current !== undefined) measure(e.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      generation.current += 1;
      keyboardTop.current = undefined;
      setOverlap(0);
    });
    return () => {
      clearTimeout(revealTimer);
      show.remove();
      change.remove();
      hide.remove();
    };
  }, [scrollRef, revealFocusedField]);

  return overlap;
}

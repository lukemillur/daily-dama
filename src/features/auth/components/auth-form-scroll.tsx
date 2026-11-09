import { useEffect, useRef } from 'react';
import { Keyboard, Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { styled } from 'styled-components/native';

// Shared by the sign-in, sign-up and forgot-password forms. iOS grows the scroll content's bottom
// inset by the keyboard height (automaticallyAdjustKeyboardInsets), which makes the form
// scrollable above the keyboard but does not scroll it. A focused field that is already on screen
// therefore leaves the primary button half under the keyboard on a small phone, so the form
// scrolls to its end once the keyboard is up. This avoids a KeyboardAvoidingView offset that
// would double-count the SafeAreaView inset. Android resizes the window by default.
export function AuthFormScroll(props: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);

  return (
    <FormScroll
      ref={scrollRef}
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  );
}

const FormScroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;

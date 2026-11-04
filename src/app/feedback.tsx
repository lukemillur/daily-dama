import { Platform } from 'react-native';

import { FeedbackScreen } from '@/features/feedback/components/feedback-screen';
import { FeedbackUnavailableScreen } from '@/features/feedback/components/feedback-unavailable-screen';
import { HideSplashWhenMounted } from '@/shared/splash/splash-ready';

// Native has no Supabase client, so the form cannot succeed there. Decided at
// render time and in the route so FeedbackScreen stays platform-agnostic.
// This route is directly deep-linkable outside the `/app` hydration gate, so it
// releases the native splash itself.
export default function FeedbackRoute() {
  return (
    <>
      <HideSplashWhenMounted />
      {Platform.OS === 'web' ? <FeedbackScreen /> : <FeedbackUnavailableScreen />}
    </>
  );
}

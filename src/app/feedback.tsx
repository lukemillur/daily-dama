import { FeedbackScreen } from '@/features/feedback/components/feedback-screen';
import { HideSplashWhenMounted } from '@/shared/splash/splash-ready';

// This route is directly deep-linkable outside the `/app` hydration gate, so it
// releases the native splash itself.
export default function FeedbackRoute() {
  return (
    <>
      <HideSplashWhenMounted />
      <FeedbackScreen />
    </>
  );
}

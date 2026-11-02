import { Platform } from 'react-native';

import { FeedbackScreen } from '@/features/feedback/components/feedback-screen';
import { FeedbackUnavailableScreen } from '@/features/feedback/components/feedback-unavailable-screen';

// Native has no Supabase client, so the form cannot succeed there. Decided at
// render time and in the route so FeedbackScreen stays platform-agnostic.
export default function FeedbackRoute() {
  return Platform.OS === 'web' ? <FeedbackScreen /> : <FeedbackUnavailableScreen />;
}

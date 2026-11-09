import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { logAuthWarning } from '@/features/auth/observability/auth-observability';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';

/**
 * Native has no `visibilitychange`, so supabase-js cannot tell when the app is backgrounded:
 * GoTrue's refresh ticker must be started and stopped from AppState. Web is unaffected because
 * supabase-js manages visibility itself.
 *
 * Only `background` stops refresh. `inactive` fires transiently (control centre, permission
 * prompts) and must not stop it. `attempt` re-keys the effect when auth is re-initialised, since
 * that replaces the client instance.
 */
export function useAuthAutoRefresh(attempt: number): void {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const client = getSupabaseClient();
    if (!client) return undefined;

    const run = (action: () => Promise<void>) => {
      try {
        action().catch((error: unknown) => {
          logAuthWarning('Unable to change Supabase auto-refresh state.', error);
        });
      } catch (error) {
        logAuthWarning('Unable to change Supabase auto-refresh state.', error);
      }
    };

    if (AppState.currentState === 'active') {
      run(() => client.auth.startAutoRefresh());
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        run(() => client.auth.startAutoRefresh());
      } else if (nextState === 'background') {
        run(() => client.auth.stopAutoRefresh());
      }
    });

    return () => {
      subscription.remove();
      run(() => client.auth.stopAutoRefresh());
    };
  }, [attempt]);
}

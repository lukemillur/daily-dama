import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

import { logAuthWarning } from '@/features/auth/observability/auth-observability';
import { resolveSentryDsn } from '@/shared/observability/sentry-dsn';

let initialized = false;

/**
 * Initializes Sentry's automatic uncaught-exception and unhandled-promise-rejection capture
 * for the web build only (no native Sentry config in this app -- see AGENTS.md's active
 * platform scope). Must only ever be invoked from an effect (never at module scope or in a
 * render body) so Expo Router's Node static-render pass never runs it. Idempotent so a
 * repeated call (e.g. React Strict Mode double-effects) never re-initializes the SDK.
 */
export function initSentry(): void {
  if (initialized) {
    return;
  }

  if (Platform.OS !== 'web') {
    return;
  }

  const config = resolveSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);

  if (config.status !== 'ready') {
    if (config.status === 'malformed') {
      logAuthWarning('Sentry configuration is malformed.', config.reason);
    }
    return;
  }

  Sentry.init({ dsn: config.dsn, sendDefaultPii: false });
  initialized = true;
}

/** Test-only: clears the idempotency flag so each test scenario is isolated. */
export function resetSentryClientForTests(): void {
  initialized = false;
}

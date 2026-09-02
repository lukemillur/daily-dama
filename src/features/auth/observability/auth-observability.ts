/**
 * The one observability boundary every Auth route/action must import instead of calling
 * console.* or track() directly. This keeps raw Supabase errors, callback URLs, and entered
 * credentials from ever reaching application-owned logs or Vercel Analytics.
 */
import { track } from '@vercel/analytics';
import { Platform } from 'react-native';

import type { AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { redactUrl, redactValue } from '@/features/auth/model/redact';

/**
 * Logs an Auth-related warning to the console with any detail payload redacted first. Console
 * logging is more forgiving/useful for debugging than Analytics, so this still accepts arbitrary
 * detail -- but it is always passed through redactValue before printing.
 */
export function logAuthWarning(message: string, detail?: unknown): void {
  console.warn(message, detail === undefined ? undefined : redactValue(detail));
}

/**
 * Tracks an Auth-related Analytics event. The second parameter is typed to only accept the
 * closed AuthErrorCategory enum (never unknown/Record<string, unknown>) so it is structurally
 * impossible to pass a raw error, email, or URL into Analytics through this function -- the type
 * system enforces the never-place-tokens/emails-in-analytics-events requirement, rather than
 * relying solely on redaction-regex correctness for the analytics path.
 */
export function trackAuthEvent(name: string, category?: AuthErrorCategory): void {
  if (Platform.OS !== 'web') return;
  track(name, category === undefined ? undefined : { category });
}

/**
 * Adapter for the root Analytics component's beforeSend prop -- sanitizes the event URL (query
 * and fragment) so callback params such as code, access_token, refresh_token, or error_description
 * never reach Vercel Analytics unredacted.
 */
export function sanitizeAnalyticsEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: redactUrl(event.url) };
}

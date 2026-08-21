export type SupabaseConfig =
  { readonly status: 'ready'; readonly url: string; readonly publishableKey: string }
  | { readonly status: 'missing' }
  | { readonly status: 'malformed'; readonly reason: string };

/**
 * Validates the Supabase env pair without reading process.env itself, so
 * this stays trivially unit-testable.
 */
export function resolveSupabaseConfig(
  url: string | undefined,
  publishableKey: string | undefined,
): SupabaseConfig {
  const trimmedUrl = url?.trim();
  const trimmedKey = publishableKey?.trim();

  if (!trimmedUrl || !trimmedKey) {
    return { status: 'missing' };
  }

  try {
    new URL(trimmedUrl);
  } catch {
    return { status: 'malformed', reason: 'EXPO_PUBLIC_SUPABASE_URL is not a valid URL.' };
  }

  return { status: 'ready', url: trimmedUrl, publishableKey: trimmedKey };
}

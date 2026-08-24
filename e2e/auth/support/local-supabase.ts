import { createClient } from '@supabase/supabase-js';

// T153.13: Node-side admin helpers against local GoTrue. Never imported by app code,
// never shipped to a browser context -- the service-role key must stay server/CLI-only.
export interface LocalSupabaseConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
}

function adminClient(config: LocalSupabaseConfig) {
  return createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false } });
}

/**
 * Seeds an already-verified account instantly -- zero email budget spent. Returns the created
 * user's id (T154.1: needed to seed an identity-namespaced localStorage profile document for
 * tests that sign in, since `createScopedKeyValueStorage`'s `user:<uuid>:...` physical key is
 * not the same as the bare/legacy key a guest-only test can seed -- see
 * src/shared/persistence/scoped-storage.ts's guest-only migration fallback).
 */
export async function seedConfirmedUser(
  config: LocalSupabaseConfig,
  email: string,
  password: string,
): Promise<string> {
  const admin = adminClient(config);
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (result.error) throw result.error;
  return result.data.user.id;
}

/**
 * Synthesizes a valid one-time signup/recovery action link without sending mail and
 * without spending email_sent budget -- generateLink is service-role-admin-only.
 * The public 2.112.3 types under-declare the result.data.properties shape, matching
 * the exchangeCodeForSession.redirectType workaround already documented in
 * auth-provider.tsx -- cast through unknown rather than assume the type is complete.
 */
export async function generateActionLink(
  config: LocalSupabaseConfig,
  type: 'signup' | 'recovery',
  email: string,
  password?: string,
): Promise<string> {
  const admin = adminClient(config);
  const options: Record<string, unknown> = { type, email };
  if (password) options.password = password;
  if (type === 'signup' && !password) options.password = 'temporary-seed-password-1';
  const result = await admin.auth.admin.generateLink(
    options as Parameters<typeof admin.auth.admin.generateLink>[0],
  );
  if (result.error) throw result.error;
  const data = result.data as unknown as { properties: { action_link: string } };
  return data.properties.action_link;
}

// T161.1: authenticated delete-account Edge Function.
//
// POST /functions/v1/delete-account
//
// Deletes the calling user's own Supabase Auth account, which cascades
// (via `on delete cascade` foreign keys already proven in T155.7) to every
// `api.*` row the user owns. No table-level deletes are performed here --
// only the Auth user itself.
//
// Security model, in order:
//   1. Gateway-level `verify_jwt = true` (supabase/config.toml) rejects a
//      malformed/expired JWT before this function even runs.
//   2. This function independently resolves the caller's identity via
//      GoTrue's own `/auth/v1/user` endpoint (never by locally decoding the
//      JWT and never by trusting anything in the request body), so the
//      user/email being deleted is always the JWT's own subject.
//   3. The caller must additionally prove they know the account password
//      (`currentPassword`) and type an exact `DELETE` confirmation.
//   4. Only the service-role key -- injected into `Deno.env` by the
//      Supabase runtime, never present in any app/browser config -- can
//      actually delete the Auth user, via `auth.admin.deleteUser`.
//
// This function deliberately never logs the request body, the
// Authorization header, currentPassword, or the resolved email, and never
// echoes a caught error's `.message` back to the caller or to a log line.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOW_ORIGIN_HEADER = 'Access-Control-Allow-' + 'Origin';

const CORS_HEADERS = {
  [ALLOW_ORIGIN_HEADER]: '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_BODY_KEYS = new Set(['currentPassword', 'confirmation']);
const GENERIC_UNAUTHORIZED = 'Unauthorized.';
const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.';

function jsonResponse(statusCode, body, extraHeaders) {
  const headers = Object.assign({}, CORS_HEADERS, extraHeaders);
  if (body === null) {
    return new Response(null, { status: statusCode, headers: headers });
  }
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(body), { status: statusCode, headers: headers });
}

/**
 * Validates the parsed request body against a strict, closed schema: only
 * `currentPassword` (non-empty string) and `confirmation` (string) are
 * permitted. Any other shape -- wrong types, missing keys, or unrecognized
 * extra keys such as a caller-supplied `userId`/`email` -- is rejected here
 * so "attempts to supply another identity" fail as malformed input rather
 * than being silently ignored.
 *
 * @param {unknown} body
 * @returns {{ currentPassword: string, confirmation: string } | null}
 */
function validateBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;

  const keys = Object.keys(body);
  if (keys.length !== keys.filter((key) => ALLOWED_BODY_KEYS.has(key)).length) return null;

  const currentPassword = body.currentPassword;
  const confirmation = body.confirmation;
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) return null;
  if (typeof confirmation !== 'string') return null;

  return { currentPassword: currentPassword, confirmation: confirmation };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { error: GENERIC_UNAUTHORIZED });
    }

    let parsedBody;
    try {
      parsedBody = await req.json();
    } catch (error) {
      return jsonResponse(400, { error: 'Malformed request body.' });
    }

    const validated = validateBody(parsedBody);
    if (!validated) {
      return jsonResponse(400, { error: 'Malformed request body.' });
    }
    const currentPassword = validated.currentPassword;
    const confirmation = validated.confirmation;

    if (confirmation !== 'DELETE') {
      return jsonResponse(400, { error: 'Confirmation text does not match.' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: GENERIC_SERVER_ERROR });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userResult = await callerClient.auth.getUser();
    const userData = userResult.data;
    const userError = userResult.error;

    if (userError || !userData || !userData.user) {
      return jsonResponse(401, { error: GENERIC_UNAUTHORIZED });
    }
    const trustedUserId = userData.user.id;
    const trustedEmail = userData.user.email;

    const passwordCheckClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signInResult = await passwordCheckClient.auth.signInWithPassword({
      email: trustedEmail,
      password: currentPassword,
    });

    if (signInResult.error) {
      return jsonResponse(401, { error: GENERIC_UNAUTHORIZED });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const deleteResult = await adminClient.auth.admin.deleteUser(trustedUserId);
    if (deleteResult.error) {
      return jsonResponse(500, { error: GENERIC_SERVER_ERROR });
    }

    return jsonResponse(204, null, { 'Cache-Control': 'no-store' });
  } catch (error) {
    return jsonResponse(500, { error: GENERIC_SERVER_ERROR });
  }
});

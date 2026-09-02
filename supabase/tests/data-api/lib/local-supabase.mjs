// Shared helper for T155.6's Data API (HTTP) test suite. Talks to a real,
// already-running local Supabase stack (`npx --yes supabase@2.116.0 start`)
// over PostgREST/GoTrue's HTTP surface — no direct DB connection, no mocks.
// This module has no dependency on node:test so it can be reused by every
// test file under supabase/tests/data-api/.

import { execFileSync } from 'node:child_process';

let cachedConfig = null;

/**
 * Reads local Supabase connection info from `supabase status -o json`.
 * Throws loudly (rather than falling back to hardcoded demo keys) if the
 * local stack is not running, so this suite can never silently run against
 * the wrong target.
 */
export function getLocalConfig() {
  if (cachedConfig) return cachedConfig;

  let raw;
  try {
    raw = execFileSync('npx', ['--yes', 'supabase@2.116.0', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(
      'Local Supabase stack is not running. Run `npx --yes supabase@2.116.0 start` ' +
        '(and `db reset`) before running the Data API test suite.\n' +
        `Underlying error: ${error.message}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse \`supabase status -o json\` output as JSON: ${error.message}`);
  }

  if (!parsed.API_URL || !parsed.ANON_KEY || !parsed.SERVICE_ROLE_KEY) {
    throw new Error(
      'Local Supabase status output is missing API_URL/ANON_KEY/SERVICE_ROLE_KEY. ' +
        'Is the local stack fully started?'
    );
  }

  cachedConfig = {
    apiUrl: parsed.API_URL,
    anonKey: parsed.ANON_KEY,
    serviceRoleKey: parsed.SERVICE_ROLE_KEY,
    // Supabase CLI exposes the local signing secret in status JSON. Keeping
    // it in the in-memory config lets acceptance tests construct a genuinely
    // signed expired JWT without committing or printing the secret.
    jwtSecret: parsed.JWT_SECRET ?? parsed.JWT_SECRET_KEY ?? parsed.jwt_secret,
  };
  return cachedConfig;
}

/** Creates a confirmed (email_confirm: true) user via the GoTrue admin API. */
export async function createConfirmedUser(config, email, password) {
  const response = await fetch(`${config.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`createConfirmedUser failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.id;
}

/** Signs in with password grant via the anon key; returns a fresh access token. */
export async function signIn(config, email, password) {
  const response = await fetch(`${config.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`signIn failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return { accessToken: body.access_token, userId: body.user.id };
}

/**
 * Deletes an auth user via the admin API. Cascades (via `on delete cascade`
 * foreign keys, already proven by the pgTAP suites) to every api.* row
 * owned by that user, so this is the suite's whole cleanup path.
 */
export async function deleteUser(config, userId) {
  const response = await fetch(`${config.apiUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => '');
    throw new Error(`deleteUser failed (${response.status}): ${body}`);
  }
}

/**
 * Returns a small REST client scoped to one signed-in user's access token.
 * Every method resolves to `{ status, body }` rather than throwing on a
 * non-2xx response, because every test case needs to assert on the exact
 * status/code, not have the helper swallow it as a thrown exception.
 */
export function restClient(config, accessToken) {
  const baseHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Profile': 'api',
    'Accept-Profile': 'api',
    'Content-Type': 'application/json',
  };

  async function request(method, path, { body, extraHeaders } = {}) {
    const response = await fetch(`${config.apiUrl}/rest/v1${path}`, {
      method,
      headers: { ...baseHeaders, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsedBody = null;
    if (text.length > 0) {
      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = text;
      }
    }
    return { status: response.status, body: parsedBody };
  }

  return {
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
  };
}

/**
 * Returns a REST client using only the anon key -- both `apikey` and
 * `Authorization` are the anon key, with no signed-in session -- to prove
 * anonymous denial (T155.7). `anon` is never granted `USAGE ON SCHEMA api`
 * (T155.1), so every request through this client is expected to fail at the
 * schema layer before any per-table RLS policy is even evaluated.
 */
export function anonClient(config) {
  return restClient(config, config.anonKey);
}

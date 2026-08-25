// Small helper for T161.1's Edge Function tests. Posts to the local
// delete-account function with a given Authorization header and JSON body,
// returning `{ status, headers, body }` -- the same shape `restClient` in
// ../data-api/lib/local-supabase.mjs uses, so assertions read the same way.

/**
 * @param {{ apiUrl: string, anonKey: string }} config
 * @param {string | undefined} authHeader full `Authorization` header value, or undefined to omit it
 * @param {string | Buffer} rawBody the exact request body to send (string, so malformed-JSON cases are testable)
 * @returns {Promise<{ status: number, headers: Headers, body: unknown }>}
 */
export async function callDeleteAccount(config, authHeader, rawBody) {
  const headers = { apikey: config.anonKey };
  if (authHeader !== undefined) headers.Authorization = authHeader;
  if (rawBody !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(config.apiUrl + '/functions/v1/delete-account', {
    method: 'POST',
    headers: headers,
    body: rawBody,
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
  return { status: response.status, headers: response.headers, body: parsedBody };
}

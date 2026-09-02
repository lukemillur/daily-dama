// Policy boundary for delete-account. This module has no Deno or Supabase
// imports so its security behavior can be tested without a running stack.

export const RATE_LIMIT_CONFIG = Object.freeze({ maxAttempts: 30, windowMs: 15 * 60 * 1000 });
const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});
const ALLOWED_BODY_KEYS = new Set(['currentPassword', 'confirmation']);
const GENERIC_UNAUTHORIZED = 'Unauthorized.';
const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.';
const GENERIC_RATE_LIMITED = 'Too many attempts. Please try again later.';
const LOG_EVENTS = new Set(['request_rejected', 'password_rejected', 'rate_limited_ip', 'delete_completed', 'delete_failed']);

export function createRateLimitStore(config = RATE_LIMIT_CONFIG, clock = () => Date.now()) {
  const buckets = new Map();
  const keyFor = (dimension, value) => dimension + ':' + value;
  return {
    consume(dimensions) {
      const now = clock();
      for (const [key, bucket] of buckets) {
        if (now - bucket.startedAt >= config.windowMs) buckets.delete(key);
      }
      const keys = Object.entries(dimensions).map(([dimension, value]) => keyFor(dimension, value));
      if (keys.some((key) => (buckets.get(key)?.count ?? 0) >= config.maxAttempts)) return false;
      for (const key of keys) {
        const bucket = buckets.get(key);
        if (bucket) bucket.count += 1;
        else buckets.set(key, { count: 1, startedAt: now });
      }
      return true;
    },
    size: () => buckets.size,
  };
}

// These values must be supplied/overwritten by Supabase's trusted edge proxy.
// They are an abuse-limit dimension only, never an authorization identity.
export function resolveRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded?.trim()) return forwarded.split(',')[0].trim();
  const cloudflare = request.headers.get('cf-connecting-ip');
  return cloudflare?.trim() || null;
}

function response(status, body) {
  const headers = new Headers(CORS_HEADERS);
  headers.set('Cache-Control', 'no-store');
  if (body === null) return new Response(null, { status, headers });
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function logSafe(logger, event, outcome, status) {
  if (LOG_EVENTS.has(event)) logger({ event, outcome, status });
}

function validateBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) return null;
  if (typeof body.currentPassword !== 'string' || body.currentPassword.length === 0) return null;
  if (typeof body.confirmation !== 'string') return null;
  return { currentPassword: body.currentPassword, confirmation: body.confirmation };
}

function isNotFound(error) {
  return error?.status === 404 || error?.code === 'user_not_found' || error?.code === 'user_not_exists';
}

export function createDeleteAccountHandler({
  createClient,
  getConfig,
  rateLimitStore = createRateLimitStore(),
  resolveIp = resolveRequestIp,
  logger = (entry) => console.info('[delete-account]', entry),
}) {
  return async function handleDeleteAccount(request) {
    if (request.method === 'OPTIONS') return response(204, null);
    if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' });
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!authHeader || !/^Bearer \S+$/.test(authHeader)) {
      logSafe(logger, 'request_rejected', 'unauthorized', 401);
      return response(401, { error: GENERIC_UNAUTHORIZED });
    }
    let parsedBody;
    try {
      parsedBody = await request.json();
    } catch {
      logSafe(logger, 'request_rejected', 'malformed_body', 400);
      return response(400, { error: 'Malformed request body.' });
    }
    const body = validateBody(parsedBody);
    if (!body) {
      logSafe(logger, 'request_rejected', 'malformed_body', 400);
      return response(400, { error: 'Malformed request body.' });
    }
    const config = getConfig();
    if (!config?.supabaseUrl || !config.anonKey || !config.serviceRoleKey) {
      logSafe(logger, 'delete_failed', 'configuration', 500);
      return response(500, { error: GENERIC_SERVER_ERROR });
    }
    try {
      const callerClient = createClient(config.supabaseUrl, config.anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const userResult = await callerClient.auth.getUser();
      if (!userResult.data?.user && isNotFound(userResult.error)) {
        logSafe(logger, 'delete_completed', 'already_absent', 204);
        return response(204, null);
      }
      if (userResult.error || !userResult.data?.user) {
        logSafe(logger, 'request_rejected', 'unauthorized', 401);
        return response(401, { error: GENERIC_UNAUTHORIZED });
      }
      const trustedUserId = userResult.data.user.id;
      const requestIp = resolveIp(request);
      if (!requestIp) {
        logSafe(logger, 'delete_failed', 'rate_limit_unavailable', 500);
        return response(500, { error: GENERIC_SERVER_ERROR });
      }
      if (!rateLimitStore.consume({ user: trustedUserId, ip: requestIp })) {
        logSafe(logger, 'rate_limited_ip', 'rate_limited', 429);
        return response(429, { error: GENERIC_RATE_LIMITED });
      }
      if (body.confirmation !== 'DELETE') {
        logSafe(logger, 'request_rejected', 'confirmation', 400);
        return response(400, { error: 'Confirmation text does not match.' });
      }
      const passwordCheckClient = createClient(config.supabaseUrl, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: passwordError } = await passwordCheckClient.auth.signInWithPassword({
        email: userResult.data.user.email,
        password: body.currentPassword,
      });
      if (passwordError) {
        logSafe(logger, 'password_rejected', 'unauthorized', 401);
        return response(401, { error: GENERIC_UNAUTHORIZED });
      }
      const adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const deleteResult = await adminClient.auth.admin.deleteUser(trustedUserId);
      if (deleteResult.error && !isNotFound(deleteResult.error)) {
        logSafe(logger, 'delete_failed', 'admin_error', 500);
        return response(500, { error: GENERIC_SERVER_ERROR });
      }
      logSafe(logger, 'delete_completed', deleteResult.error ? 'already_absent' : 'deleted', 204);
      return response(204, null);
    } catch {
      logSafe(logger, 'delete_failed', 'unexpected', 500);
      return response(500, { error: GENERIC_SERVER_ERROR });
    }
  };
}

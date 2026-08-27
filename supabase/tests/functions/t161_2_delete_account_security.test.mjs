import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDeleteAccountHandler, createRateLimitStore, RATE_LIMIT_CONFIG } from '../../functions/delete-account/handler.js';

const CONFIG = { supabaseUrl: 'https://example.test', anonKey: 'anon', serviceRoleKey: 'service' };
const PASSWORD = 'sentinel-password';
const TOKEN = 'sentinel-jwt';
const EMAIL = 'sentinel@example.test';
const BODY = JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' });

function request(body = BODY, headers = { Authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '198.51.100.1' }, method = 'POST') {
  return new Request('https://example.test/functions/v1/delete-account', { method, headers, body: method === 'POST' ? body : undefined });
}

function fakeEnvironment({ user = { id: 'user-a', email: EMAIL }, getUserError = null, passwordError = null, deleteError = null, session = null } = {}) {
  const calls = { clients: [], signIns: [], deletes: [] };
  const createClient = (url, key, options) => {
    calls.clients.push({ url, key, options });
    if (key === 'anon' && options.global) return { auth: { getUser: async () => ({ data: user ? { user } : null, error: getUserError }) } };
    if (key === 'anon') return { auth: { signInWithPassword: async (args) => { calls.signIns.push({ args, session }); return { data: { session }, error: passwordError }; } } };
    return { auth: { admin: { deleteUser: async (id) => { calls.deletes.push(id); return { error: deleteError }; } } } };
  };
  return { calls, createClient };
}

function makeHandler(environment, options = {}) {
  return createDeleteAccountHandler({
    createClient: environment.createClient,
    getConfig: () => CONFIG,
    rateLimitStore: options.rateLimitStore,
    resolveIp: options.resolveIp ?? ((req) => req.headers.get('x-forwarded-for')),
    logger: options.logger,
  });
}

async function bodyOf(response) {
  return response.text();
}

describe('T161.2 delete-account handler security contract', () => {
  test('every handler response is no-store, including preflight, rejection, and limiter paths', async () => {
    const env = fakeEnvironment({ passwordError: new Error('wrong') });
    const limitedStore = createRateLimitStore({ maxAttempts: 0, windowMs: 1000 }, () => 0);
    const handler = makeHandler(env, { rateLimitStore: limitedStore });
    const responses = [
      await handler(request(undefined, {}, 'OPTIONS')),
      await handler(request(BODY, {}, 'POST')),
      await handler(request('not-json')),
      await handler(request(BODY)),
    ];
    for (const response of responses) assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(responses[0].status, 204);
    assert.equal(responses[1].status, 401);
    assert.equal(responses[3].status, 429);
  });

  test('limits attempts independently by trusted user and IP, never by body identity', async () => {
    let now = 0;
    const store = createRateLimitStore({ maxAttempts: 2, windowMs: 100 }, () => now);
    const env = fakeEnvironment({ passwordError: new Error('wrong') });
    const handler = makeHandler(env, { rateLimitStore: store });
    const first = await handler(request());
    const second = await handler(request(JSON.stringify({ currentPassword: PASSWORD, confirmation: 'delete' })));
    assert.equal(first.status, 401);
    assert.equal(second.status, 400);
    assert.equal((await handler(request())).status, 429);
    const otherUserEnv = fakeEnvironment({ user: { id: 'user-b', email: 'other@example.test' }, passwordError: new Error('wrong') });
    const otherHandler = makeHandler(otherUserEnv, { rateLimitStore: store });
    const otherRequest = () => request(BODY, { Authorization: 'Bearer other-token', 'x-forwarded-for': '203.0.113.2' });
    assert.equal((await otherHandler(otherRequest())).status, 401);
    assert.equal((await otherHandler(otherRequest())).status, 401);
    assert.equal((await otherHandler(otherRequest())).status, 429);
    now = 101;
    assert.equal((await handler(request())).status, 401);
    assert.equal(store.size(), 2);
  });

  test('one IP bucket covers multiple users and one user bucket covers multiple IPs', async () => {
    const store = createRateLimitStore({ maxAttempts: 2, windowMs: 1000 }, () => 0);
    const a = makeHandler(fakeEnvironment({ passwordError: new Error('wrong') }), { rateLimitStore: store });
    const b = makeHandler(fakeEnvironment({ user: { id: 'user-b', email: 'b@test' }, passwordError: new Error('wrong') }), { rateLimitStore: store });
    assert.equal((await a(request())).status, 401);
    assert.equal((await b(request())).status, 401);
    assert.equal((await a(request())).status, 429);

    const perUser = createRateLimitStore({ maxAttempts: 2, windowMs: 1000 }, () => 0);
    const cEnv = fakeEnvironment({ passwordError: new Error('wrong') });
    const c = makeHandler(cEnv, { rateLimitStore: perUser, resolveIp: (req) => req.headers.get('x-forwarded-for') });
    assert.equal((await c(request(BODY, { Authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '1.1.1.1' }))).status, 401);
    assert.equal((await c(request(BODY, { Authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '2.2.2.2' }))).status, 401);
    assert.equal((await c(request(BODY, { Authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '3.3.3.3' }))).status, 429);
  });

  test('password verification never retains or exposes its session and delete uses trusted ID only', async () => {
    const env = fakeEnvironment({ user: { id: 'trusted-id', email: EMAIL }, session: { access_token: 'secret-session' } });
    const logs = [];
    const handler = makeHandler(env, { logger: (entry) => logs.push(entry) });
    const response = await handler(request());
    assert.equal(response.status, 204);
    assert.equal(env.calls.signIns.length, 1);
    const success = response;
    assert.equal(success.status, 204);
    assert.deepEqual(env.calls.deletes, ['trusted-id']);
    assert.equal((await bodyOf(success)), '');
    assert.equal(JSON.stringify(logs).includes('secret-session'), false);
    assert.equal(JSON.stringify(logs).includes(PASSWORD), false);
    assert.equal(env.calls.clients[1].options.auth.persistSession, false);
    assert.equal(env.calls.clients[1].options.auth.autoRefreshToken, false);
  });

  test('non-persisting auth options are applied and already-absent retries are completed without recreation', async () => {
    const env = fakeEnvironment({ user: null, getUserError: { status: 404, code: 'user_not_found' } });
    const handler = makeHandler(env);
    const response = await handler(request());
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(env.calls.signIns.length, 0);
    assert.equal(env.calls.deletes.length, 0);
    assert.equal(env.calls.clients[0].options.auth.persistSession, false);
    assert.equal(env.calls.clients[0].options.auth.autoRefreshToken, false);
  });

  test('admin not-found races converge to completed deletion, other errors stay generic', async () => {
    const absent = makeHandler(fakeEnvironment({ deleteError: { status: 404, code: 'user_not_found', message: EMAIL + PASSWORD } }));
    const done = await absent(request());
    assert.equal(done.status, 204);
    assert.equal(await bodyOf(done), '');
    const failed = makeHandler(fakeEnvironment({ deleteError: { status: 500, message: EMAIL + PASSWORD + TOKEN } }));
    const error = await failed(request());
    assert.equal(error.status, 500);
    assert.equal((await error.text()).includes(EMAIL), false);
  });

  test('structured logs are allow-listed and contain no credential, identity, body, or raw error values', async () => {
    const logs = [];
    const env = fakeEnvironment({ passwordError: { message: EMAIL + PASSWORD + TOKEN } });
    const handler = makeHandler(env, { logger: (entry) => logs.push(entry) });
    await handler(request());
    await handler(request('not-json'));
    await handler(request(BODY, {}));
    for (const entry of logs) {
      assert.deepEqual(Object.keys(entry).sort(), ['event', 'outcome', 'status']);
      const serialized = JSON.stringify(entry);
      for (const secret of [PASSWORD, TOKEN, EMAIL, 'raw-error', BODY]) assert.equal(serialized.includes(secret), false);
    }
    assert.equal(RATE_LIMIT_CONFIG.maxAttempts > 0, true);
  });
});

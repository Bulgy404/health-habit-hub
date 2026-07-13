import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createUsersRouter } from '../../routes/usersRouter.js';

function makeDb() {
  const participants = [
    { userId: 'user-1', username: '11111111-2222-3333-4444-555555555555' },
  ];
  return {
    participants,
    collection(name) {
      assert.strictEqual(name, 'participants');
      return {
        async updateOne(filter, update) {
          const row = participants.find((p) => p.userId === filter.userId);
          if (row) Object.assign(row, update.$set);
        },
      };
    },
  };
}

function makeFakeKeycloak() {
  const calls = [];
  return {
    calls,
    async getAdminToken() {
      calls.push('getAdminToken');
      return 'admin-tok';
    },
    async resetPassword(userId, newPassword) {
      calls.push({ fn: 'resetPassword', userId, newPassword });
    },
  };
}

let app,
  server,
  baseUrl,
  db,
  kc,
  fetchCalls,
  tokenGrantFails,
  userLookupFails,
  realFetch;

const KC_BASE = 'http://keycloak:8080';
const KC_REALM = 'hhh';

before(async () => {
  process.env.KEYCLOAK_URL = KC_BASE;
  process.env.KEYCLOAK_REALM = KC_REALM;
  process.env.KEYCLOAK_CLIENT_ID = 'hhh-flutter';

  realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    // Only intercept calls to the (fake) Keycloak base — let the test's own
    // requests to its local HTTP server pass through untouched.
    if (!String(url).startsWith(KC_BASE)) return realFetch(url, opts);

    fetchCalls.push({ url: String(url), opts });
    if (String(url).includes('/protocol/openid-connect/token')) {
      if (tokenGrantFails) return { ok: false, status: 400 };
      return {
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 300,
        }),
      };
    }
    // GET .../users/:id lookup
    if (userLookupFails) return { ok: false, status: 404 };
    return {
      ok: true,
      json: async () => ({
        id: 'user-1',
        username: '11111111-2222-3333-4444-555555555555',
      }),
    };
  };

  db = makeDb();
  kc = makeFakeKeycloak();
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { sub: 'user-1', preferred_username: 'p-user-1' };
    next();
  });
  app.use('/api/v1/users', createUsersRouter({ db, keycloak: kc }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  global.fetch = realFetch;
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit) waits forever
  // for connections that fetch()'s undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  fetchCalls = [];
  tokenGrantFails = false;
  userLookupFails = false;
  kc.calls.length = 0;
});

test('rotates the password and returns the same shape as /onboard', async () => {
  const res = await fetch(`${baseUrl}/api/v1/users/me/rotate-credentials`, {
    method: 'POST',
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.username, '11111111-2222-3333-4444-555555555555');
  assert.strictEqual(body.access_token, 'new-access');
  assert.strictEqual(body.refresh_token, 'new-refresh');
  assert.strictEqual(body.expires_in, 300);
  assert.ok(typeof body.password === 'string' && body.password.length === 32);
});

test('calls resetPassword with a freshly generated 16-byte hex password', async () => {
  await fetch(`${baseUrl}/api/v1/users/me/rotate-credentials`, {
    method: 'POST',
  });
  const call = kc.calls.find((c) => c.fn === 'resetPassword');
  assert.ok(call);
  assert.strictEqual(call.userId, 'user-1');
  assert.match(call.newPassword, /^[0-9a-f]{32}$/);
});

test('performs a password-grant login with the new credentials', async () => {
  await fetch(`${baseUrl}/api/v1/users/me/rotate-credentials`, {
    method: 'POST',
  });
  const tokenCall = fetchCalls.find((c) =>
    c.url.includes('/protocol/openid-connect/token')
  );
  assert.ok(tokenCall);
  const params = new URLSearchParams(tokenCall.opts.body);
  assert.strictEqual(params.get('grant_type'), 'password');
  assert.strictEqual(
    params.get('username'),
    '11111111-2222-3333-4444-555555555555'
  );
});

test('returns 502 when the user lookup fails', async () => {
  userLookupFails = true;
  const res = await fetch(`${baseUrl}/api/v1/users/me/rotate-credentials`, {
    method: 'POST',
  });
  assert.strictEqual(res.status, 502);
});

test('returns 502 when the post-rotation token grant fails', async () => {
  tokenGrantFails = true;
  const res = await fetch(`${baseUrl}/api/v1/users/me/rotate-credentials`, {
    method: 'POST',
  });
  assert.strictEqual(res.status, 502);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createOnboardRouter } from '../../routes/onboardRouter.js';

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockFetchCalls;
let originalFetch;

before(async () => {
  // Provide mocked env vars so the router resolves correctly
  process.env.KEYCLOAK_URL = 'http://keycloak-mock:8080';
  process.env.KEYCLOAK_REALM = 'hhh';
  process.env.KEYCLOAK_CLIENT_ID = 'hhh-flutter';

  const testApp = express();
  testApp.use(express.json());

  // Save original fetch so test HTTP calls still reach the local server
  originalFetch = global.fetch;

  // Mock global fetch — only intercept Keycloak-destined calls
  mockFetchCalls = [];
  global.fetch = async (url, opts) => {
    const urlStr = String(url);

    // Pass through requests to the local test server
    if (urlStr.startsWith('http://127.0.0.1')) {
      return originalFetch(url, opts);
    }

    mockFetchCalls.push({ url, opts });

    // Admin token (client_credentials)
    if (
      urlStr.includes('/protocol/openid-connect/token') &&
      opts?.body?.toString().includes('client_credentials')
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock-admin-token' }),
      };
    }

    // Admin user creation (POST) — real Keycloak never actually honours a
    // client-supplied `id` in this payload, it always assigns its own.
    if (
      urlStr.includes('/admin/realms/') &&
      urlStr.endsWith('/users') &&
      opts?.method === 'POST'
    ) {
      return { ok: true, status: 201, json: async () => ({}) };
    }

    // Post-creation lookup by username, used to discover Keycloak's real
    // assigned id — deliberately distinct from whatever `id` createUser()
    // asked for above, matching real Keycloak's actual behaviour.
    if (
      urlStr.includes('/admin/realms/') &&
      urlStr.includes('/users?username=')
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 'keycloak-real-assigned-id' }],
      };
    }

    if (urlStr.includes('/admin/realms/') && urlStr.includes('/roles/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'participant-role-id', name: 'participant' }),
      };
    }

    if (urlStr.includes('/role-mappings/realm')) {
      return { ok: true, status: 204, json: async () => ({}) };
    }

    // Direct-grant token exchange (password grant)
    if (urlStr.includes('/protocol/openid-connect/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
        }),
      };
    }

    return { ok: false, status: 500, json: async () => ({}) };
  };

  // Use a keycloak mock without getAdminToken so it falls back to fetch-based admin token
  const mockKeycloak = {};
  testApp.use(
    '/api/v1/onboard',
    createOnboardRouter({ keycloak: mockKeycloak })
  );

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  global.fetch = originalFetch;
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit) waits forever
  // for connections that fetch()'s undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST /api/v1/onboard returns 201 with tokens and credentials on success', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboard`, { method: 'POST' });
  assert.strictEqual(res.status, 201);

  const body = await res.json();
  assert.ok(body.access_token, 'should return access_token');
  assert.ok(body.refresh_token, 'should return refresh_token');
  assert.ok(typeof body.expires_in === 'number', 'should return expires_in');
  assert.ok(
    typeof body.username === 'string' && body.username.length > 0,
    'should return username'
  );
  assert.ok(
    typeof body.password === 'string' && body.password.length > 0,
    'should return password'
  );

  const tokenCall = mockFetchCalls.find(
    (c) =>
      String(c.url).includes('/protocol/openid-connect/token') &&
      c.opts?.body?.toString().includes('grant_type=password')
  );
  assert.ok(tokenCall, 'should mint tokens via a password-grant call');
  const params = new URLSearchParams(tokenCall.opts.body);
  assert.strictEqual(
    params.get('scope'),
    'openid profile email offline_access',
    'onboarding must request offline_access so refresh tokens survive normal usage gaps'
  );
});

test('POST /api/v1/onboard username is a UUID', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboard`, { method: 'POST' });
  const body = await res.json();
  assert.match(
    body.username,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'username should be a UUID'
  );
});

test('POST /api/v1/onboard password is 32 hex characters (16 bytes)', async () => {
  // Must be 16 bytes so the 24-word recovery phrase can fully encode it
  // (12 words = 16 bytes). A longer password would be truncated by the phrase
  // and account restore on a new device would fail.
  const res = await fetch(`${baseUrl}/api/v1/onboard`, { method: 'POST' });
  const body = await res.json();
  assert.match(
    body.password,
    /^[0-9a-f]{32}$/,
    'password should be 32 hex chars (16 bytes)'
  );
});

// Minimal fake db, just enough for onboardRouter's
// participants.updateOne({userId}, {$setOnInsert: {...}}, {upsert: true}).
function makeFakeDb() {
  const participants = [];
  return {
    docs: participants,
    collection(name) {
      if (name !== 'participants')
        throw new Error(`unexpected collection ${name}`);
      return {
        async updateOne(filter, update) {
          const existing = participants.find((d) => d.userId === filter.userId);
          if (!existing) participants.push({ ...update.$setOnInsert });
          return { acknowledged: true };
        },
      };
    },
  };
}

test("POST /api/v1/onboard persists the Mongo participant record keyed by Keycloak's real assigned id, not the locally-generated placeholder", async () => {
  // Keycloak's user-create API never actually honours a client-supplied `id`
  // (it always assigns its own) — this regression-tests that the id
  // ultimately stored on the participants doc is the one the mock's
  // username-lookup returns ('keycloak-real-assigned-id', see the shared
  // fetch mock above), not onboardRouter's own locally-generated `userId`.
  // A prior bug stored the wrong one, silently breaking every lookup keyed
  // by the authenticated participant's real `req.user.sub` (device/session
  // matching, credential rotation, account deletion, group-targeted survey
  // resolution).
  const fakeDb = makeFakeDb();
  const testApp2 = express();
  testApp2.use(express.json());
  testApp2.use(
    '/api/v1/onboard',
    createOnboardRouter({ keycloak: {}, db: fakeDb })
  );
  const server2 = createServer(testApp2);
  await new Promise((resolve) => server2.listen(0, '127.0.0.1', resolve));
  const baseUrl2 = `http://127.0.0.1:${server2.address().port}`;

  try {
    const res = await fetch(`${baseUrl2}/api/v1/onboard`, { method: 'POST' });
    assert.strictEqual(res.status, 201);

    assert.strictEqual(fakeDb.docs.length, 1, 'should persist one participant');
    assert.strictEqual(
      fakeDb.docs[0].userId,
      'keycloak-real-assigned-id',
      'stored userId must be the real Keycloak-assigned id'
    );
  } finally {
    server2.closeAllConnections();
    server2.close();
  }
});

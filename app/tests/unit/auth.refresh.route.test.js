import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createAuthRouter } from '../../routes/authRouter.js';

// ── Test server ───────────────────────────────────────────────────────────────

const VALID_REFRESH_TOKEN = 'mock-valid-ropc-refresh-token';

let server;
let baseUrl;
let originalFetch;

before(async () => {
  process.env.KEYCLOAK_URL = 'http://keycloak-mock:8080';
  process.env.KEYCLOAK_REALM = 'hhh';
  process.env.KEYCLOAK_ROPC_CLIENT_ID = 'hhh-ropc';
  process.env.KEYCLOAK_ROPC_CLIENT_SECRET = 'mock-ropc-secret';

  const testApp = express();
  testApp.use(express.json());

  originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.startsWith('http://127.0.0.1')) {
      return originalFetch(url, opts);
    }

    if (urlStr.includes('/protocol/openid-connect/revoke')) {
      const body = new URLSearchParams(opts.body);
      assert.strictEqual(
        body.get('client_id'),
        'hhh-ropc',
        'revocation must go through the confidential ROPC client — Keycloak ignores revocation from a different client than the issuer'
      );
      assert.strictEqual(body.get('client_secret'), 'mock-ropc-secret');
      assert.strictEqual(body.get('token_type_hint'), 'refresh_token');
      if (body.get('token') === VALID_REFRESH_TOKEN) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    }

    if (urlStr.includes('/protocol/openid-connect/token')) {
      const body = new URLSearchParams(opts.body);
      assert.strictEqual(
        body.get('grant_type'),
        'refresh_token',
        'refresh endpoint must use the refresh_token grant'
      );
      assert.strictEqual(
        body.get('client_id'),
        'hhh-ropc',
        'refresh must go through the confidential ROPC client — Keycloak rejects refresh tokens presented by a different client than their issuer'
      );
      assert.strictEqual(
        body.get('client_secret'),
        'mock-ropc-secret',
        'refresh must authenticate the ROPC client with its secret'
      );

      if (body.get('refresh_token') === VALID_REFRESH_TOKEN) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'mock-new-access-token',
            refresh_token: 'mock-new-refresh-token',
            expires_in: 300,
          }),
        };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    }

    return { ok: false, status: 500, json: async () => ({}) };
  };

  testApp.use('/api/v1/auth', createAuthRouter());

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
});

function postRefresh(body) {
  return fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('valid refresh token returns a fresh token pair', async () => {
  const res = await postRefresh({ refresh_token: VALID_REFRESH_TOKEN });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.access_token, 'mock-new-access-token');
  assert.strictEqual(data.refresh_token, 'mock-new-refresh-token');
  assert.strictEqual(data.expires_in, 300);
});

test('rejected refresh token returns 401 without echoing Keycloak details', async () => {
  const res = await postRefresh({ refresh_token: 'expired-or-foreign-token' });
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.deepStrictEqual(data, { error: 'Invalid refresh token.' });
});

test('missing refresh_token returns 400', async () => {
  const res = await postRefresh({});
  assert.strictEqual(res.status, 400);
});

test('non-string refresh_token returns 400', async () => {
  const res = await postRefresh({ refresh_token: 42 });
  assert.strictEqual(res.status, 400);
});

function postRevoke(body) {
  return fetch(`${baseUrl}/api/v1/auth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('revoking a valid refresh token returns 200', async () => {
  const res = await postRevoke({ refresh_token: VALID_REFRESH_TOKEN });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });
});

test('revoking an invalid token still returns 200 (RFC 7009)', async () => {
  const res = await postRevoke({ refresh_token: 'already-dead-token' });
  assert.strictEqual(res.status, 200);
});

test('revoke without refresh_token returns 400', async () => {
  const res = await postRevoke({});
  assert.strictEqual(res.status, 400);
});

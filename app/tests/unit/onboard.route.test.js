import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createOnboardRouter } from '../../routes/onboardRouter.js';

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockFetchCalls;

before(async () => {
  // Provide mocked env vars so the router resolves correctly
  process.env.KEYCLOAK_URL = 'http://keycloak-mock:8080';
  process.env.KEYCLOAK_REALM = 'hhh';
  process.env.KEYCLOAK_CLIENT_ID = 'hhh-flutter';

  const testApp = express();
  testApp.use(express.json());

  // Save original fetch so test HTTP calls still reach the local server
  const originalFetch = global.fetch;

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

    // Admin user creation
    if (urlStr.includes('/admin/realms/') && urlStr.includes('/users')) {
      return { ok: true, status: 201, json: async () => ({}) };
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

test('POST /api/v1/onboard password is 64 hex characters (32 bytes)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/onboard`, { method: 'POST' });
  const body = await res.json();
  assert.match(
    body.password,
    /^[0-9a-f]{64}$/,
    'password should be 64 hex chars'
  );
});

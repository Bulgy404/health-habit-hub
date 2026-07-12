import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createRestoreRouter } from '../../routes/restoreRouter.js';
import { recoveryPhraseFromCredentials } from '../../utils/recoveryPhrase.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const KNOWN_USERNAME = '11111111-2222-3333-4444-555555555555';
const KNOWN_PASSWORD = 'aabbccddeeff00112233445566778899';
const KNOWN_PHRASE = recoveryPhraseFromCredentials(
  KNOWN_USERNAME,
  KNOWN_PASSWORD
);

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  process.env.KEYCLOAK_URL = 'http://keycloak-mock:8080';
  process.env.KEYCLOAK_REALM = 'hhh';
  process.env.KEYCLOAK_ROPC_CLIENT_ID = 'hhh-ropc';
  process.env.KEYCLOAK_ROPC_CLIENT_SECRET = 'mock-ropc-secret';

  const testApp = express();
  testApp.use(express.json());

  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.startsWith('http://127.0.0.1')) {
      return originalFetch(url, opts);
    }

    if (urlStr.includes('/protocol/openid-connect/token')) {
      const body = new URLSearchParams(opts.body);
      assert.strictEqual(
        body.get('client_id'),
        'hhh-ropc',
        'restore must mint tokens via the confidential ROPC client, not hhh-flutter'
      );
      assert.strictEqual(
        body.get('client_secret'),
        'mock-ropc-secret',
        'restore must authenticate the ROPC client with its secret'
      );

      if (
        body.get('username') === KNOWN_USERNAME &&
        body.get('password') === KNOWN_PASSWORD
      ) {
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
      return { ok: false, status: 401, json: async () => ({}) };
    }

    return { ok: false, status: 500, json: async () => ({}) };
  };

  testApp.use('/api/v1/restore', createRestoreRouter());

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST /api/v1/restore returns 200 with tokens for a valid recovery phrase', async () => {
  const res = await fetch(`${baseUrl}/api/v1/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phrase: KNOWN_PHRASE }),
  });
  assert.strictEqual(res.status, 200);

  const body = await res.json();
  assert.strictEqual(body.username, KNOWN_USERNAME);
  assert.strictEqual(body.access_token, 'mock-access-token');
  assert.strictEqual(body.refresh_token, 'mock-refresh-token');
  assert.strictEqual(body.expires_in, 300);
  assert.strictEqual(
    'password' in body,
    false,
    'restore must never echo the password back to the client'
  );
});

test('POST /api/v1/restore returns 400 for a malformed phrase (wrong word count)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phrase: 'not enough words' }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /api/v1/restore returns 401 for a well-formed but unknown phrase', async () => {
  const bogusPhrase = recoveryPhraseFromCredentials(
    '99999999-8888-7777-6666-555555555555',
    'ffffffffffffffffffffffffffffffff'
  );
  const res = await fetch(`${baseUrl}/api/v1/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phrase: bogusPhrase }),
  });
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.ok(body.error);
});

test('POST /api/v1/restore returns 400 when phrase is missing entirely', async () => {
  const res = await fetch(`${baseUrl}/api/v1/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 400);
});

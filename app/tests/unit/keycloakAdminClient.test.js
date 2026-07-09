import { test } from 'node:test';
import assert from 'node:assert';

import { createKeycloakAdminClient } from '../../services/keycloakAdminClient.js';

function makeClient(fetchMock) {
  global.fetch = fetchMock;
  return createKeycloakAdminClient({
    base: 'http://keycloak:8080',
    realm: 'hhh',
    clientId: 'hhh-backend',
    clientSecret: 'secret',
  });
}

function tokenResponse() {
  return {
    ok: true,
    json: async () => ({ access_token: 'tok', expires_in: 60 }),
  };
}

test('revokeSession accepts a realistic non-UUID Keycloak session id', async () => {
  const calls = [];
  const client = makeClient(async (url) => {
    calls.push(url);
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    return { ok: true, json: async () => ({}) };
  });

  // Real Keycloak deployments don't always issue canonical 36-char UUIDs for
  // session ids (depends on the session storage provider) — this is the
  // shape reported in the bug (24-char mixed-case, no hyphens).
  await client.revokeSession('LgqDnRWC38wgEzZnX39YpVgt');

  const deleteUrl = calls.find((u) => String(u).includes('/sessions/'));
  assert.ok(deleteUrl, 'expected a DELETE call to the sessions endpoint');
  assert.ok(deleteUrl.endsWith('/sessions/LgqDnRWC38wgEzZnX39YpVgt'));
});

test('revokeSession rejects ids containing path-traversal characters', async () => {
  const client = makeClient(async () => tokenResponse());
  await assert.rejects(
    () => client.revokeSession('../../etc/passwd'),
    /Invalid sessionId/
  );
});

test('revokeSession rejects ids with slashes or whitespace', async () => {
  const client = makeClient(async () => tokenResponse());
  await assert.rejects(
    () => client.revokeSession('abc/def'),
    /Invalid sessionId/
  );
  await assert.rejects(
    () => client.revokeSession('abc def'),
    /Invalid sessionId/
  );
});

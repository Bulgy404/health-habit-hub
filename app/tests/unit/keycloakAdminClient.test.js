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

test('resetPassword PUTs a non-temporary password credential', async () => {
  const calls = [];
  const client = makeClient(async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    return { ok: true, json: async () => ({}) };
  });

  await client.resetPassword('user-1', 'new-pass-hex');

  const call = calls.find((c) => String(c.url).includes('/reset-password'));
  assert.ok(call, 'expected a reset-password call');
  assert.strictEqual(call.opts.method, 'PUT');
  assert.ok(call.url.endsWith('/admin/realms/hhh/users/user-1/reset-password'));
  const body = JSON.parse(call.opts.body);
  assert.deepStrictEqual(body, {
    type: 'password',
    value: 'new-pass-hex',
    temporary: false,
  });
});

test('resetPassword throws when Keycloak rejects the request', async () => {
  const client = makeClient(async (url) => {
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    return { ok: false, status: 400 };
  });

  await assert.rejects(
    () => client.resetPassword('user-1', 'new-pass'),
    /Keycloak resetPassword failed: 400/
  );
});

test('listUsersByRole fetches the role-users endpoint', async () => {
  const calls = [];
  const client = makeClient(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    return {
      ok: true,
      json: async () => [{ id: 'u1', username: 'alice' }],
    };
  });

  const users = await client.listUsersByRole('admin');

  assert.deepStrictEqual(users, [{ id: 'u1', username: 'alice' }]);
  assert.ok(
    calls.some((u) => u.endsWith('/admin/realms/hhh/roles/admin/users'))
  );
});

test('searchUsers fetches the users search endpoint with the query', async () => {
  const calls = [];
  const client = makeClient(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    return { ok: true, json: async () => [] };
  });

  await client.searchUsers('ali ce');

  assert.ok(
    calls.some(
      (u) => u.includes('search=ali%20ce') || u.includes('search=ali+ce')
    )
  );
});

test('removeRole DELETEs the role mapping', async () => {
  const calls = [];
  const client = makeClient(async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    if (String(url).includes('/roles/researcher')) {
      return {
        ok: true,
        json: async () => ({ id: 'role-1', name: 'researcher' }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });

  await client.removeRole('user-1', 'researcher');

  const deleteCall = calls.find((c) => c.opts?.method === 'DELETE');
  assert.ok(deleteCall, 'expected a DELETE call');
  assert.ok(deleteCall.url.endsWith('/users/user-1/role-mappings/realm'));
});

test('removeRole throws when the mapping delete fails', async () => {
  const client = makeClient(async (url, opts) => {
    if (String(url).includes('/protocol/openid-connect/token')) {
      return tokenResponse();
    }
    if (opts?.method === 'DELETE') return { ok: false, status: 500 };
    return {
      ok: true,
      json: async () => ({ id: 'role-1', name: 'researcher' }),
    };
  });

  await assert.rejects(
    () => client.removeRole('user-1', 'researcher'),
    /Keycloak removeRole failed: 500/
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

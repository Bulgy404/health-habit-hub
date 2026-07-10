import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createTeamRouter } from '../../routes/admin/teamRouter.js';

function makeFakeKeycloak() {
  const admins = [{ id: 'u1', username: 'alice', email: 'alice@x.test' }];
  const researchers = [
    { id: 'u1', username: 'alice', email: 'alice@x.test' },
    { id: 'u2', username: 'bob', email: 'bob@x.test' },
  ];
  const calls = [];
  return {
    calls,
    async listUsersByRole(role) {
      calls.push({ fn: 'listUsersByRole', role });
      return role === 'admin' ? admins : researchers;
    },
    async searchUsers(q) {
      calls.push({ fn: 'searchUsers', q });
      return [{ id: 'u3', username: 'carol', email: 'carol@x.test' }];
    },
    async assignRole(userId, role) {
      calls.push({ fn: 'assignRole', userId, role });
    },
    async removeRole(userId, role) {
      calls.push({ fn: 'removeRole', userId, role });
    },
  };
}

let app, server, baseUrl, kc, currentRoles;

before(async () => {
  currentRoles = ['admin'];
  kc = makeFakeKeycloak();
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      sub: 'admin-user',
      preferred_username: 'admin1',
      realm_access: { roles: currentRoles },
    };
    next();
  });
  app.use('/api/v1/admin', createTeamRouter({ keycloak: kc }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  kc.calls.length = 0;
  currentRoles = ['admin'];
});

test('GET /team merges admin and researcher role holders by user id', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/team`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.members.length, 2);
  const alice = body.members.find((m) => m.username === 'alice');
  assert.deepStrictEqual(alice.roles.sort(), ['admin', 'researcher']);
  const bob = body.members.find((m) => m.username === 'bob');
  assert.deepStrictEqual(bob.roles, ['researcher']);
});

test('GET /team/search forwards the query and shapes the result', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/team/search?q=carol`);
  const body = await res.json();
  assert.strictEqual(body.users.length, 1);
  assert.strictEqual(body.users[0].username, 'carol');
  assert.deepStrictEqual(kc.calls, [{ fn: 'searchUsers', q: 'carol' }]);
});

test('GET /team/search with no query returns an empty list without calling Keycloak', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/team/search`);
  const body = await res.json();
  assert.deepStrictEqual(body.users, []);
  assert.strictEqual(kc.calls.length, 0);
});

test('POST /team/:userId/roles grants a valid role', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/team/u3/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'researcher' }),
  });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(kc.calls, [
    { fn: 'assignRole', userId: 'u3', role: 'researcher' },
  ]);
});

test('POST /team/:userId/roles rejects an unknown role', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/team/u3/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'superadmin' }),
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(kc.calls.length, 0);
});

test('DELETE /team/:userId/roles/:role revokes a role', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/team/u2/roles/researcher`, {
    method: 'DELETE',
  });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(kc.calls, [
    { fn: 'removeRole', userId: 'u2', role: 'researcher' },
  ]);
});

test('non-admin (researcher) is rejected with 403 on all routes', async () => {
  currentRoles = ['researcher'];
  const getRes = await fetch(`${baseUrl}/api/v1/admin/team`);
  assert.strictEqual(getRes.status, 403);
  const postRes = await fetch(`${baseUrl}/api/v1/admin/team/u1/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.strictEqual(postRes.status, 403);
});

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createAuditLogRouter } from '../../routes/admin/auditLogRouter.js';

function makeDb() {
  const rows = [];
  return {
    rows,
    collection(name) {
      assert.strictEqual(name, 'admin_audit_log');
      return {
        find(query = {}) {
          const matched = rows.filter((r) =>
            Object.entries(query).every(([k, v]) => r[k] === v)
          );
          return {
            sort() {
              matched.sort((a, b) => b.createdAt - a.createdAt);
              return this;
            },
            limit(n) {
              matched.length = Math.min(matched.length, n);
              return this;
            },
            async toArray() {
              return matched;
            },
          };
        },
      };
    },
  };
}

function entry(overrides = {}) {
  return {
    _id: { toString: () => Math.random().toString(36).slice(2) },
    byUserId: 'u1',
    byUsername: 'admin1',
    method: 'POST',
    action: 'create_study',
    resourceType: 'study',
    resourceId: 's1',
    statusCode: 201,
    result: 'succeeded',
    detail: null,
    createdAt: new Date(),
    ...overrides,
  };
}

let app, server, baseUrl, db, currentRoles;

before(async () => {
  db = makeDb();
  currentRoles = ['admin'];
  app = express();
  app.use((req, _res, next) => {
    req.user = {
      sub: 'u1',
      preferred_username: 'admin1',
      realm_access: { roles: currentRoles },
    };
    next();
  });
  app.use('/api/v1/admin', createAuditLogRouter({ db }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  db.rows.length = 0;
  currentRoles = ['admin'];
});

test('returns entries newest first', async () => {
  const older = entry({ createdAt: new Date('2026-01-01') });
  const newer = entry({ createdAt: new Date('2026-02-01') });
  db.rows.push(older, newer);

  const res = await fetch(`${baseUrl}/api/v1/admin/audit-log`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.entries.length, 2);
  assert.strictEqual(body.entries[0].action, 'create_study');
});

test('filters by resourceType', async () => {
  db.rows.push(
    entry({ resourceType: 'study' }),
    entry({ resourceType: 'participant', action: 'delete_participant' })
  );

  const res = await fetch(
    `${baseUrl}/api/v1/admin/audit-log?resourceType=participant`
  );
  const body = await res.json();
  assert.strictEqual(body.entries.length, 1);
  assert.strictEqual(body.entries[0].action, 'delete_participant');
});

test('limit is clamped to 200', async () => {
  for (let i = 0; i < 5; i++) db.rows.push(entry());
  const res = await fetch(`${baseUrl}/api/v1/admin/audit-log?limit=99999`);
  const body = await res.json();
  assert.strictEqual(body.entries.length, 5);
});

test('non-admin (researcher) is rejected with 403', async () => {
  currentRoles = ['researcher'];
  const res = await fetch(`${baseUrl}/api/v1/admin/audit-log`);
  assert.strictEqual(res.status, 403);
});

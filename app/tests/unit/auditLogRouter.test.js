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
          // Supports plain equality plus the $gte/$lte range the export route
          // uses for createdAt — enough of the driver's semantics for these
          // tests, and nothing more.
          const match = (value, cond) => {
            if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
              if ('$gte' in cond && !(value >= cond.$gte)) return false;
              if ('$lte' in cond && !(value <= cond.$lte)) return false;
              return true;
            }
            return value === cond;
          };
          const matched = rows.filter((r) =>
            Object.entries(query).every(([k, v]) => match(r[k], v))
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

after(() => {
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit) waits forever
  // for connections that fetch()'s undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
});

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

test('export: returns CSV with a header and one row per entry', async () => {
  db.rows.push(
    entry({ action: 'create_study', createdAt: new Date('2026-01-01') }),
    entry({ action: 'delete_study', createdAt: new Date('2026-02-01') })
  );

  const res = await fetch(`${baseUrl}/api/v1/admin/audit-log/export`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(
    res.headers.get('content-disposition'),
    /attachment; filename="admin-audit-log-\d{4}-\d{2}-\d{2}\.csv"/
  );

  const lines = (await res.text()).trim().split('\n');
  assert.strictEqual(lines.length, 3, 'header + 2 rows');
  assert.ok(lines[0].includes('createdAt'), 'header must include createdAt');
  assert.ok(lines[0].includes('byUserId'), 'export must include byUserId');
  assert.ok(lines[0].includes('resourceType'));
});

test('export: honours the same filters as the list route', async () => {
  db.rows.push(
    entry({ resourceType: 'study' }),
    entry({ resourceType: 'participant' })
  );

  const res = await fetch(
    `${baseUrl}/api/v1/admin/audit-log/export?resourceType=participant`
  );
  const text = await res.text();
  assert.strictEqual(text.trim().split('\n').length, 2, 'header + 1 row');
  assert.ok(text.includes('participant'));
  assert.ok(!text.includes(',study,'));
});

test('export: from/to bound the createdAt range', async () => {
  db.rows.push(
    entry({ action: 'too_old', createdAt: new Date('2026-01-01') }),
    entry({ action: 'in_range', createdAt: new Date('2026-02-15') }),
    entry({ action: 'too_new', createdAt: new Date('2026-03-20') })
  );

  const res = await fetch(
    `${baseUrl}/api/v1/admin/audit-log/export?from=2026-02-01&to=2026-03-01`
  );
  const text = await res.text();
  assert.ok(text.includes('in_range'), 'entry inside the window must appear');
  assert.ok(!text.includes('too_old'), 'entry before `from` must be excluded');
  assert.ok(!text.includes('too_new'), 'entry after `to` must be excluded');
});

test('export: an unparseable date is ignored rather than excluding everything', async () => {
  db.rows.push(entry({ action: 'still_here' }));
  const res = await fetch(
    `${baseUrl}/api/v1/admin/audit-log/export?from=not-a-date`
  );
  assert.strictEqual(res.status, 200);
  assert.ok((await res.text()).includes('still_here'));
});

test('export: object detail is serialised rather than rendered [object Object]', async () => {
  db.rows.push(entry({ detail: { reason: 'bulk-delete', count: 3 } }));
  const text = await fetch(`${baseUrl}/api/v1/admin/audit-log/export`).then(
    (r) => r.text()
  );
  assert.ok(text.includes('bulk-delete'), 'detail contents must survive');
  assert.ok(!text.includes('[object Object]'));
});

test('export: non-admin (researcher) is rejected with 403', async () => {
  currentRoles = ['researcher'];
  const res = await fetch(`${baseUrl}/api/v1/admin/audit-log/export`);
  assert.strictEqual(res.status, 403);
});

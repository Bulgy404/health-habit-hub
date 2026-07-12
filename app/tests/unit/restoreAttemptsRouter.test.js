import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createRestoreAttemptsRouter } from '../../routes/admin/restoreAttemptsRouter.js';

function makeDb() {
  const rows = [];
  return {
    rows,
    collection(name) {
      assert.strictEqual(name, 'restore_attempts');
      return {
        find(query = {}) {
          let matched = rows.filter((r) =>
            Object.entries(query).every(([k, v]) => r[k] === v)
          );
          return {
            sort() {
              matched = [...matched].sort((a, b) => b.createdAt - a.createdAt);
              return this;
            },
            skip(n) {
              matched = matched.slice(n);
              return this;
            },
            limit(n) {
              matched = matched.slice(0, n);
              return this;
            },
            async toArray() {
              return matched;
            },
          };
        },
        async countDocuments(query = {}) {
          return rows.filter((r) =>
            Object.entries(query).every(([k, v]) => r[k] === v)
          ).length;
        },
        aggregate() {
          // Minimal in-memory re-implementation of this router's exact
          // pipeline: filter non-success within the flag window, group by
          // ip with a count + max(createdAt), keep counts >= 3, sort desc.
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const nonSuccess = rows.filter(
            (r) => r.outcome !== 'success' && r.createdAt >= oneHourAgo
          );
          const byIp = new Map();
          for (const r of nonSuccess) {
            const cur = byIp.get(r.ip) ?? {
              failCount: 0,
              lastAttemptAt: r.createdAt,
            };
            cur.failCount += 1;
            if (r.createdAt > cur.lastAttemptAt)
              cur.lastAttemptAt = r.createdAt;
            byIp.set(r.ip, cur);
          }
          const grouped = [...byIp.entries()]
            .filter(([, v]) => v.failCount >= 3)
            .map(([ip, v]) => ({ _id: ip, ...v }))
            .sort((a, b) => b.failCount - a.failCount)
            .slice(0, 20);
          return {
            async toArray() {
              return grouped;
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
    ip: '203.0.113.1',
    usernameAttempted: null,
    outcome: 'invalid_credentials',
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
    req.user = { sub: 'u1', realm_access: { roles: currentRoles } };
    next();
  });
  app.use('/api/v1/admin', createRestoreAttemptsRouter({ db }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  db.rows.length = 0;
  currentRoles = ['admin'];
});

test('returns entries newest first with total/page/limit', async () => {
  db.rows.push(
    entry({ createdAt: new Date('2026-01-01') }),
    entry({ createdAt: new Date('2026-02-01') })
  );

  const res = await fetch(`${baseUrl}/api/v1/admin/restore-attempts`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.entries.length, 2);
  assert.strictEqual(body.total, 2);
  assert.strictEqual(body.page, 1);
  assert.ok(
    body.entries[0].createdAt >= body.entries[1].createdAt ||
      new Date(body.entries[0].createdAt) >= new Date(body.entries[1].createdAt)
  );
});

test('paginates with page/limit', async () => {
  for (let i = 0; i < 5; i++) db.rows.push(entry());
  const res = await fetch(
    `${baseUrl}/api/v1/admin/restore-attempts?page=2&limit=2`
  );
  const body = await res.json();
  assert.strictEqual(body.entries.length, 2);
  assert.strictEqual(body.total, 5);
  assert.strictEqual(body.page, 2);
  assert.strictEqual(body.limit, 2);
});

test('filters by outcome and ip', async () => {
  db.rows.push(
    entry({ outcome: 'success', ip: '1.1.1.1' }),
    entry({ outcome: 'invalid_credentials', ip: '2.2.2.2' })
  );
  const res = await fetch(
    `${baseUrl}/api/v1/admin/restore-attempts?outcome=success`
  );
  const body = await res.json();
  assert.strictEqual(body.entries.length, 1);
  assert.strictEqual(body.entries[0].ip, '1.1.1.1');
});

test('flags an IP with 3+ non-success attempts in the last hour', async () => {
  const now = new Date();
  db.rows.push(
    entry({ ip: '9.9.9.9', outcome: 'invalid_credentials', createdAt: now }),
    entry({ ip: '9.9.9.9', outcome: 'invalid_phrase', createdAt: now }),
    entry({ ip: '9.9.9.9', outcome: 'rate_limited', createdAt: now }),
    entry({ ip: '5.5.5.5', outcome: 'success', createdAt: now })
  );

  const res = await fetch(`${baseUrl}/api/v1/admin/restore-attempts`);
  const body = await res.json();
  assert.strictEqual(body.flaggedIps.length, 1);
  assert.strictEqual(body.flaggedIps[0].ip, '9.9.9.9');
  assert.strictEqual(body.flaggedIps[0].failCount, 3);
});

test('does not flag an IP with fewer than 3 non-success attempts', async () => {
  const now = new Date();
  db.rows.push(
    entry({ ip: '9.9.9.9', outcome: 'invalid_credentials', createdAt: now }),
    entry({ ip: '9.9.9.9', outcome: 'invalid_phrase', createdAt: now })
  );

  const res = await fetch(`${baseUrl}/api/v1/admin/restore-attempts`);
  const body = await res.json();
  assert.strictEqual(body.flaggedIps.length, 0);
});

test('non-admin (researcher) is rejected with 403', async () => {
  currentRoles = ['researcher'];
  const res = await fetch(`${baseUrl}/api/v1/admin/restore-attempts`);
  assert.strictEqual(res.status, 403);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createAdminRouter } from '../../routes/adminRouter.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/roles.js';

// ── Minimal in-memory Mongo-like store ────────────────────────────────────────
// Only the deviceTokens/participants operations GET /admin/devices actually
// performs — find({}) with sort/skip/limit, countDocuments({}), and
// find({userId: {$in: [...]}}) with project() for the participant
// cross-reference.

function makeDb() {
  const deviceTokens = [];
  const participants = [];

  function collectionFor(name) {
    if (name === 'deviceTokens') return deviceTokens;
    if (name === 'participants') return participants;
    throw new Error(`Unexpected collection: ${name}`);
  }

  return {
    deviceTokens,
    participants,
    collection(name) {
      const store = collectionFor(name);
      return {
        async countDocuments() {
          return store.length;
        },
        find(query = {}) {
          let results = [...store];
          if (query.userId?.$in) {
            const wanted = new Set(query.userId.$in);
            results = results.filter((d) => wanted.has(d.userId));
          }
          const cursor = {
            sort() {
              return cursor;
            },
            skip(n) {
              results = results.slice(n);
              return cursor;
            },
            limit(n) {
              results = results.slice(0, n);
              return cursor;
            },
            project() {
              return cursor;
            },
            async toArray() {
              return results;
            },
          };
          return cursor;
        },
      };
    },
  };
}

// ── Test server: real requireRole gate, req.user injected via a test header
// (mirrors admin.habitDonations.test.js's pattern — the real authenticate
// middleware populating req.user from a verified JWT is covered elsewhere,
// e.g. admin.progress.test.js) ──────────────────────────────────────────────

let app, server, baseUrl, db;

before(async () => {
  db = makeDb();

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const roles = (req.get('x-test-roles') || '').split(',').filter(Boolean);
    req.user = { sub: 'test-admin', realm_access: { roles } };
    next();
  });
  app.use(
    '/api/v1/admin',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createAdminRouter({ db })
  );
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const ADMIN_HEADERS = { 'x-test-roles': 'admin' };

test('GET /admin/devices — 403 for a caller without admin/researcher role', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/devices`, {
    headers: { 'x-test-roles': 'user' },
  });
  assert.strictEqual(res.status, 403);
});

test('GET /admin/devices — empty list when nothing registered', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/devices`, {
    headers: ADMIN_HEADERS,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.total, 0);
  assert.deepStrictEqual(body.devices, []);
});

test('GET /admin/devices — cross-references a device to its participant, and flags an unmatched one', async () => {
  db.participants.push({
    userId: 'user-1',
    username: 'p-user-1',
    deletedAt: undefined,
  });
  db.deviceTokens.push({
    _id: new ObjectId(),
    userId: 'user-1',
    deviceId: 'device-a',
    token: 'fcm-a',
    platform: 'ios',
    model: 'iPhone16,1',
    appVersion: '1.1.1+5',
    updatedAt: new Date('2026-08-19T10:00:00Z'),
  });
  db.deviceTokens.push({
    _id: new ObjectId(),
    userId: 'user-orphaned',
    deviceId: 'device-b',
    token: 'fcm-b',
    platform: 'android',
    model: 'Pixel 8',
    appVersion: '1.1.0+4',
    updatedAt: new Date('2026-08-19T09:00:00Z'),
  });

  const res = await fetch(`${baseUrl}/api/v1/admin/devices`, {
    headers: ADMIN_HEADERS,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.total, 2);

  const matched = body.devices.find((d) => d.userId === 'user-1');
  assert.strictEqual(matched.username, 'p-user-1');
  assert.strictEqual(matched.participantStatus, 'active');
  assert.strictEqual(matched.model, 'iPhone16,1');
  assert.strictEqual(matched.appVersion, '1.1.1+5');
  assert.strictEqual(matched.deviceId, 'device-a');

  const orphaned = body.devices.find((d) => d.userId === 'user-orphaned');
  assert.strictEqual(orphaned.username, null);
  assert.strictEqual(orphaned.participantStatus, 'no_matching_participant');
});

test('GET /admin/devices — a legacy doc with no deviceId/platform/model/appVersion renders as nulls, not an error', async () => {
  db.deviceTokens.push({
    _id: new ObjectId(),
    userId: 'user-legacy',
    token: 'fcm-legacy',
    updatedAt: new Date('2026-08-18T00:00:00Z'),
  });

  const res = await fetch(`${baseUrl}/api/v1/admin/devices`, {
    headers: ADMIN_HEADERS,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  const legacy = body.devices.find((d) => d.userId === 'user-legacy');
  assert.ok(legacy, 'legacy doc should still appear in the list');
  assert.strictEqual(legacy.deviceId, null);
  assert.strictEqual(legacy.platform, null);
  assert.strictEqual(legacy.model, null);
  assert.strictEqual(legacy.appVersion, null);
});

test('GET /admin/devices — pagination respects page/limit', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/devices?page=1&limit=2`, {
    headers: ADMIN_HEADERS,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.page, 1);
  assert.strictEqual(body.limit, 2);
  assert.strictEqual(body.devices.length, 2);
  // total reflects the full collection (3 docs pushed across prior tests),
  // independent of this page's size.
  assert.strictEqual(body.total, 3);
});

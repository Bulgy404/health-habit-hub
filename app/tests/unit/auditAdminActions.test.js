import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createAuditAdminActionsMiddleware } from '../../middleware/auditAdminActions.js';

function makeDb({ failInsert = false } = {}) {
  const rows = [];
  return {
    rows,
    collection(name) {
      assert.strictEqual(name, 'admin_audit_log');
      return {
        async insertOne(doc) {
          if (failInsert) throw new Error('insert failed');
          rows.push(doc);
        },
      };
    },
  };
}

/** Polls until [check] returns true or the timeout elapses (audit writes are fire-and-forget on 'finish'). */
async function waitFor(check, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitFor timed out');
}

let app;
let server;
let baseUrl;
let db;

function buildApp(dbInstance) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.user = { sub: 'user-1', preferred_username: 'admin1' };
    next();
  });
  a.use(createAuditAdminActionsMiddleware({ getDb: async () => dbInstance }));
  a.get('/backups/status', (_req, res) => res.json({ ok: true }));
  a.delete('/backups/:filename', (_req, res) => res.json({ ok: true }));
  a.get('/studies', (_req, res) => res.json({ studies: [] }));
  a.post('/studies', (_req, res) => {
    res.locals.auditAction = 'create_study';
    res.locals.auditResourceType = 'study';
    res.locals.auditResourceId = 'study-1';
    res.status(201).json({ ok: true });
  });
  a.delete('/participants/:id', (req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  return a;
}

before(async () => {
  db = makeDb();
  app = buildApp(db);
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  db.rows.length = 0;
});

test('GET requests are not audited', async () => {
  const res = await fetch(`${baseUrl}/studies`);
  assert.strictEqual(res.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(db.rows.length, 0);
});

test('/backups/* mutating requests are skipped (has its own audit log)', async () => {
  const res = await fetch(`${baseUrl}/backups/foo.tar.gz`, {
    method: 'DELETE',
  });
  assert.strictEqual(res.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(db.rows.length, 0);
});

test('a mutating request with res.locals annotations is logged with the human label', async () => {
  const res = await fetch(`${baseUrl}/studies`, { method: 'POST' });
  assert.strictEqual(res.status, 201);
  await waitFor(() => db.rows.length === 1);
  const entry = db.rows[0];
  assert.strictEqual(entry.byUserId, 'user-1');
  assert.strictEqual(entry.byUsername, 'admin1');
  assert.strictEqual(entry.method, 'POST');
  assert.strictEqual(entry.action, 'create_study');
  assert.strictEqual(entry.resourceType, 'study');
  assert.strictEqual(entry.resourceId, 'study-1');
  assert.strictEqual(entry.statusCode, 201);
  assert.strictEqual(entry.result, 'succeeded');
  assert.ok(entry.createdAt instanceof Date);
});

test('a mutating request without annotations falls back to a generic label', async () => {
  await fetch(`${baseUrl}/participants/p-1`, { method: 'DELETE' });
  await waitFor(() => db.rows.length === 1);
  const entry = db.rows[0];
  assert.strictEqual(entry.action, 'DELETE /participants/p-1');
  assert.strictEqual(entry.resourceType, null);
  assert.strictEqual(entry.statusCode, 404);
  assert.strictEqual(entry.result, 'failed');
});

test('a failed audit write never surfaces to the caller', async () => {
  const failingDb = makeDb({ failInsert: true });
  const failingApp = buildApp(failingDb);
  const failingServer = createServer(failingApp);
  await new Promise((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
  const port = failingServer.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/studies`, {
    method: 'POST',
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.deepStrictEqual(body, { ok: true });

  failingServer.close();
});

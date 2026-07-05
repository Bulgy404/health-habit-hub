import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createBackupsRouter } from '../../routes/admin/backupsRouter.js';

// ── Minimal in-memory Mongo stub — only what backupsRouter actually uses ────

function makeDb() {
  const collections = {
    backup_audit_log: [],
    restore_confirmation_tokens: [],
    admin_settings: [],
  };
  return {
    _collections: collections,
    collection(name) {
      const rows = collections[name] ?? (collections[name] = []);
      return {
        async insertOne(doc) {
          const stored = {
            _id: { toString: () => String(rows.length + 1) },
            ...doc,
          };
          rows.push(stored);
          return { insertedId: stored._id };
        },
        async findOne(filter = {}) {
          return (
            rows.find((d) =>
              Object.entries(filter).every(([k, v]) => {
                if (v && typeof v === 'object' && '$gt' in v)
                  return d[k] > v.$gt;
                return d[k] === v;
              })
            ) ?? null
          );
        },
        async deleteOne(filter) {
          const idx = rows.findIndex((d) => d._id === filter._id);
          if (idx !== -1) rows.splice(idx, 1);
        },
        async updateOne(filter, update, options = {}) {
          const idx = rows.findIndex((d) =>
            Object.entries(filter).every(([k, v]) => d[k] === v)
          );
          if (idx === -1 && options.upsert) {
            rows.push({ ...filter, ...update.$set });
            return;
          }
          if (idx !== -1) Object.assign(rows[idx], update.$set);
        },
        find() {
          const sorted = [...rows];
          return {
            sort(spec) {
              const [[key, dir]] = Object.entries(spec);
              sorted.sort((a, b) => (a[key] > b[key] ? -1 : 1) * dir * -1);
              return this;
            },
            limit(n) {
              sorted.length = Math.min(sorted.length, n);
              return this;
            },
            async toArray() {
              return sorted;
            },
          };
        },
      };
    },
  };
}

// ── Fake backup-api standing in for the real internal service ──────────────

let fakeBackupApi;
let fakeBackupApiUrl;
let fakeBackupApiRequests;

function startFakeBackupApi() {
  fakeBackupApiRequests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      fakeBackupApiRequests.push({ method: req.method, url: req.url });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/status') {
        return res.end(
          JSON.stringify({ lastBackup: null, history: [], running: false })
        );
      }
      if (req.url === '/jobs/current') {
        return res.end(JSON.stringify(null));
      }
      if (req.url === '/trigger') {
        return res.end(JSON.stringify({ jobId: 'job-1' }));
      }
      if (req.url === '/restore') {
        return res.end(JSON.stringify({ jobId: 'job-2' }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      fakeBackupApi = server;
      fakeBackupApiUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

// ── Test app wiring ──────────────────────────────────────────────────────────

let app;
let server;
let baseUrl;
let db;
let currentRoles = ['admin'];

before(async () => {
  await startFakeBackupApi();
  process.env.BACKUP_API_URL = fakeBackupApiUrl;
  process.env.BACKUP_API_SECRET = 'test-secret';

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      sub: 'admin-user-1',
      preferred_username: 'admin1',
      realm_access: { roles: currentRoles },
    };
    next();
  });
  db = makeDb();
  app.use('/api/v1/admin', createBackupsRouter({ db }));

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fakeBackupApi.close();
});

beforeEach(() => {
  currentRoles = ['admin'];
  db._collections.backup_audit_log.length = 0;
  db._collections.restore_confirmation_tokens.length = 0;
  db._collections.admin_settings.length = 0;
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('GET /backups/status proxies to backup-api and returns its payload', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/backups/status`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.running, false);
});

test('non-admin (researcher) is rejected with 403', async () => {
  currentRoles = ['researcher'];
  const res = await fetch(`${baseUrl}/api/v1/admin/backups/status`);
  assert.strictEqual(res.status, 403);
});

test('POST /backups/trigger records a requested + succeeded audit entry', async () => {
  const res = await fetch(`${baseUrl}/api/v1/admin/backups/trigger`, {
    method: 'POST',
  });
  assert.strictEqual(res.status, 202);
  const entries = db._collections.backup_audit_log;
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].action, 'trigger');
  assert.strictEqual(entries[0].result, 'requested');
  assert.strictEqual(entries[1].result, 'succeeded');
});

test('POST /backups/upload rejects a non-.tar.gz filename before ever contacting backup-api', async () => {
  const requestsBefore = fakeBackupApiRequests.length;
  const form = new FormData();
  form.append(
    'file',
    new Blob(['not a tar'], { type: 'text/plain' }),
    'evil.sh'
  );
  const res = await fetch(`${baseUrl}/api/v1/admin/backups/upload`, {
    method: 'POST',
    body: form,
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fakeBackupApiRequests.length, requestsBefore); // never forwarded
});

test('restore is rejected when confirmFilename does not match the URL filename', async () => {
  const tokenRes = await fetch(
    `${baseUrl}/api/v1/admin/backups/full_backup_20260101_000001.tar.gz/restore-token`,
    { method: 'POST' }
  );
  const { token } = await tokenRes.json();

  const res = await fetch(
    `${baseUrl}/api/v1/admin/backups/full_backup_20260101_000001.tar.gz/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmFilename: 'full_backup_20260101_000002.tar.gz',
        restoreToken: token,
      }),
    }
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /must exactly match/);
});

test('restore is rejected without a valid confirmation token', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/admin/backups/full_backup_20260101_000001.tar.gz/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmFilename: 'full_backup_20260101_000001.tar.gz',
        restoreToken: 'made-up-token',
      }),
    }
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid or expired/);
});

test('restore token is single-use — a second attempt with the same token fails', async () => {
  const filename = 'full_backup_20260101_000003.tar.gz';
  const tokenRes = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore-token`,
    {
      method: 'POST',
    }
  );
  const { token } = await tokenRes.json();

  const restoreBody = JSON.stringify({
    confirmFilename: filename,
    restoreToken: token,
  });
  const first = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: restoreBody,
    }
  );
  assert.strictEqual(first.status, 202);

  const second = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: restoreBody,
    }
  );
  assert.strictEqual(second.status, 400);
});

test('a valid restore request sets maintenance mode and writes a requested audit entry', async () => {
  const filename = 'full_backup_20260101_000004.tar.gz';
  const tokenRes = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore-token`,
    {
      method: 'POST',
    }
  );
  const { token } = await tokenRes.json();

  const res = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmFilename: filename, restoreToken: token }),
    }
  );
  assert.strictEqual(res.status, 202);

  const maintenanceSetting = db._collections.admin_settings.find(
    (s) => s.key === 'maintenanceMode'
  );
  assert.strictEqual(maintenanceSetting.value, true);

  const auditEntry = db._collections.backup_audit_log.find(
    (e) => e.action === 'restore' && e.filename === filename
  );
  assert.strictEqual(auditEntry.result, 'requested');
});

test('restore token issued to one user cannot be redeemed by another', async () => {
  const filename = 'full_backup_20260101_000005.tar.gz';
  const tokenRes = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore-token`,
    {
      method: 'POST',
    }
  );
  const { token } = await tokenRes.json();

  // Forge a token document belonging to a different user directly to prove
  // the query is scoped by byUserId, not just token+filename.
  const stored = db._collections.restore_confirmation_tokens.find(
    (t) => t.token === token
  );
  stored.byUserId = 'someone-else';

  const res = await fetch(
    `${baseUrl}/api/v1/admin/backups/${filename}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmFilename: filename, restoreToken: token }),
    }
  );
  assert.strictEqual(res.status, 400);
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createActivityTypeRouter } from '../../routes/activityTypeRouter.js';
import { ROLES } from '../../middleware/roles.js';

const catalog = [{ key: 'walking', label_en: 'Walking', isDefault: true }];
const deleted = [];

const fakeDb = {
  collection() {
    return {
      find: () => ({ sort: () => ({ toArray: async () => catalog }) }),
      deleteOne: async ({ key }) => {
        deleted.push(key);
        return { deletedCount: 1 };
      },
    };
  },
};

let server;
let baseUrl;
let roles;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { sub: 'u1', realm_access: { roles } };
    next();
  });
  app.use('/activity-types', createActivityTypeRouter({ db: fakeDb }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}/activity-types${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

describe('activity-type catalog', () => {
  test('every portal role can list it', async () => {
    // A study's habit-creation settings label its activities from the
    // catalog, and researchers edit those settings too.
    for (const role of [
      ROLES.ADMIN,
      ROLES.RESEARCHER,
      ROLES.STUDY_RESEARCHER,
    ]) {
      roles = [role];
      const r = await call('GET', '');
      assert.equal(r.status, 200, role);
      assert.deepEqual(r.body, catalog);
    }
  });

  test('only an admin can change it', async () => {
    for (const role of [ROLES.RESEARCHER, ROLES.STUDY_RESEARCHER]) {
      roles = [role];
      for (const [method, path, body] of [
        ['POST', '', { key: 'rowing', label_en: 'Rowing' }],
        ['PATCH', '/walking', { label_en: 'Walk' }],
        ['DELETE', '/walking'],
      ]) {
        const r = await call(method, path, body);
        assert.equal(r.status, 403, `${role} ${method} ${path}`);
      }
    }
    assert.deepEqual(deleted, []);

    roles = [ROLES.ADMIN];
    assert.equal((await call('DELETE', '/walking')).status, 200);
    assert.deepEqual(deleted, ['walking']);
  });
});

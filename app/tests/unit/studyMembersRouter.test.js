import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createStudyMembersRouter } from '../../routes/admin/studyMembersRouter.js';

const STUDY_ID = new ObjectId();

/**
 * Hand-rolled Mongo double, matching the repo's convention. Only the
 * operations this router performs are implemented.
 */
function makeDb() {
  const members = [];
  let study = null;
  return {
    members,
    setStudy(s) {
      study = s;
    },
    collection(name) {
      if (name === 'studies') {
        return {
          async findOne(filter) {
            return study && String(study._id) === String(filter._id)
              ? study
              : null;
          },
        };
      }
      assert.strictEqual(name, 'study_memberships');
      return {
        find(filter) {
          const matched = members.filter(
            (m) => String(m.studyId) === String(filter.studyId)
          );
          return {
            sort() {
              return this;
            },
            async toArray() {
              return matched;
            },
          };
        },
        async updateOne(filter, update, opts) {
          const existing = members.find(
            (m) =>
              m.userId === filter.userId &&
              String(m.studyId) === String(filter.studyId)
          );
          if (existing) {
            Object.assign(existing, update.$set);
            return { matchedCount: 1 };
          }
          if (!opts?.upsert) return { matchedCount: 0 };
          members.push({
            _id: new ObjectId(),
            ...update.$setOnInsert,
            ...update.$set,
          });
          return { upsertedCount: 1 };
        },
        async deleteOne(filter) {
          const i = members.findIndex(
            (m) =>
              m.userId === filter.userId &&
              String(m.studyId) === String(filter.studyId)
          );
          if (i === -1) return { deletedCount: 0 };
          members.splice(i, 1);
          return { deletedCount: 1 };
        },
      };
    },
  };
}

let app, server, baseUrl, db, currentRoles;

const url = (p) => `${baseUrl}/api/v1/admin${p}`;
const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

before(async () => {
  db = makeDb();
  currentRoles = ['admin'];
  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = {
      sub: 'admin-1',
      preferred_username: 'admin1',
      realm_access: { roles: currentRoles },
    };
    res.locals = res.locals ?? {};
    next();
  });
  app.use('/api/v1/admin', createStudyMembersRouter({ db }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  db.members.length = 0;
  currentRoles = ['admin'];
  db.setStudy({
    _id: STUDY_ID,
    name: 'ICU follow-up',
    identity: { mode: 'verified' },
  });
});

test('lists members and reports that scoping is enforced on a verified study', async () => {
  const res = await fetch(url(`/studies/${STUDY_ID}/members`));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.enforced, true);
  assert.deepStrictEqual(body.members, []);
});

test('reports scoping as NOT enforced on an anonymous study', async () => {
  // Members can still be added — they simply have no effect yet. Saying so
  // avoids the impression that adding someone silently did nothing.
  db.setStudy({ _id: STUDY_ID, name: 'Open study', identity: null });
  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.enforced, false);
});

test('adds a member and returns them with role and scope', async () => {
  const res = await fetch(
    url(`/studies/${STUDY_ID}/members`),
    json('POST', {
      userId: 'r-1',
      username: 'rita',
      role: 'researcher',
      scope: 'read',
    })
  );
  assert.strictEqual(res.status, 200);

  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.members.length, 1);
  assert.strictEqual(body.members[0].userId, 'r-1');
  assert.strictEqual(body.members[0].username, 'rita');
  assert.strictEqual(body.members[0].scope, 'read');
  assert.strictEqual(body.members[0].createdBy, 'admin-1');
});

test('re-adding an existing member updates their scope instead of failing on the unique index', async () => {
  await fetch(
    url(`/studies/${STUDY_ID}/members`),
    json('POST', { userId: 'r-1', role: 'researcher', scope: 'read' })
  );
  const res = await fetch(
    url(`/studies/${STUDY_ID}/members`),
    json('POST', { userId: 'r-1', role: 'lead', scope: 'export' })
  );
  assert.strictEqual(res.status, 200);

  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.members.length, 1, 'must not create a duplicate');
  assert.strictEqual(body.members[0].role, 'lead');
  assert.strictEqual(body.members[0].scope, 'export');
});

test('rejects an unknown role and an unknown scope', async () => {
  for (const payload of [
    { userId: 'r-1', role: 'superuser', scope: 'read' },
    { userId: 'r-1', role: 'researcher', scope: 'everything' },
  ]) {
    const res = await fetch(
      url(`/studies/${STUDY_ID}/members`),
      json('POST', payload)
    );
    assert.strictEqual(res.status, 400);
  }
  assert.strictEqual(db.members.length, 0);
});

test('rejects a missing or blank userId', async () => {
  for (const userId of [undefined, '', '   ']) {
    const res = await fetch(
      url(`/studies/${STUDY_ID}/members`),
      json('POST', { userId, role: 'researcher', scope: 'read' })
    );
    assert.strictEqual(res.status, 400);
  }
});

test('removes a member', async () => {
  await fetch(
    url(`/studies/${STUDY_ID}/members`),
    json('POST', { userId: 'r-1', role: 'researcher', scope: 'read' })
  );
  const res = await fetch(url(`/studies/${STUDY_ID}/members/r-1`), {
    method: 'DELETE',
  });
  assert.strictEqual((await res.json()).removed, true);
  assert.strictEqual(db.members.length, 0);
});

test('removing someone who was never a member is not an error', async () => {
  const res = await fetch(url(`/studies/${STUDY_ID}/members/nobody`), {
    method: 'DELETE',
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).removed, false);
});

test('404s for a study that does not exist', async () => {
  db.setStudy(null);
  const res = await fetch(url(`/studies/${STUDY_ID}/members`));
  assert.strictEqual(res.status, 404);
});

test('400s for a malformed study id rather than throwing', async () => {
  const res = await fetch(url('/studies/not-an-objectid/members'));
  assert.strictEqual(res.status, 400);
});

test('a researcher cannot read or change the member list', async () => {
  currentRoles = ['researcher'];
  for (const [path, init] of [
    [`/studies/${STUDY_ID}/members`, {}],
    [
      `/studies/${STUDY_ID}/members`,
      json('POST', { userId: 'r-2', role: 'researcher', scope: 'export' }),
    ],
    [`/studies/${STUDY_ID}/members/r-1`, { method: 'DELETE' }],
  ]) {
    const res = await fetch(url(path), init);
    assert.strictEqual(res.status, 403, `${init.method ?? 'GET'} ${path}`);
  }
});

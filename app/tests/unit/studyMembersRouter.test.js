import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createStudyMembersRouter } from '../../routes/admin/studyMembersRouter.js';

const STUDY_ID = new ObjectId();
const OTHER_STUDY_ID = new ObjectId();

/**
 * Hand-rolled Mongo double, matching the repo's convention. Only the
 * operations this router performs are implemented.
 */
function makeDb() {
  const members = [];
  const studies = [];

  function matches(m, filter) {
    if (filter.studyId && String(m.studyId) !== String(filter.studyId)) {
      return false;
    }
    if (filter.userId && m.userId !== filter.userId) return false;
    return true;
  }

  return {
    members,
    studies,
    setStudy(s) {
      studies.length = 0;
      if (s) studies.push(s);
    },
    addStudy(s) {
      studies.push(s);
    },
    collection(name) {
      if (name === 'studies') {
        return {
          async findOne(filter) {
            return (
              studies.find((s) => String(s._id) === String(filter._id)) ?? null
            );
          },
          find(filter) {
            const ids = (filter?._id?.$in ?? []).map(String);
            return {
              async toArray() {
                return studies.filter((s) => ids.includes(String(s._id)));
              },
            };
          },
        };
      }
      assert.strictEqual(name, 'study_memberships');
      return {
        find(filter) {
          let matched = members.filter((m) => matches(m, filter));
          return {
            sort() {
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
        async countDocuments(filter) {
          return members.filter((m) => matches(m, filter)).length;
        },
        async findOne(filter) {
          return members.find((m) => matches(m, filter)) ?? null;
        },
        async bulkWrite(ops) {
          for (const op of ops) {
            const { filter, update, upsert } = op.updateOne;
            const existing = members.find((m) => matches(m, filter));
            if (existing) {
              Object.assign(existing, update.$set);
            } else if (upsert) {
              members.push({
                _id: new ObjectId(),
                ...update.$setOnInsert,
                ...update.$set,
              });
            }
          }
          return { ok: 1 };
        },
        async deleteOne(filter) {
          const i = members.findIndex((m) => matches(m, filter));
          if (i === -1) return { deletedCount: 0 };
          members.splice(i, 1);
          return { deletedCount: 1 };
        },
      };
    },
  };
}

/** Keycloak double — `realmUsers` is the set of ids that actually exist. */
function makeKeycloak(realmUsers) {
  return {
    async getUser(id) {
      return realmUsers.get(id) ?? null;
    },
  };
}

let app, server, baseUrl, db, currentRoles, realmUsers, lastAudit;

const url = (p) => `${baseUrl}/api/v1/admin${p}`;
const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

before(async () => {
  db = makeDb();
  realmUsers = new Map();
  currentRoles = ['admin'];
  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = {
      sub: 'admin-1',
      preferred_username: 'admin1',
      realm_access: { roles: currentRoles },
    };
    // Mirrors what auditAdminActions persists, so the audit assertions below
    // test the same values that reach the collection.
    res.on('finish', () => {
      lastAudit = {
        action: res.locals.auditAction ?? null,
        resourceId: res.locals.auditResourceId ?? null,
        detail: res.locals.auditDetail ?? null,
      };
    });
    next();
  });
  app.use(
    '/api/v1/admin',
    createStudyMembersRouter({ db, keycloak: makeKeycloak(realmUsers) })
  );
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
  lastAudit = null;
  realmUsers.clear();
  realmUsers.set('r-1', { id: 'r-1', username: 'rita' });
  realmUsers.set('r-2', { id: 'r-2', username: 'raj' });
  realmUsers.set('r-3', { id: 'r-3', username: 'rosa' });
  db.setStudy({
    _id: STUDY_ID,
    name: 'ICU follow-up',
    identity: { mode: 'verified' },
  });
  db.addStudy({
    _id: OTHER_STUDY_ID,
    name: 'Sleep cohort',
    identity: { mode: 'verified' },
  });
});

const addMember = (payload, studyId = STUDY_ID) =>
  fetch(url(`/studies/${studyId}/members`), json('POST', payload));

test('lists members and reports that scoping is enforced on a verified study', async () => {
  const res = await fetch(url(`/studies/${STUDY_ID}/members`));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.enforced, true);
  assert.deepStrictEqual(body.members, []);
  assert.strictEqual(body.total, 0);
});

test('reports scoping as NOT enforced on an anonymous study', async () => {
  // Members can still be added — they simply have no effect yet. Saying so
  // avoids the impression that adding someone silently did nothing.
  db.setStudy({ _id: STUDY_ID, name: 'Open study', identity: null });
  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.enforced, false);
});

test('adds a member and returns them with role and scope', async () => {
  const res = await addMember({
    userId: 'r-1',
    username: 'ignored-label',
    role: 'researcher',
    scope: 'read',
  });
  assert.strictEqual(res.status, 200);

  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.members.length, 1);
  assert.strictEqual(body.members[0].userId, 'r-1');
  assert.strictEqual(body.members[0].scope, 'read');
  assert.strictEqual(body.members[0].createdBy, 'admin-1');
});

test("Keycloak's username wins over the label the caller sent", async () => {
  // The stored username is only ever a display convenience, so it must come
  // from the account itself — a caller-supplied label can disagree with the
  // real account and make two different people look like the same one.
  await addMember({
    userId: 'r-1',
    username: 'not-really-rita',
    role: 'researcher',
    scope: 'read',
  });
  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.members[0].username, 'rita');
});

test('refuses a grant to an id nobody in the realm holds', async () => {
  // A typo'd sub used to be stored happily and then rendered in the table like
  // any other grant, while gating access for nobody.
  const res = await addMember({
    userId: 'r-nonexistent',
    role: 'researcher',
    scope: 'read',
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, 'unknown_user');
  assert.strictEqual(db.members.length, 0);
});

test('re-adding an existing member updates their scope instead of failing on the unique index', async () => {
  await addMember({ userId: 'r-1', role: 'researcher', scope: 'read' });
  const res = await addMember({ userId: 'r-1', role: 'lead', scope: 'export' });
  assert.strictEqual(res.status, 200);

  const body = await (await fetch(url(`/studies/${STUDY_ID}/members`))).json();
  assert.strictEqual(body.members.length, 1, 'must not create a duplicate');
  assert.strictEqual(body.members[0].role, 'lead');
  assert.strictEqual(body.members[0].scope, 'export');
});

test('grants several members in one request', async () => {
  const res = await addMember({
    members: [
      { userId: 'r-1', role: 'researcher', scope: 'read' },
      { userId: 'r-2', role: 'researcher', scope: 'export' },
      { userId: 'r-3', role: 'lead', scope: 'read' },
    ],
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).granted, 3);
  assert.strictEqual(db.members.length, 3);
});

test('one bad id in a batch grants nobody', async () => {
  // Half-applied access changes are worse than none: the admin sees an error
  // and has no way to know which half went through.
  const res = await addMember({
    members: [
      { userId: 'r-1', role: 'researcher', scope: 'read' },
      { userId: 'r-nonexistent', role: 'researcher', scope: 'read' },
      { userId: 'r-2', role: 'researcher', scope: 'read' },
    ],
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.error, 'unknown_user');
  assert.strictEqual(body.index, 1, 'says which entry was the problem');
  assert.strictEqual(db.members.length, 0, 'nothing was written');
});

test('refuses a batch larger than the cap', async () => {
  const members = Array.from({ length: 51 }, () => ({
    userId: 'r-1',
    role: 'researcher',
    scope: 'read',
  }));
  const res = await addMember({ members });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, 'too_many_members');
});

test('pages the member list and reports the true total', async () => {
  for (const userId of ['r-1', 'r-2', 'r-3']) {
    realmUsers.set(userId, { id: userId, username: userId });
    await addMember({ userId, role: 'researcher', scope: 'read' });
  }

  const first = await (
    await fetch(url(`/studies/${STUDY_ID}/members?limit=2`))
  ).json();
  assert.strictEqual(first.members.length, 2);
  assert.strictEqual(first.total, 3, 'total counts beyond the page');

  const second = await (
    await fetch(url(`/studies/${STUDY_ID}/members?limit=2&skip=2`))
  ).json();
  assert.strictEqual(second.members.length, 1);
  assert.strictEqual(second.total, 3);
});

test('clamps an absurd limit rather than serving the whole collection', async () => {
  const body = await (
    await fetch(url(`/studies/${STUDY_ID}/members?limit=100000`))
  ).json();
  assert.strictEqual(body.limit, 200);
});

test('lists every study one researcher can reach, with study names', async () => {
  await addMember({ userId: 'r-1', role: 'researcher', scope: 'read' });
  await addMember(
    { userId: 'r-1', role: 'lead', scope: 'export' },
    OTHER_STUDY_ID
  );
  await addMember({ userId: 'r-2', role: 'researcher', scope: 'read' });

  const res = await fetch(url('/study-memberships?userId=r-1'));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.total, 2);
  assert.deepStrictEqual(body.memberships.map((m) => m.studyName).sort(), [
    'ICU follow-up',
    'Sleep cohort',
  ]);
  assert.ok(
    body.memberships.every((m) => m.userId === 'r-1'),
    'must not leak another researcher’s memberships'
  );
});

test('the per-researcher view needs a userId', async () => {
  const res = await fetch(url('/study-memberships'));
  assert.strictEqual(res.status, 400);
});

test('the audit entry names who was granted what, not just the study', async () => {
  await addMember({ userId: 'r-1', role: 'lead', scope: 'export' });
  assert.strictEqual(lastAudit.action, 'grant_study_membership');
  assert.strictEqual(lastAudit.resourceId, String(STUDY_ID));
  assert.match(lastAudit.detail, /rita/);
  assert.match(lastAudit.detail, /r-1/);
  assert.match(lastAudit.detail, /lead\/export/);
});

test('the audit entry for a revocation describes what was taken away', async () => {
  await addMember({ userId: 'r-1', role: 'lead', scope: 'export' });
  await fetch(url(`/studies/${STUDY_ID}/members/r-1`), { method: 'DELETE' });
  assert.strictEqual(lastAudit.action, 'revoke_study_membership');
  assert.match(lastAudit.detail, /rita/);
  assert.match(lastAudit.detail, /lead\/export/);
});

test('rejects an unknown role and an unknown scope', async () => {
  for (const payload of [
    { userId: 'r-1', role: 'superuser', scope: 'read' },
    { userId: 'r-1', role: 'researcher', scope: 'everything' },
  ]) {
    const res = await addMember(payload);
    assert.strictEqual(res.status, 400);
  }
  assert.strictEqual(db.members.length, 0);
});

test('rejects a missing or blank userId', async () => {
  for (const userId of [undefined, '', '   ']) {
    const res = await addMember({ userId, role: 'researcher', scope: 'read' });
    assert.strictEqual(res.status, 400);
  }
});

test('removes a member', async () => {
  await addMember({ userId: 'r-1', role: 'researcher', scope: 'read' });
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
    ['/study-memberships?userId=r-1', {}],
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

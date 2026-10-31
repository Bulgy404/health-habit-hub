import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createStudyScopeGuard } from '../../middleware/studyScopeGuard.js';
import { ROLES, isPrivileged, isStudyScoped } from '../../middleware/roles.js';
import { listStudies } from '../../services/studyService.js';

// Two anonymous studies and one verified one. The study-researcher is a member
// of OWN (read) and EXPORTABLE (export), not of OTHER or VERIFIED.
const OWN = new ObjectId();
const EXPORTABLE = new ObjectId();
const OTHER = new ObjectId();
const VERIFIED = new ObjectId();
const OWN_GROUP = new ObjectId();
const OTHER_GROUP = new ObjectId();

const studies = [
  { _id: OWN, name: 'Own', groups: [{ id: OWN_GROUP, label: 'A' }] },
  { _id: EXPORTABLE, name: 'Exportable', groups: [] },
  { _id: OTHER, name: 'Other', groups: [{ id: OTHER_GROUP, label: 'B' }] },
  {
    _id: VERIFIED,
    name: 'Verified',
    groups: [],
    identity: { mode: 'verified', subjectCodePrefix: 'TUD-X' },
  },
];
const memberships = [
  { userId: 'partner', studyId: OWN, role: 'researcher', scope: 'read' },
  {
    userId: 'partner',
    studyId: EXPORTABLE,
    role: 'researcher',
    scope: 'export',
  },
];
const OWN_CAMPAIGN = new ObjectId();
const OTHER_CAMPAIGN = new ObjectId();
const campaigns = [
  { _id: OWN_CAMPAIGN, studyId: OWN },
  { _id: OTHER_CAMPAIGN, studyId: OTHER },
];
const enrollments = [
  { userId: 'p-own', studyId: OWN },
  { userId: 'p-other', studyId: OTHER },
  { userId: 'p-verified', studyId: VERIFIED },
];

function same(a, b) {
  return String(a) === String(b);
}

const fakeDb = {
  collection(name) {
    if (name === 'studies') {
      return { findOne: async (f) => studies.find((s) => same(s._id, f._id)) };
    }
    if (name === 'study_memberships') {
      return {
        find: (f) => ({
          toArray: async () => memberships.filter((m) => m.userId === f.userId),
        }),
        findOne: async (f) =>
          memberships.find(
            (m) => m.userId === f.userId && same(m.studyId, f.studyId)
          ) ?? null,
      };
    }
    if (name === 'notification_campaigns') {
      return {
        findOne: async (f) => campaigns.find((c) => same(c._id, f._id)) ?? null,
      };
    }
    if (name === 'enrollments') {
      return {
        countDocuments: async (f) =>
          enrollments.filter(
            (e) => f.userId.$in.includes(e.userId) && same(e.studyId, f.studyId)
          ).length,
        findOne: async (f) =>
          enrollments.find((e) => e.userId === f.userId) ?? null,
      };
    }
    throw new Error(`unexpected collection ${name}`);
  },
};

let server;
let baseUrl;
let caller;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { sub: caller.sub, realm_access: { roles: caller.roles } };
    next();
  });
  app.use('/admin', createStudyScopeGuard({ getDb: async () => fakeDb }));
  // Stands in for every admin route: reports that the guard let it through,
  // and what the study list would be filtered to.
  app.use('/admin', (req, res) =>
    res.json({
      reached: true,
      studyIds: req.studyScope?.studyIds?.map(String) ?? null,
    })
  );
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const asPartner = () => {
  caller = { sub: 'partner', roles: [ROLES.STUDY_RESEARCHER] };
};
const asResearcher = () => {
  caller = { sub: 'staff', roles: [ROLES.RESEARCHER] };
};
const asAdmin = () => {
  caller = { sub: 'boss', roles: [ROLES.ADMIN] };
};

describe('study-researcher', () => {
  test('sees only their member studies in the list', async () => {
    asPartner();
    const r = await call('GET', '/studies');
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.studyIds.sort(),
      [OWN, EXPORTABLE].map(String).sort()
    );
  });

  test('opens and edits a member study', async () => {
    asPartner();
    assert.equal((await call('GET', `/studies/${OWN}`)).status, 200);
    assert.equal(
      (await call('PUT', `/studies/${OWN}`, { name: 'x' })).status,
      200
    );
    for (const path of [
      '/participants',
      '/codes',
      '/analytics',
      '/questionnaire-assignments',
      '/questionnaire-calendar',
    ]) {
      assert.equal(
        (await call('GET', `/studies/${OWN}${path}`)).status,
        200,
        path
      );
    }
    assert.equal(
      (await call('PATCH', `/studies/${OWN}/groups/${OWN_GROUP}/config`, {}))
        .status,
      200
    );
  });

  test('gets 403 on a study they are not a member of, anonymous or not', async () => {
    asPartner();
    for (const id of [OTHER, VERIFIED]) {
      const r = await call('GET', `/studies/${id}/participants`);
      assert.equal(r.status, 403);
      assert.equal(r.body.error, 'not_a_study_member');
    }
  });

  test('needs export scope to export', async () => {
    asPartner();
    const read = await call('GET', `/studies/${OWN}/export/zip`);
    assert.equal(read.status, 403);
    assert.equal(read.body.error, 'export_not_permitted');
    assert.equal(
      (await call('GET', `/studies/${EXPORTABLE}/export`)).status,
      200
    );
    assert.equal(
      (await call('GET', `/studies/${EXPORTABLE}/export/zip`)).status,
      200
    );
  });

  test('cannot make operator decisions on their own study', async () => {
    asPartner();
    for (const [method, path] of [
      ['DELETE', ''],
      ['POST', '/delete'],
      ['PUT', '/default'],
      ['GET', '/members'],
      ['POST', '/members'],
    ]) {
      const r = await call(
        method,
        `/studies/${OWN}${path}`,
        method === 'GET' ? undefined : {}
      );
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.error, 'not_permitted_for_role');
    }
    const identity = await call('PUT', `/studies/${OWN}`, {
      identity: { mode: 'verified' },
    });
    assert.equal(identity.status, 403);
  });

  test('cannot create a study', async () => {
    asPartner();
    assert.equal((await call('POST', '/studies', { name: 'x' })).status, 403);
  });

  test('is refused every admin route outside their studies', async () => {
    asPartner();
    for (const [method, path] of [
      ['GET', '/participants'],
      ['GET', '/cue-pools'],
      ['POST', '/questionnaires'],
      ['GET', '/comments'],
      ['GET', '/insights'],
      ['GET', '/habits/feed'],
      ['GET', '/settings'],
      ['GET', '/team'],
      ['GET', '/audit-log'],
      ['GET', '/backups/status'],
      ['POST', '/notifications/send'],
      ['GET', '/some-route-added-next-year'],
    ]) {
      const r = await call(method, path, method === 'GET' ? undefined : {});
      assert.equal(r.status, 403, `${method} ${path}`);
    }
  });

  test('may read the questionnaire library to assign from it', async () => {
    asPartner();
    assert.equal((await call('GET', '/questionnaires')).status, 200);
  });

  test('lists notification campaigns only for a member study', async () => {
    asPartner();
    assert.equal(
      (await call('GET', `/notifications?studyId=${OWN}`)).status,
      200
    );
    assert.equal(
      (await call('GET', `/notifications?studyId=${OTHER}`)).status,
      403
    );
    assert.equal((await call('GET', '/notifications')).status, 403);
  });

  test('sends a campaign only to people in their own study', async () => {
    asPartner();
    const base = { title: 't', body: 'b' };
    const ok = [
      { studyId: String(OWN), targetType: 'all_enrolled' },
      {
        studyId: String(OWN),
        targetType: 'group',
        targetIds: [String(OWN_GROUP)],
      },
      { studyId: String(OWN), targetType: 'individual', targetIds: ['p-own'] },
    ];
    for (const c of ok) {
      assert.equal(
        (await call('POST', '/notifications', { ...base, ...c })).status,
        200,
        JSON.stringify(c)
      );
    }
    const refused = [
      { targetType: 'all_enrolled' },
      { studyId: String(OTHER), targetType: 'all_enrolled' },
      {
        studyId: String(OWN),
        targetType: 'group',
        targetIds: [String(OTHER_GROUP)],
      },
      {
        studyId: String(OWN),
        targetType: 'individual',
        targetIds: ['p-own', 'p-other'],
      },
      { studyId: String(OWN), targetType: 'group', targetIds: [] },
    ];
    for (const c of refused) {
      assert.equal(
        (await call('POST', '/notifications', { ...base, ...c })).status,
        403,
        JSON.stringify(c)
      );
    }
  });

  test('cancels only campaigns of their own studies', async () => {
    asPartner();
    assert.equal(
      (await call('DELETE', `/notifications/${OWN_CAMPAIGN}`)).status,
      200
    );
    assert.equal(
      (await call('DELETE', `/notifications/${OTHER_CAMPAIGN}`)).status,
      403
    );
  });

  test('opens the detail of participants in their own study only', async () => {
    // The analytics page opens these from a study's participant table.
    asPartner();
    for (const part of ['progress', 'reminder-plans']) {
      assert.equal(
        (await call('GET', `/participants/p-own/${part}`)).status,
        200,
        part
      );
      assert.equal(
        (await call('GET', `/participants/p-other/${part}`)).status,
        403,
        part
      );
    }
    assert.equal(
      (await call('GET', '/participants/nobody/progress')).status,
      403
    );
    assert.equal((await call('GET', '/participants/p-own')).status, 403);
    assert.equal((await call('DELETE', '/participants/p-own')).status, 403);
  });

  test('the narrower role wins on an account that also holds researcher', async () => {
    caller = {
      sub: 'partner',
      roles: [ROLES.RESEARCHER, ROLES.STUDY_RESEARCHER],
    };
    assert.equal((await call('GET', `/studies/${OTHER}`)).status, 403);
    assert.equal((await call('GET', '/participants')).status, 403);
  });
});

describe('full researcher', () => {
  test('keeps access to every anonymous study and every other route', async () => {
    asResearcher();
    assert.equal(
      (await call('GET', `/studies/${OTHER}/participants`)).status,
      200
    );
    assert.equal((await call('GET', '/participants')).status, 200);
    assert.equal((await call('GET', '/cue-pools')).status, 200);
    assert.equal((await call('GET', '/studies')).body.studyIds, null);
  });

  test('needs membership to open a participant of a verified study', async () => {
    asResearcher();
    assert.equal(
      (await call('GET', '/participants/p-verified/progress')).status,
      403
    );
    assert.equal(
      (await call('GET', '/participants/p-other/progress')).status,
      200
    );
    assert.equal(
      (await call('GET', '/participants/nobody/progress')).status,
      200
    );
  });

  test('needs membership on every page of a verified study, not just detail and export', async () => {
    asResearcher();
    for (const path of ['', '/participants', '/codes', '/analytics']) {
      const r = await call('GET', `/studies/${VERIFIED}${path}`);
      assert.equal(r.status, 403, path);
    }
  });
});

describe('admin', () => {
  test('passes everywhere', async () => {
    asAdmin();
    assert.equal((await call('GET', `/studies/${VERIFIED}/codes`)).status, 200);
    assert.equal((await call('DELETE', `/studies/${OWN}`)).status, 200);
    assert.equal((await call('GET', '/team')).status, 200);
    assert.equal((await call('GET', '/studies')).body.studyIds, null);
  });

  test('admin plus study-researcher is still an admin', async () => {
    caller = { sub: 'boss', roles: [ROLES.ADMIN, ROLES.STUDY_RESEARCHER] };
    assert.equal((await call('GET', `/studies/${OTHER}`)).status, 200);
  });
});

describe('role helpers', () => {
  const as = (...roles) => ({ realm_access: { roles } });

  test('isStudyScoped is true for study-researcher unless admin', () => {
    assert.equal(isStudyScoped(as(ROLES.STUDY_RESEARCHER)), true);
    assert.equal(
      isStudyScoped(as(ROLES.STUDY_RESEARCHER, ROLES.RESEARCHER)),
      true
    );
    assert.equal(isStudyScoped(as(ROLES.STUDY_RESEARCHER, ROLES.ADMIN)), false);
    assert.equal(isStudyScoped(as(ROLES.RESEARCHER)), false);
  });

  test('a study-researcher is never privileged', () => {
    // isPrivileged lets a caller read other users' data on routes that are
    // not study-scoped — exactly what this role must not do.
    assert.equal(isPrivileged(as(ROLES.STUDY_RESEARCHER)), false);
    assert.equal(
      isPrivileged(as(ROLES.STUDY_RESEARCHER, ROLES.RESEARCHER)),
      false
    );
    assert.equal(isPrivileged(as(ROLES.RESEARCHER)), true);
    assert.equal(isPrivileged(as(ROLES.ADMIN, ROLES.STUDY_RESEARCHER)), true);
  });
});

describe('listStudies onlyIds', () => {
  test('filters both the page and the total', async () => {
    const all = [{ _id: OWN }, { _id: OTHER }, { _id: VERIFIED }];
    let lastFilter;
    const db = {
      collection(name) {
        if (name === 'studies') {
          return {
            find(filter) {
              lastFilter = filter;
              const ids = filter._id?.$in?.map(String);
              const rows = ids
                ? all.filter((s) => ids.includes(String(s._id)))
                : all;
              return {
                skip() {
                  return this;
                },
                limit() {
                  return this;
                },
                toArray: async () => rows,
              };
            },
            countDocuments: async (filter) => {
              const ids = filter._id?.$in?.map(String);
              return ids ? ids.length : all.length;
            },
          };
        }
        return { aggregate: () => ({ toArray: async () => [] }) };
      },
    };
    const result = await listStudies({ db, onlyIds: [OWN] });
    assert.deepEqual(
      result.studies.map((s) => s.id),
      [String(OWN)]
    );
    assert.equal(result.total, 1);
    assert.ok(lastFilter.deletedAt, 'still hides deleted studies');

    const none = await listStudies({ db, onlyIds: [] });
    assert.equal(none.studies.length, 0);
    assert.equal(none.total, 0);
  });
});

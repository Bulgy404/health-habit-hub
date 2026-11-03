import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { ObjectId } from 'mongodb';
import { createStudyScopeGuard } from '../../middleware/studyScopeGuard.js';
import { createStudiesRouter } from '../../routes/admin/studiesRouter.js';
import { createSurveysRouter } from '../../routes/admin/surveysRouter.js';
import { createCuePoolRouter } from '../../routes/cuePoolRouter.js';
import { createStudyMembersRouter } from '../../routes/admin/studyMembersRouter.js';
import { createParticipantsRouter } from '../../routes/admin/participantsRouter.js';
import { exportStudyData } from '../../services/studyExportService.js';
import { createStudy } from '../../services/studyService.js';
import { redeemCode } from '../../services/studyCodeService.js';
import { pickAssignedCues } from '../../services/cuePoolService.js';

const equal = (a, b) => (a == null ? b == null : String(a) === String(b));
function matches(d, q) {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some((part) => matches(d, part));
    if (v && '$in' in Object(v)) return v.$in.some((x) => equal(d[k], x));
    if (v && '$ne' in Object(v)) return !equal(d[k], v.$ne);
    if (v && '$exists' in Object(v)) return (d[k] !== undefined) === v.$exists;
    return equal(d[k], v);
  });
}
const stores = {};
const db = {
  collection(name) {
    const rows = (stores[name] ??= []);
    return {
      findOne: async (q) => rows.find((d) => matches(d, q)) ?? null,
      find: (q = {}) => {
        let docs = rows.filter((d) => matches(d, q));
        const cursor = {
          sort: () => cursor,
          project: () => cursor,
          skip: (n) => {
            docs = docs.slice(n);
            return cursor;
          },
          limit: (n) => {
            docs = docs.slice(0, n);
            return cursor;
          },
          toArray: async () => docs,
        };
        return cursor;
      },
      countDocuments: async (q) => rows.filter((d) => matches(d, q)).length,
      insertOne: async (d) => {
        d._id ??= new ObjectId();
        rows.push(d);
        return { insertedId: d._id };
      },
      insertMany: async (docs) => {
        for (const d of docs) {
          d._id ??= new ObjectId();
          rows.push(d);
        }
        return { insertedCount: docs.length };
      },
      deleteOne: async (q) => {
        const i = rows.findIndex((d) => matches(d, q));
        if (i >= 0) rows.splice(i, 1);
        return { deletedCount: i >= 0 ? 1 : 0 };
      },
      updateOne: async (q, update) => {
        const d = rows.find((d) => matches(d, q));
        if (d) Object.assign(d, update.$set);
        return { matchedCount: d ? 1 : 0 };
      },
      aggregate: (pipeline) => ({
        toArray: async () => {
          if (pipeline.some((p) => p.$group)) return [];
          return rows
            .filter((d) => matches(d, pipeline[0].$match))
            .slice(0, pipeline[1].$sample.size);
        },
      }),
      bulkWrite: async (ops) => {
        for (const op of ops) {
          const { filter, update } = op.updateOne;
          let d = rows.find((d) => matches(d, filter));
          if (!d) {
            d = { _id: new ObjectId(), ...filter, ...update.$setOnInsert };
            rows.push(d);
          }
          Object.assign(d, update.$set);
        }
      },
    };
  },
};
let server, base, own, other;
async function call(method, path, body, user = 'alice', role = 'researcher') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user': user,
      'x-role': role,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}
before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = {
      sub: req.get('x-user'),
      realm_access: { roles: [req.get('x-role')] },
    };
    next();
  });
  app.use(createStudyScopeGuard({ getDb: async () => db }));
  app.use(createStudiesRouter({ db }));
  app.use(createSurveysRouter({ db, neo4jRun: async () => [] }));
  app.use(createParticipantsRouter({ db, neo4jRun: async () => [] }));
  app.use('/cue-pools', createCuePoolRouter({ db }));
  const keycloak = {
    getUser: async (id) => ({ id, username: id }),
    listUsersByRole: async () => [
      { id: 'bob', username: 'bob', enabled: true },
    ],
  };
  app.use(createStudyMembersRouter({ db, keycloak }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

test('researchers create centrally stored studies with lead/export membership; admin sees all', async () => {
  const a = await call('POST', '/studies', {
    name: 'Alice study',
    groups: [{ label: 'Control' }],
  });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  own = a.body.id;
  const b = await call(
    'POST',
    '/studies',
    { name: 'Other study', groups: [{ label: 'Control' }] },
    'other'
  );
  assert.equal(b.status, 201);
  other = b.body.id;
  const membership = stores.study_memberships.find(
    (m) => String(m.studyId) === own
  );
  assert.equal(membership.role, 'lead');
  assert.equal(membership.scope, 'export');
  assert.equal((await call('GET', '/studies')).body.total, 1);
  assert.equal(
    (await call('GET', '/studies', null, 'operator', 'admin')).body.total,
    2
  );
  assert.equal(
    (await call('PUT', `/studies/${other}`, { name: 'denied' })).status,
    403
  );
});

test('private questionnaires stay study-owned; shared templates are copied before editing', async () => {
  const payload = {
    title: { en: 'Private questions' },
    languages: ['en'],
    questions: [],
  };
  const created = await call('POST', `/questionnaires?studyId=${own}`, payload);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal(
    String(stores.questionnaires.find((q) => String(q._id) === id).studyId),
    own
  );
  assert.equal(
    (await call('GET', `/questionnaires/${id}`, null, 'other')).status,
    403
  );
  assert.equal(
    (await call('PUT', `/questionnaires/${id}`, { title: { en: 'Changed' } }))
      .status,
    200
  );
  assert.equal(
    (await call('GET', '/questionnaires', null, 'operator', 'admin')).body
      .length,
    1
  );
  const shared = {
    _id: new ObjectId(),
    slug: 'shared-template',
    title: { en: 'Template' },
    isLibrary: true,
    languages: ['en'],
    questions: [],
  };
  stores.questionnaires.push(shared);
  assert.equal(
    (
      await call('PUT', `/questionnaires/${shared._id}`, {
        title: { en: 'No' },
      })
    ).status,
    403
  );
  const copy = await call(
    'POST',
    `/questionnaires/${shared._id}/copy?studyId=${own}`,
    {}
  );
  assert.equal(copy.status, 201);
  assert.equal(shared.title.en, 'Template');
  assert.equal(
    (await call('POST', `/questionnaires/${id}/copy?studyId=${other}`, {}))
      .status,
    403
  );
  assert.equal(
    (
      await call(
        'POST',
        `/studies/${other}/questionnaire-assignments`,
        {
          questionnaireId: id,
          cadence: { type: 'once', anchor: 'enrollment', offsetDays: 0 },
        },
        'other'
      )
    ).status,
    400
  );
});

test('cue creation, visibility, assignment sampling and deletion respect study boundaries', async () => {
  const body = {
    text: { en: 'After breakfast' },
    languages: ['en'],
    quality: 'high',
    dimensions: { stability: 3, salience: 3, specificity: 3 },
    domain: 'physical_activity',
  };
  const result = await call('POST', `/cue-pools?studyId=${own}`, body);
  assert.equal(result.status, 201);
  const id = result.body.id;
  assert.equal((await call('GET', '/cue-pools', null, 'other')).body.total, 0);
  assert.equal(
    (await call('GET', '/cue-pools', null, 'operator', 'admin')).body.total,
    1
  );
  assert.equal(
    (await call('DELETE', `/cue-pools/${id}`, null, 'other')).status,
    403
  );
  assert.equal(
    (
      await pickAssignedCues({
        db,
        cueSource: 'high_quality',
        cueCount: 'single',
        studyId: other,
      })
    ).length,
    0
  );
  assert.equal(
    (
      await pickAssignedCues({
        db,
        cueSource: 'high_quality',
        cueCount: 'single',
        studyId: own,
      })
    ).length,
    1
  );
});

test('lead grants existing researcher access; viewing/exporting never grants management or infrastructure', async () => {
  assert.equal(
    (
      await call('POST', `/studies/${own}/members`, {
        userId: 'bob',
        role: 'researcher',
        scope: 'export',
        canManage: false,
      })
    ).status,
    200
  );
  assert.equal((await call('GET', `/studies/${own}`, null, 'bob')).status, 200);
  assert.equal(
    (await call('PUT', `/studies/${own}`, { name: 'denied' }, 'bob')).status,
    403
  );
  assert.equal(
    (
      await call('POST', `/studies/${own}/members`, {
        userId: 'bob',
        role: 'researcher',
        scope: 'export',
        canManage: true,
      })
    ).status,
    200
  );
  assert.equal(
    (await call('PUT', `/studies/${own}`, { name: 'Updated' }, 'bob')).status,
    200
  );
  assert.equal(
    (await call('GET', `/studies/${own}/members`, null, 'bob')).status,
    403
  );
  assert.equal(
    (await call('DELETE', `/studies/${own}/members/alice`)).status,
    403
  );
  for (const path of [
    '/system',
    '/backups/status',
    '/knowledge-base',
    '/team',
    '/settings',
  ])
    assert.equal((await call('GET', path)).status, 403);
  assert.equal(
    (
      await call('POST', '/studies', {
        name: 'No',
        groups: [{ label: 'A' }],
        identity: { mode: 'verified' },
      })
    ).status,
    403
  );
});

test('closing recruitment preserves the study and rejects enrollment without consuming codes', async () => {
  assert.equal(
    (await call('PUT', `/studies/${own}`, { recruitmentOpen: false })).status,
    200
  );
  const study = stores.studies.find((s) => String(s._id) === own);
  assert.equal(study.isActive, true);
  (stores.studyCodes ??= []).push({
    code: 'CLOSED',
    studyId: study._id,
    redemptionCount: 0,
  });
  assert.deepEqual(
    await redeemCode({ db, userId: 'participant', code: 'CLOSED' }),
    { closed: true }
  );
  assert.equal(stores.studyCodes[0].redemptionCount, 0);
});

test('failed creator membership rolls back the new study', async () => {
  const rows = [];
  const failing = {
    collection: (name) =>
      name === 'studies'
        ? {
            insertOne: async (doc) => {
              rows.push(doc);
              return { insertedId: 'created' };
            },
            deleteOne: async () => {
              rows.pop();
            },
          }
        : {
            insertOne: async () => {
              throw new Error('membership failure');
            },
          },
  };
  await assert.rejects(
    createStudy({
      db: failing,
      name: 'Fail',
      groups: [],
      creator: { sub: 'alice' },
    }),
    /membership failure/
  );
  assert.equal(rows.length, 0);
});

test('participant history and researcher exports exclude other studies, including legacy questionnaire responses', async () => {
  const currentResponse = new ObjectId();
  const legacyResponse = new ObjectId();
  const foreignResponse = new ObjectId();
  (stores.enrollments ??= []).push({
    _id: new ObjectId(),
    userId: 'participant',
    studyId: new ObjectId(own),
  });
  (stores.form_responses ??= []).push(
    {
      _id: currentResponse,
      userId: 'participant',
      studyId: new ObjectId(own),
      questionnaireSlug: 'current',
      answers: {},
    },
    {
      _id: legacyResponse,
      userId: 'participant',
      questionnaireSlug: 'legacy-current',
      answers: {},
    },
    {
      _id: foreignResponse,
      userId: 'participant',
      studyId: new ObjectId(other),
      questionnaireSlug: 'private-history',
      answers: {},
    }
  );
  (stores.questionnaire_windows ??= []).push({
    userId: 'participant',
    studyId: new ObjectId(own),
    responseId: legacyResponse,
  });
  const result = await call('GET', '/participants/participant/responses');
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.responses.map((r) => r.questionnaireSlug).sort(),
    ['current', 'legacy-current']
  );
  const strict = await exportStudyData({ db, id: own, strictStudy: true });
  assert.equal(strict.collections.form_responses.length, 2);
  const central = await exportStudyData({ db, id: own });
  assert.equal(central.collections.form_responses.length, 3);
});

test('lead membership requests validate malformed account IDs before resolving them', async () => {
  assert.equal(
    (
      await call('POST', `/studies/${own}/members`, {
        userId: {},
        role: 'researcher',
        scope: 'read',
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call('POST', `/studies/${own}/members`, {
        userId: 'participant',
        role: 'researcher',
        scope: 'read',
      })
    ).status,
    400
  );
});

test('shared cues are visibly read-only for researchers and globally manageable by the operator', async () => {
  const cue = {
    _id: new ObjectId(),
    text: { en: 'Shared cue' },
    quality: 'high',
    studyId: null,
  };
  stores.cue_pools.push(cue);
  const researcher = await call('GET', '/cue-pools');
  assert.equal(
    researcher.body.cues.find((c) => c.id === String(cue._id)).canEdit,
    false
  );
  assert.equal((await call('DELETE', `/cue-pools/${cue._id}`)).status, 403);
  const operator = await call('GET', '/cue-pools', null, 'operator', 'admin');
  assert.equal(
    operator.body.cues.find((c) => c.id === String(cue._id)).canEdit,
    true
  );
});

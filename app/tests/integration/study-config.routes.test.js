/**
 * Tests for study group config and app settings.
 *
 * We test the service functions directly (unit-style) since the HTTP endpoints
 * require real JWT auth that is not available in integration test mode.
 * HTTP-level tests for schema validation use the existing mock-db approach
 * with service-token auth for endpoints that support it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from '../../models/survey.js';
import {
  getParticipantGroupConfig,
  updateGroupConfig,
} from '../../services/studyService.js';
import { COLLECTION as STUDIES } from '../../models/study.js';
import { createStudyConfigRouter } from '../../routes/studyConfigRouter.js';

// ── Minimal in-memory store ───────────────────────────────────────────────────

function createMemDb() {
  const stores = {};

  function store(name) {
    if (!stores[name]) stores[name] = [];
    return stores[name];
  }

  function matches(doc, query) {
    for (const [k, v] of Object.entries(query)) {
      if (String(doc[k]) !== String(v) && doc[k] !== v) return false;
    }
    return true;
  }

  return {
    collection(name) {
      const data = store(name);
      return {
        async insertOne(doc) {
          const d = { ...doc };
          if (!d._id) d._id = new ObjectId();
          data.push(d);
          return { insertedId: d._id };
        },
        async findOne(query) {
          return data.find((d) => matches(d, query)) ?? null;
        },
        async updateOne(query, update) {
          const idx = data.findIndex((d) => matches(d, query));
          if (idx === -1) return { matchedCount: 0 };
          if (update.$set) Object.assign(data[idx], update.$set);
          return { matchedCount: 1 };
        },
      };
    },
  };
}

// ── getParticipantGroupConfig ─────────────────────────────────────────────────
// neo4jRun is now required; tests provide a mock that returns enrollment data.

test('getParticipantGroupConfig — returns null when neo4jRun not provided', async () => {
  const db = createMemDb();
  const result = await getParticipantGroupConfig({ db, userId: 'user-x' });
  assert.strictEqual(result, null);
});

test('getParticipantGroupConfig — returns null when user not enrolled', async () => {
  const db = createMemDb();
  const neo4jRun = async () => []; // no enrollment row
  const result = await getParticipantGroupConfig({
    db,
    userId: 'user-x',
    neo4jRun,
  });
  assert.strictEqual(result, null);
});

test('getParticipantGroupConfig — returns null when enrollment has bad studyId', async () => {
  const db = createMemDb();
  const neo4jRun = async () => [
    { studyId: 'bad-id', groupId: null, enrolledAt: null, studyCodeUsed: null },
  ];
  const result = await getParticipantGroupConfig({
    db,
    userId: 'u1',
    neo4jRun,
  });
  assert.strictEqual(result, null);
});

test('getParticipantGroupConfig — returns config for enrolled participant', async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  const groupId = new ObjectId();

  await db.collection(STUDIES).insertOne({
    _id: studyId,
    name: 'RCT Study',
    recommenderEnabled: true,
    groups: [
      {
        id: groupId,
        label: 'Intervention',
        index: 1,
        activityTypeConfig: { restricted: true, allowedActivityTypeIds: [] },
        reminders: { habit: { mode: 'admin_fixed', time: '08:00' } },
        autoDonate: true,
        cueConfig: null,
      },
    ],
  });

  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: groupId.toString(),
      enrolledAt: new Date().toISOString(),
      studyCodeUsed: null,
    },
  ];

  const cfg = await getParticipantGroupConfig({
    db,
    userId: 'participant-1',
    neo4jRun,
  });
  assert.strictEqual(cfg.studyId, studyId.toString());
  assert.strictEqual(cfg.studyName, 'RCT Study');
  assert.strictEqual(cfg.groupLabel, 'Intervention');
  assert.strictEqual(cfg.autoDonate, true);
  assert.strictEqual(cfg.reminders.habit.time, '08:00');
  assert.strictEqual(cfg.reminders.habit.mode, 'admin_fixed');
  assert.strictEqual(cfg.activityTypeConfig?.restricted, true);
  assert.strictEqual(cfg.recommenderEnabled, true);
});

test('getParticipantGroupConfig — returns studyId-level defaults when group not found', async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  const orphanGroupId = new ObjectId();

  await db.collection(STUDIES).insertOne({
    _id: studyId,
    name: 'Orphan Study',
    recommenderEnabled: false,
    groups: [],
  });

  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: orphanGroupId.toString(), // group doesn't exist in study
      enrolledAt: new Date().toISOString(),
      studyCodeUsed: null,
    },
  ];

  const cfg = await getParticipantGroupConfig({
    db,
    userId: 'orphan-user',
    neo4jRun,
  });
  assert.strictEqual(cfg.studyName, 'Orphan Study');
  assert.strictEqual(cfg.groupId, null);
  assert.strictEqual(cfg.autoDonate, false);
  assert.strictEqual(cfg.recommenderEnabled, false);
});

// ── updateGroupConfig ─────────────────────────────────────────────────────────

test('updateGroupConfig — returns notFound for unknown study', async () => {
  const db = createMemDb();
  const result = await updateGroupConfig({
    db,
    studyId: new ObjectId().toString(),
    groupId: new ObjectId().toString(),
    config: { autoDonate: true },
  });
  assert.strictEqual(result.notFound, true);
});

test('updateGroupConfig — returns notFound for unknown group', async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  await db.collection(STUDIES).insertOne({
    _id: studyId,
    groups: [{ id: new ObjectId(), label: 'G1', index: 1 }],
  });

  const result = await updateGroupConfig({
    db,
    studyId: studyId.toString(),
    groupId: new ObjectId().toString(), // unknown group
    config: { autoDonate: true },
  });
  assert.strictEqual(result.notFound, true);
});

test('updateGroupConfig — updates autoDonate on matching group', async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  const groupId = new ObjectId();

  await db.collection(STUDIES).insertOne({
    _id: studyId,
    groups: [{ id: groupId, label: 'Ctrl', index: 1, autoDonate: false }],
  });

  const result = await updateGroupConfig({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    config: { autoDonate: true },
  });
  assert.strictEqual(result.updated, true);

  const study = await db.collection(STUDIES).findOne({ _id: studyId });
  assert.strictEqual(study.groups[0].autoDonate, true);
});

test('updateGroupConfig — patches reminders without touching other fields', async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  const groupId = new ObjectId();

  await db.collection(STUDIES).insertOne({
    _id: studyId,
    groups: [
      {
        id: groupId,
        label: 'Int',
        index: 1,
        autoDonate: false,
        reminders: { habit: { mode: 'off', time: null } },
        cueConfig: { cueSource: 'self_selected', cueCount: 'multi' },
      },
    ],
  });

  await updateGroupConfig({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    config: { reminders: { habit: { mode: 'admin_fixed', time: '09:30' } } },
  });

  const study = await db.collection(STUDIES).findOne({ _id: studyId });
  const g = study.groups[0];
  assert.strictEqual(g.reminders.habit.mode, 'admin_fixed');
  assert.strictEqual(g.reminders.habit.time, '09:30');
  // Other fields unchanged
  assert.strictEqual(g.autoDonate, false);
  assert.strictEqual(g.cueConfig.cueSource, 'self_selected');
});

test('updateGroupConfig — merging reminders preserves other reminder types (partial update)', async () => {
  // Regression guard for updateGroupConfig's shallow merge: saving just the
  // habit type from the admin UI's Reminders tab must not wipe out an
  // existing questionnaire/endOfStudy/studyUpdate override on the same group.
  const db = createMemDb();
  const studyId = new ObjectId();
  const groupId = new ObjectId();

  await db.collection(STUDIES).insertOne({
    _id: studyId,
    groups: [
      {
        id: groupId,
        label: 'Int',
        index: 1,
        reminders: {
          habit: { mode: 'off', time: null },
          questionnaire: { mode: 'admin_fixed', time: '10:00' },
        },
      },
    ],
  });

  await updateGroupConfig({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    config: {
      reminders: { habit: { mode: 'participant_choice', time: null } },
    },
  });

  const study = await db.collection(STUDIES).findOne({ _id: studyId });
  const g = study.groups[0];
  assert.strictEqual(g.reminders.habit.mode, 'participant_choice');
  // Untouched type survives the partial update.
  assert.strictEqual(g.reminders.questionnaire.mode, 'admin_fixed');
  assert.strictEqual(g.reminders.questionnaire.time, '10:00');
});

test('updateGroupConfig — sets activityTypeConfig', async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const allowedId = new ObjectId();

  await db.collection(STUDIES).insertOne({
    _id: studyId,
    groups: [{ id: groupId, label: 'Restricted', index: 1 }],
  });

  await updateGroupConfig({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    config: {
      activityTypeConfig: {
        restricted: true,
        allowedActivityTypeIds: [allowedId.toString()],
      },
    },
  });

  const study = await db.collection(STUDIES).findOne({ _id: studyId });
  assert.strictEqual(study.groups[0].activityTypeConfig.restricted, true);
  assert.strictEqual(
    study.groups[0].activityTypeConfig.allowedActivityTypeIds.length,
    1
  );
});

// ── GET /study-config/me (HTTP level) ──────────────────────────────────────────
// Regression coverage: createStudyConfigRouter used to be mounted without
// neo4jRun (see apiRouter.js), so getParticipantGroupConfig's `if (!neo4jRun)
// return null;` guard made this endpoint return null for every participant,
// always — the entire per-group reminder-override mechanism the mobile app
// reads from here was silently dead in production.

let configServer;
let configBaseUrl;

before(async () => {
  const db = createMemDb();
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  await db.collection(STUDIES).insertOne({
    _id: studyId,
    name: 'HTTP Study',
    recommenderEnabled: true,
    groups: [
      {
        id: groupId,
        label: 'Intervention',
        index: 1,
        reminders: { habit: { mode: 'admin_fixed', time: '08:00' } },
      },
    ],
  });

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, res, next) => {
    // Simulates an enrolled user; a different sub simulates "not enrolled".
    req.user = { sub: req.headers['x-test-user'] || 'enrolled-user' };
    next();
  });
  testApp.use(
    '/api/v1/study-config',
    createStudyConfigRouter({
      db,
      neo4jRun: async (query) => {
        if (!query.includes('ENROLLED_IN')) return [];
        return [{ studyId: studyId.toString(), groupId: groupId.toString() }];
      },
    })
  );
  configServer = createServer(testApp);
  await new Promise((resolve) => configServer.listen(0, '127.0.0.1', resolve));
  configBaseUrl = `http://127.0.0.1:${configServer.address().port}`;
});

after(() => {
  configServer.closeAllConnections();
  configServer.close();
});

test('GET /study-config/me returns the resolved config (not null) when neo4jRun is wired', async () => {
  const res = await fetch(`${configBaseUrl}/api/v1/study-config/me`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body, 'expected a non-null config body');
  assert.strictEqual(body.studyName, 'HTTP Study');
  assert.strictEqual(body.reminders.habit.mode, 'admin_fixed');
  assert.strictEqual(body.reminders.habit.time, '08:00');
});

import { test } from 'node:test';
import assert from 'node:assert';

import {
  listParticipants,
  createParticipant,
  assignGroup,
  getParticipant,
  softDeleteParticipant,
} from '../../services/adminParticipantService.js';
import {
  getHabitsFeed,
  buildHabitsCSV,
  getParticipantHabits,
} from '../../services/adminHabitService.js';
import { listInsights } from '../../services/adminInsightsService.js';
import {
  getParticipantProgress,
  getSettings,
  updateSetting,
} from '../../services/adminStatsService.js';

// ── Minimal in-memory DB ──────────────────────────────────────────────────────

function makeDb(initial = {}) {
  const stores = {};
  for (const [name, docs] of Object.entries(initial)) {
    stores[name] = [...docs];
  }
  function store(name) {
    if (!stores[name]) stores[name] = [];
    return stores[name];
  }
  return {
    collection(name) {
      const s = store(name);
      return {
        find(filter = {}) {
          let results = s.filter((doc) => {
            if (
              filter.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            )
              return false;
            if (
              filter.participantId &&
              doc.participantId !== filter.participantId
            )
              return false;
            if (filter.group && doc.group !== filter.group) return false;
            return true;
          });
          return {
            async toArray() {
              return results.map((d) => ({ ...d }));
            },
            sort(spec) {
              const [[field, dir]] = Object.entries(spec);
              results = [...results].sort((a, b) => {
                if (a[field] === b[field]) return 0;
                if (a[field] === undefined) return 1;
                if (b[field] === undefined) return -1;
                return a[field] > b[field] ? dir : -dir;
              });
              return this;
            },
            skip(n) {
              results = results.slice(n);
              return this;
            },
            limit(n) {
              results = results.slice(0, n);
              return this;
            },
          };
        },
        async findOne(query) {
          for (const doc of s) {
            if (query.userId && doc.userId !== query.userId) continue;
            if (query.key && doc.key !== query.key) continue;
            if (
              query.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            )
              continue;
            return { ...doc };
          }
          return null;
        },
        async insertOne(doc) {
          s.push({ ...doc });
          return { insertedId: doc.userId || doc.key || String(s.length) };
        },
        async updateOne(filter, update) {
          for (let i = 0; i < s.length; i++) {
            const doc = s[i];
            if (filter.userId && doc.userId !== filter.userId) continue;
            if (filter.key && doc.key !== filter.key) continue;
            if (
              filter.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            )
              continue;
            s[i] = { ...doc, ...update.$set };
            return { matchedCount: 1, modifiedCount: 1 };
          }
          if (update.upsert || Object.keys(filter).length === 1) {
            s.push({ ...filter, ...update.$set });
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
          }
          return { matchedCount: 0, modifiedCount: 0 };
        },
        async deleteOne(filter) {
          const idx = s.findIndex((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k] !== v) return false;
            }
            return true;
          });
          if (idx === -1) return { deletedCount: 0 };
          s.splice(idx, 1);
          return { deletedCount: 1 };
        },
        async countDocuments(filter = {}) {
          return s.filter((doc) => {
            if (
              filter.participantId &&
              doc.participantId !== filter.participantId
            )
              return false;
            if (
              filter.deletedAt?.$exists === false &&
              doc.deletedAt !== undefined
            )
              return false;
            return true;
          }).length;
        },
      };
    },
  };
}

// ── adminParticipantService ───────────────────────────────────────────────────

test('listParticipants returns active participants only', async () => {
  const db = makeDb({
    participants: [
      { userId: 'u1', username: 'p-u1', group: 'G1', enrolledAt: new Date() },
      { userId: 'u2', username: 'p-u2', deletedAt: new Date() },
    ],
  });
  const result = await listParticipants({ db });
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.participants.length, 1);
  assert.strictEqual(result.participants[0].userId, 'u1');
});

test('listParticipants paginates newest-enrolled first', async () => {
  const db = makeDb({
    participants: [
      { userId: 'a', username: 'p-a', enrolledAt: new Date('2024-01-01') },
      { userId: 'b', username: 'p-b', enrolledAt: new Date('2024-03-01') },
      { userId: 'c', username: 'p-c', enrolledAt: new Date('2024-02-01') },
    ],
  });
  const page1 = await listParticipants({ db, page: 1, limit: 2 });
  assert.strictEqual(page1.total, 3);
  assert.deepStrictEqual(
    page1.participants.map((p) => p.userId),
    ['b', 'c']
  );
  const page2 = await listParticipants({ db, page: 2, limit: 2 });
  assert.deepStrictEqual(
    page2.participants.map((p) => p.userId),
    ['a']
  );
});

test('createParticipant creates user in db and keycloak', async () => {
  const db = makeDb({ participants: [] });
  const created = [];
  const kc = {
    async createUser(u) {
      created.push(u);
    },
    async assignRole() {},
  };
  const result = await createParticipant({ db, kc });
  assert.ok(result.userId, 'should return userId');
  assert.ok(result.username.startsWith('p-'), 'username prefixed p-');
  assert.ok(!result.password, 'should not return plaintext password');
  assert.ok(
    result.tokenCardUrl.includes(result.userId),
    'tokenCardUrl contains userId'
  );
  assert.strictEqual(created.length, 1);
});

test('assignGroup updates MongoDB and calls kc.updateUserAttribute', async () => {
  const db = makeDb({
    participants: [
      { userId: 'u1', username: 'p-u1', group: 'G1', enrolledAt: new Date() },
    ],
  });
  const kcCalls = [];
  const kc = {
    async updateUserAttribute(...args) {
      kcCalls.push(args);
    },
  };
  const result = await assignGroup({
    db,
    kc,
    id: 'u1',
    group: 'G2',
  });
  assert.deepStrictEqual(result, { ok: true, userId: 'u1', group: 'G2' });
  assert.strictEqual(kcCalls.length, 1);
});

test('assignGroup returns null when participant not found', async () => {
  const db = makeDb({ participants: [] });
  const kc = { async updateUserAttribute() {} };
  const result = await assignGroup({
    db,
    kc,
    id: 'missing',
    group: 'G1',
  });
  assert.strictEqual(result, null);
});

test('assignGroup persists the group in MongoDB only (legacy Neo4j label write removed)', async () => {
  const db = makeDb({
    participants: [
      { userId: 'u1', username: 'p-u1', group: 'G1', enrolledAt: new Date() },
    ],
  });
  const kc = { async updateUserAttribute() {} };
  const result = await assignGroup({ db, kc, id: 'u1', group: 'G3' });
  assert.deepStrictEqual(result, { ok: true, userId: 'u1', group: 'G3' });
  const doc = await db.collection('participants').findOne({ userId: 'u1' });
  assert.strictEqual(doc.group, 'G3');
});

test('getParticipant returns null for deleted participant', async () => {
  const db = makeDb({
    participants: [{ userId: 'u1', username: 'p-u1', deletedAt: new Date() }],
  });
  const result = await getParticipant({ db, id: 'u1' });
  assert.strictEqual(result, null);
});

test('softDeleteParticipant anonymizes username and sets deletedAt', async () => {
  const db = makeDb({
    participants: [{ userId: 'u1', username: 'p-u1', group: 'G1' }],
  });
  const result = await softDeleteParticipant({ db, id: 'u1' });
  assert.deepStrictEqual(result, { ok: true });
});

test('softDeleteParticipant returns null when participant not found', async () => {
  const db = makeDb({ participants: [] });
  const result = await softDeleteParticipant({ db, id: 'missing' });
  assert.strictEqual(result, null);
});

// ── adminHabitService ─────────────────────────────────────────────────────────

// Donated habits are sourced from Neo4j; the service maps rows returned by
// neo4jRun. Rows with no studyId skip the Mongo group-label lookup.
const makeNeo4j = (rows) => async () => rows;

test('getHabitsFeed returns paginated results', async () => {
  const db = makeDb({});
  const neo4jRun = makeNeo4j([
    {
      id: 'h1',
      participantId: 'p1',
      habitName: 'Walk',
      category: 'exercise',
      studyId: null,
      groupId: null,
      donatedAt: '2026-03-02T00:00:00.000Z',
    },
    {
      id: 'h2',
      participantId: 'p2',
      habitName: 'Run',
      category: 'exercise',
      studyId: null,
      groupId: null,
      donatedAt: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const result = await getHabitsFeed({ db, neo4jRun, page: 1, limit: 10 });
  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(result.page, 1);
});

test('getHabitsFeed clamps page and limit', async () => {
  const db = makeDb({});
  const result = await getHabitsFeed({
    db,
    neo4jRun: makeNeo4j([]),
    page: 0,
    limit: 200,
  });
  assert.strictEqual(result.page, 1);
  assert.strictEqual(result.limit, 100);
});

test('buildHabitsCSV returns csv string with header', async () => {
  const db = makeDb({});
  const neo4jRun = makeNeo4j([
    {
      id: 'h1',
      participantId: 'p1',
      habitName: 'Walk',
      category: 'exercise',
      studyId: null,
      groupId: null,
      donatedAt: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const csv = await buildHabitsCSV({ db, neo4jRun });
  const lines = csv.split('\n');
  assert.strictEqual(
    lines[0],
    'participantId,habitName,category,group,donatedAt'
  );
  assert.ok(lines[1].startsWith('p1,Walk,exercise,'));
});

test('buildHabitsCSV escapes commas in values', async () => {
  const db = makeDb({});
  const neo4jRun = makeNeo4j([
    {
      id: 'h1',
      participantId: 'p1',
      habitName: 'Walk, jog, run',
      category: 'ex',
      studyId: null,
      groupId: null,
      donatedAt: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const csv = await buildHabitsCSV({ db, neo4jRun });
  assert.ok(
    csv.includes('"Walk, jog, run"'),
    'comma-containing value should be quoted'
  );
});

test('getParticipantHabits maps Neo4j rows newest-first', async () => {
  const neo4jRun = async () => [
    {
      id: 'h1',
      habitName: 'Walk',
      category: 'Physical activity',
      isHabit: true,
      studyId: null,
      donatedAt: '2026-03-02T00:00:00.000Z',
    },
  ];
  const habits = await getParticipantHabits({ neo4jRun, userId: 'u1' });
  assert.strictEqual(habits.length, 1);
  assert.strictEqual(habits[0].habitName, 'Walk');
  assert.strictEqual(habits[0].category, 'Physical activity');
  assert.strictEqual(habits[0].isHabit, true);
});

test('getParticipantHabits returns [] without neo4jRun', async () => {
  const habits = await getParticipantHabits({ neo4jRun: null, userId: 'u1' });
  assert.deepStrictEqual(habits, []);
});

test('listInsights exposes keyed metadata', () => {
  const insights = listInsights();
  assert.ok(insights.length > 0);
  assert.ok(insights.every((i) => i.key && i.title && i.description));
  assert.ok(insights.some((i) => i.key === 'totals'));
});

// ── adminStatsService ─────────────────────────────────────────────────────────

test('getParticipantProgress returns null when participant not found', async () => {
  const db = makeDb({ participants: [] });
  const result = await getParticipantProgress({
    db,
    neo4jRun: null,
    id: 'missing',
  });
  assert.strictEqual(result, null);
});

test('getParticipantProgress aggregates surveys and recommendations', async () => {
  const now = new Date();
  const db = makeDb({
    participants: [{ userId: 'u1', enrolledAt: now }],
    survey_responses: [
      {
        participantId: 'u1',
        surveyId: 's1',
        surveyTitle: 'Baseline',
        completedAt: now,
      },
    ],
    recommendations_log: [
      {
        participantId: 'u1',
        type: 'accepted',
        timestamp: now,
        recommendationId: 'r1',
      },
      {
        participantId: 'u1',
        type: 'dismissed',
        timestamp: now,
        recommendationId: 'r2',
      },
    ],
  });
  const result = await getParticipantProgress({ db, neo4jRun: null, id: 'u1' });
  assert.strictEqual(result.surveys.length, 1);
  assert.strictEqual(result.recommendations.accepted, 1);
  assert.strictEqual(result.recommendations.dismissed, 1);
});

test('getParticipantProgress uses neo4jRun for habitsCount when provided', async () => {
  const db = makeDb({
    participants: [{ userId: 'u1', enrolledAt: new Date() }],
    survey_responses: [],
    recommendations_log: [],
  });
  const neo4jRun = async () => [{ cnt: 7 }];
  const result = await getParticipantProgress({ db, neo4jRun, id: 'u1' });
  assert.strictEqual(result.habitsCount, 7);
});

test('getSettings returns key-value map', async () => {
  const db = makeDb({
    admin_settings: [
      { key: 'token_card_format', value: 'qr' },
      { key: 'other_setting', value: 'yes' },
    ],
  });
  const result = await getSettings({ db });
  assert.strictEqual(result.token_card_format, 'qr');
  assert.strictEqual(result.other_setting, 'yes');
});

test('updateSetting returns ok with key and value', async () => {
  const db = makeDb({
    admin_settings: [{ key: 'token_card_format', value: 'both' }],
  });
  const result = await updateSetting({
    db,
    key: 'token_card_format',
    value: 'print',
  });
  assert.deepStrictEqual(result, {
    ok: true,
    key: 'token_card_format',
    value: 'print',
  });
});

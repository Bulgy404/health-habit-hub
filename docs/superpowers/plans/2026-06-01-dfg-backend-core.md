# DFG Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the MongoDB models, services, and API routes for the DFG study's Implementation Intention module, SRHI measurement system, cue pool management, research data export, and researcher notification campaigns.

**Architecture:** Extends the existing Node.js/Express backend with five new MongoDB collections (`implementation_intentions`, `daily_behavior_logs`, `srhi_responses`, `cue_pools`, `notification_campaigns`). Each new subsystem follows the established pattern: model file → service file → router file → unit test → integration test. The resolved cue config endpoint (`GET /api/v1/me/habit-config`) decouples the Flutter app from study enrollment details.

**Tech Stack:** Node.js 20 + Express (ESM), MongoDB driver, `node:test` + `node:assert` for tests, Firebase Admin SDK for push notifications, `csv-stringify` for export.

**Spec reference:** `docs/superpowers/specs/2026-06-01-dfg-study-integration-design.md`

---

## File Map

**Create:**
- `app/utils/srhi.js` — SRHI item definitions + behavior options constants
- `app/models/implementationIntention.js` — collection schema + indexes
- `app/models/dailyBehaviorLog.js` — collection schema + index
- `app/models/srhiResponse.js` — collection schema + index
- `app/models/cuePool.js` — collection schema + index
- `app/models/notificationCampaign.js` — collection schema
- `app/services/habitConfigService.js` — resolve cue config from enrollment
- `app/services/intentionService.js` — intention CRUD + maxHabits enforcement
- `app/services/dailyLogService.js` — idempotent log upsert + history query
- `app/services/srhiService.js` — window generation, due query, submit + score
- `app/services/cuePoolService.js` — cue pool CRUD
- `app/services/exportService.js` — CSV generation for H1/H2a/H2b
- `app/services/notificationCampaignService.js` — campaign CRUD + FCM dispatch
- `app/routes/intentionsRouter.js` — `/api/v1/habits/intentions` + `/logs`
- `app/routes/srhiRouter.js` — `/api/v1/srhi`
- `app/routes/habitConfigRouter.js` — `/api/v1/me/habit-config`
- `app/routes/cuePoolRouter.js` — `/api/v1/admin/cue-pools`
- `app/routes/studyExportRouter.js` — `/api/v1/admin/studies/:id/export`
- `app/routes/notificationCampaignRouter.js` — `/api/v1/admin/notifications`
- `app/tests/unit/habitConfigService.test.js`
- `app/tests/unit/intentionService.test.js`
- `app/tests/unit/dailyLogService.test.js`
- `app/tests/unit/srhiService.test.js`
- `app/tests/unit/exportService.test.js`
- `app/tests/unit/cuePoolService.test.js`
- `app/tests/integration/intentions.routes.test.js`
- `app/tests/integration/srhi.routes.test.js`

**Modify:**
- `app/models/enrollment.js` — add `lastActiveAt`, `droppedOutAt`, `reactivations` fields to validator
- `app/models/study.js` — add `cueConfig` to groups array schema
- `app/services/studyService.js` — pass `cueConfig` through in `createStudy` / `updateStudy`
- `app/routes/v1Router.js` — register five new routers
- `scripts/seed-local.js` — add `seedTestParticipant()` for 7 test users with fake data

---

## Task 1: SRHI Constants and Behavior Options

**Files:**
- Create: `app/utils/srhi.js`

- [ ] **Step 1: Create the constants file**

```js
// app/utils/srhi.js
export const SRHI_ITEMS = [
  { id: 'srhi_1',  en: 'I do frequently',                                           de: 'das ich häufig tue' },
  { id: 'srhi_2',  en: 'I do automatically',                                        de: 'das ich automatisch tue' },
  { id: 'srhi_3',  en: 'I do without having to consciously remember',               de: 'das ich tue, ohne mich bewusst erinnern zu müssen' },
  { id: 'srhi_4',  en: 'that makes me feel weird if I do not do it',                de: 'bei dem ich mich komisch fühle, wenn ich es nicht tue' },
  { id: 'srhi_5',  en: 'I do without thinking',                                     de: 'das ich tue, ohne darüber nachzudenken' },
  { id: 'srhi_6',  en: 'that would require effort not to do it',                    de: 'das mich Anstrengung kosten würde, es nicht zu tun' },
  { id: 'srhi_7',  en: 'that belongs to my daily, weekly, or monthly routine',      de: 'das zu meiner täglichen, wöchentlichen oder monatlichen Routine gehört' },
  { id: 'srhi_8',  en: "I start doing before I realize I'm doing it",               de: 'mit dem ich anfange, ohne zu bemerken, dass ich es tue' },
  { id: 'srhi_9',  en: 'I would find hard not to do',                               de: 'das mir schwerfallen würde, es nicht zu tun' },
  { id: 'srhi_10', en: 'I have no need to think about doing',                       de: 'worüber ich nicht nachdenken muss, um es zu tun' },
  { id: 'srhi_11', en: "that's typically \"me\"",                                   de: 'das typisch für mich ist' },
  { id: 'srhi_12', en: 'I have been doing for a long time',                         de: 'das ich schon seit langer Zeit mache' },
];

export const SRHI_ITEM_IDS = SRHI_ITEMS.map((i) => i.id);

export const BEHAVIOR_OPTIONS = [
  { key: 'walking',                 en: 'Walking',                  de: 'Spazieren gehen' },
  { key: 'light_jogging',           en: 'Light jogging',            de: 'Leichtes Joggen' },
  { key: 'cycling',                 en: 'Cycling',                  de: 'Radfahren' },
  { key: 'structured_calisthenics', en: 'Structured calisthenics',  de: 'Kalisteniktraining' },
  { key: 'yoga',                    en: 'Yoga',                     de: 'Yoga' },
];

export const DEFAULT_BEHAVIOR_KEYS = BEHAVIOR_OPTIONS.map((b) => b.key);

export const CUE_SOURCES = /** @type {const} */ (['low_quality', 'high_quality', 'self_selected']);
export const CUE_COUNTS  = /** @type {const} */ (['single', 'multi']);
```

- [ ] **Step 2: Verify the file loads without error**

```bash
cd app && node -e "import('./utils/srhi.js').then(m => console.log('items:', m.SRHI_ITEMS.length, 'behaviors:', m.BEHAVIOR_OPTIONS.length))"
```
Expected output: `items: 12 behaviors: 5`

- [ ] **Step 3: Commit**

```bash
git add app/utils/srhi.js
git commit -m "feat: add SRHI item definitions and behavior options constants"
```

---

## Task 2: MongoDB Model Files

**Files:**
- Create: `app/models/implementationIntention.js`
- Create: `app/models/dailyBehaviorLog.js`
- Create: `app/models/srhiResponse.js`
- Create: `app/models/cuePool.js`
- Create: `app/models/notificationCampaign.js`

- [ ] **Step 1: Create `app/models/implementationIntention.js`**

```js
// app/models/implementationIntention.js
export const COLLECTION = 'implementation_intentions';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'behaviorKey', 'behaviorLabel', 'durationMinutes', 'cues', 'intentionStatement', 'status', 'createdAt', 'updatedAt'],
    properties: {
      _id:                { bsonType: 'objectId' },
      userId:             { bsonType: 'string' },
      enrollmentId:       { bsonType: ['objectId', 'null'] },
      studyId:            { bsonType: ['objectId', 'null'] },
      groupId:            { bsonType: ['objectId', 'null'] },
      behaviorKey:        { bsonType: 'string' },
      behaviorLabel:      { bsonType: 'string' },
      durationMinutes:    { bsonType: 'int' },
      cues: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 2,
        items: {
          bsonType: 'object',
          required: ['text', 'source'],
          properties: {
            text:   { bsonType: 'string' },
            cueId:  { bsonType: ['objectId', 'null'] },
            source: { bsonType: 'string', enum: ['pre_rated', 'self_selected'] },
          },
        },
      },
      intentionStatement: { bsonType: 'string' },
      status:             { bsonType: 'string', enum: ['active', 'paused', 'completed', 'abandoned'] },
      createdAt:          { bsonType: 'date' },
      updatedAt:          { bsonType: 'date' },
    },
  },
};

/** @param {import('mongodb').Db} db */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex({ userId: 1, status: 1 }, { name: 'intentions_userId_status' });
  await col.createIndex({ enrollmentId: 1 },       { name: 'intentions_enrollmentId', sparse: true });
}
```

- [ ] **Step 2: Create `app/models/dailyBehaviorLog.js`**

```js
// app/models/dailyBehaviorLog.js
export const COLLECTION = 'daily_behavior_logs';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['intentionId', 'userId', 'date', 'enacted', 'loggedAt'],
    properties: {
      _id:         { bsonType: 'objectId' },
      intentionId: { bsonType: 'objectId' },
      userId:      { bsonType: 'string' },
      date:        { bsonType: 'string' },   // "YYYY-MM-DD"
      enacted:     { bsonType: 'bool' },
      loggedAt:    { bsonType: 'date' },
    },
  },
};

/** @param {import('mongodb').Db} db */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { intentionId: 1, date: 1 },
    { unique: true, name: 'daily_logs_intentionId_date_unique' }
  );
  await col.createIndex({ userId: 1, date: 1 }, { name: 'daily_logs_userId_date' });
}
```

- [ ] **Step 3: Create `app/models/srhiResponse.js`**

```js
// app/models/srhiResponse.js
export const COLLECTION = 'srhi_responses';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['intentionId', 'userId', 'weekNumber', 'scheduledFor', 'createdAt'],
    properties: {
      _id:          { bsonType: 'objectId' },
      intentionId:  { bsonType: 'objectId' },
      userId:       { bsonType: 'string' },
      studyId:      { bsonType: ['objectId', 'null'] },
      groupId:      { bsonType: ['objectId', 'null'] },
      weekNumber:   { bsonType: 'int', minimum: 1 },
      scheduledFor: { bsonType: 'date' },
      submittedAt:  { bsonType: ['date', 'null'] },
      items:        { bsonType: ['object', 'null'] },
      score:        { bsonType: ['double', 'null'] },
      createdAt:    { bsonType: 'date' },
    },
  },
};

/** @param {import('mongodb').Db} db */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { intentionId: 1, weekNumber: 1 },
    { unique: true, name: 'srhi_intentionId_week_unique' }
  );
  await col.createIndex({ userId: 1, submittedAt: 1 }, { name: 'srhi_userId_submittedAt' });
}
```

- [ ] **Step 4: Create `app/models/cuePool.js`**

```js
// app/models/cuePool.js
export const COLLECTION = 'cue_pools';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['text', 'quality', 'dimensions', 'domain', 'language', 'createdAt'],
    properties: {
      _id:      { bsonType: 'objectId' },
      text:     { bsonType: 'string' },
      quality:  { bsonType: 'string', enum: ['low', 'high'] },
      dimensions: {
        bsonType: 'object',
        required: ['stability', 'salience', 'specificity'],
        properties: {
          stability:   { bsonType: 'int', minimum: 1, maximum: 5 },
          salience:    { bsonType: 'int', minimum: 1, maximum: 5 },
          specificity: { bsonType: 'int', minimum: 1, maximum: 5 },
        },
      },
      domain:    { bsonType: 'string' },
      language:  { bsonType: 'string', enum: ['en', 'de'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/** @param {import('mongodb').Db} db */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex({ quality: 1, domain: 1, language: 1 }, { name: 'cue_pools_quality_domain_lang' });
}
```

- [ ] **Step 5: Create `app/models/notificationCampaign.js`**

```js
// app/models/notificationCampaign.js
export const COLLECTION = 'notification_campaigns';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['createdBy', 'title', 'body', 'targetType', 'status', 'createdAt'],
    properties: {
      _id:            { bsonType: 'objectId' },
      studyId:        { bsonType: ['objectId', 'null'] },
      createdBy:      { bsonType: 'string' },
      title:          { bsonType: 'string', maxLength: 65 },
      body:           { bsonType: 'string', maxLength: 240 },
      targetType:     { bsonType: 'string', enum: ['individual', 'group', 'all_enrolled'] },
      targetIds:      { bsonType: 'array', items: { bsonType: 'string' } },
      scheduledFor:   { bsonType: ['date', 'null'] },
      sentAt:         { bsonType: ['date', 'null'] },
      recipientCount: { bsonType: ['int', 'null'] },
      status:         { bsonType: 'string', enum: ['draft', 'scheduled', 'sent', 'failed'] },
      createdAt:      { bsonType: 'date' },
    },
  },
};

/** @param {import('mongodb').Db} db */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex({ status: 1, scheduledFor: 1 }, { name: 'campaigns_status_scheduledFor' });
  await col.createIndex({ studyId: 1 },                  { name: 'campaigns_studyId', sparse: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add app/models/implementationIntention.js app/models/dailyBehaviorLog.js \
        app/models/srhiResponse.js app/models/cuePool.js app/models/notificationCampaign.js
git commit -m "feat: add MongoDB model files for DFG study modules"
```

---

## Task 3: Extend Enrollment and Study Models

**Files:**
- Modify: `app/models/enrollment.js`
- Modify: `app/models/study.js`

- [ ] **Step 1: Extend `enrollment.js` validator and indexes**

In `app/models/enrollment.js`, add three fields to `properties` inside `$jsonSchema`, and add a new index:

```js
// In VALIDATOR.$jsonSchema.properties, add after enrolledAt:
lastActiveAt:  { bsonType: ['date', 'null'] },
droppedOutAt:  { bsonType: ['date', 'null'] },
reactivations: { bsonType: 'array', items: { bsonType: 'date' } },
cueConfig: {
  bsonType: ['object', 'null'],
  properties: {
    cueCount:        { bsonType: 'string', enum: ['single', 'multi'] },
    cueSource:       { bsonType: 'string', enum: ['low_quality', 'high_quality', 'self_selected'] },
    cuePoolId:       { bsonType: ['objectId', 'null'] },
    behaviorOptions: { bsonType: 'array', items: { bsonType: 'string' } },
    maxHabits:       { bsonType: ['int', 'null'] },
  },
},
```

In `ensureIndexes`, add:
```js
await col.createIndex(
  { droppedOutAt: 1 },
  { name: 'enrollments_droppedOutAt', sparse: true }
);
```

- [ ] **Step 2: Extend `study.js` groups schema to include `cueConfig`**

In `app/models/study.js`, inside `groups.items.properties`, add after `index`:

```js
cueConfig: {
  bsonType: ['object', 'null'],
  properties: {
    cueCount:        { bsonType: 'string', enum: ['single', 'multi'] },
    cueSource:       { bsonType: 'string', enum: ['low_quality', 'high_quality', 'self_selected'] },
    cuePoolId:       { bsonType: ['objectId', 'null'] },
    behaviorOptions: { bsonType: 'array', items: { bsonType: 'string' } },
    maxHabits:       { bsonType: ['int', 'null'] },
  },
},
```

- [ ] **Step 3: Extend `studyService.js` to pass `cueConfig` through**

In `app/services/studyService.js`, update `createStudy` to accept and store `cueConfig` per group:

```js
// In createStudy, update studyGroups mapping:
const studyGroups = groups.map((g, i) => ({
  id: new ObjectId(),
  label: g.label,
  index: i + 1,
  cueConfig: g.cueConfig ?? null,
}));
```

In `updateStudy`, update the new groups mapping:
```js
const newGroups = updates.groups
  .filter((g) => !existingLabels.has(g.label))
  .map((g, i) => ({
    id: new ObjectId(),
    label: g.label,
    index: existingGroups.length + i + 1,
    cueConfig: g.cueConfig ?? null,
  }));
```

- [ ] **Step 4: Run existing study service tests to confirm nothing is broken**

```bash
cd app && node --test tests/unit/study.service.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/models/enrollment.js app/models/study.js app/services/studyService.js
git commit -m "feat: extend enrollment and study models with cueConfig fields"
```

---

## Task 4: Habit Config Service

**Files:**
- Create: `app/services/habitConfigService.js`
- Create: `app/tests/unit/habitConfigService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// app/tests/unit/habitConfigService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { resolveHabitConfig } from '../../services/habitConfigService.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../../utils/srhi.js';

const studyCueConfig = {
  cueCount: 'single',
  cueSource: 'high_quality',
  cuePoolId: null,
  behaviorOptions: ['walking', 'yoga'],
  maxHabits: 1,
};

function makeDb({ enrollment = null, study = null, adminSettings = [] } = {}) {
  return {
    collection(name) {
      if (name === 'enrollments') return {
        findOne: async () => enrollment,
      };
      if (name === 'studies') return {
        findOne: async () => study,
      };
      if (name === 'admin_settings') return {
        find: () => ({ toArray: async () => adminSettings }),
      };
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('resolveHabitConfig: study participant gets group cueConfig', async () => {
  const groupId = 'g1';
  const db = makeDb({
    enrollment: { groupId, studyId: 's1', cueConfig: studyCueConfig },
  });
  const config = await resolveHabitConfig({ db, userId: 'u1' });
  assert.equal(config.cueCount, 'single');
  assert.equal(config.cueSource, 'high_quality');
  assert.equal(config.maxHabits, 1);
  assert.deepEqual(config.behaviorOptions, ['walking', 'yoga']);
});

test('resolveHabitConfig: public user gets admin default', async () => {
  const db = makeDb({
    enrollment: { groupId: 'g0', studyId: 's0', cueConfig: null },
    adminSettings: [
      { key: 'default_cue_count', value: 'multi' },
      { key: 'default_cue_source', value: 'high_quality' },
    ],
  });
  const config = await resolveHabitConfig({ db, userId: 'u2' });
  assert.equal(config.cueCount, 'multi');
  assert.equal(config.cueSource, 'high_quality');
  assert.equal(config.maxHabits, null);
  assert.deepEqual(config.behaviorOptions, DEFAULT_BEHAVIOR_KEYS);
});

test('resolveHabitConfig: no enrollment returns hardcoded fallback', async () => {
  const db = makeDb({ enrollment: null, adminSettings: [] });
  const config = await resolveHabitConfig({ db, userId: 'u3' });
  assert.equal(config.cueCount, 'multi');
  assert.equal(config.cueSource, 'high_quality');
  assert.equal(config.maxHabits, null);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd app && node --test tests/unit/habitConfigService.test.js
```
Expected: `Error: Cannot find module '../../services/habitConfigService.js'`

- [ ] **Step 3: Implement `habitConfigService.js`**

```js
// app/services/habitConfigService.js
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';

const FALLBACK = {
  cueCount: 'multi',
  cueSource: 'high_quality',
  cuePoolId: null,
  behaviorOptions: DEFAULT_BEHAVIOR_KEYS,
  maxHabits: null,
};

async function readAdminSettings(db) {
  const docs = await db.collection('admin_settings').find({
    key: { $in: ['default_cue_count', 'default_cue_source', 'default_reminder_time'] },
  }).toArray();
  return Object.fromEntries(docs.map((d) => [d.key, d.value]));
}

/**
 * Resolve cue configuration for a user.
 * Priority: enrollment.cueConfig > admin_settings defaults > hardcoded fallback.
 * @param {{ db: object, userId: string }} deps
 */
export async function resolveHabitConfig({ db, userId }) {
  const enrollment = await db.collection(ENROLLMENTS).findOne({ userId });

  if (enrollment?.cueConfig) {
    return {
      cueCount:        enrollment.cueConfig.cueCount,
      cueSource:       enrollment.cueConfig.cueSource,
      cuePoolId:       enrollment.cueConfig.cuePoolId ?? null,
      behaviorOptions: enrollment.cueConfig.behaviorOptions ?? DEFAULT_BEHAVIOR_KEYS,
      maxHabits:       enrollment.cueConfig.maxHabits ?? null,
    };
  }

  const settings = await readAdminSettings(db);
  return {
    cueCount:        settings['default_cue_count']  ?? FALLBACK.cueCount,
    cueSource:       settings['default_cue_source'] ?? FALLBACK.cueSource,
    cuePoolId:       null,
    behaviorOptions: DEFAULT_BEHAVIOR_KEYS,
    maxHabits:       null,
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd app && node --test tests/unit/habitConfigService.test.js
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/habitConfigService.js app/tests/unit/habitConfigService.test.js
git commit -m "feat: add habitConfigService with cue config resolution"
```

---

## Task 5: Intention Service

**Files:**
- Create: `app/services/intentionService.js`
- Create: `app/tests/unit/intentionService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// app/tests/unit/intentionService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createIntention,
  listIntentions,
  updateIntentionStatus,
} from '../../services/intentionService.js';

function makeDb(intentions = []) {
  const store = intentions.map((d) => ({ ...d }));
  return {
    collection(name) {
      assert.equal(name, 'implementation_intentions');
      return {
        async countDocuments(filter) {
          return store.filter((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k]?.toString() !== v?.toString()) return false;
            }
            return true;
          }).length;
        },
        find(filter = {}) {
          const results = store.filter((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k]?.toString() !== v?.toString()) return false;
            }
            return true;
          });
          return { async toArray() { return results.map((d) => ({ ...d })); } };
        },
        async insertOne(doc) {
          const saved = { ...doc, _id: new ObjectId() };
          store.push(saved);
          return { insertedId: saved._id };
        },
        async findOneAndUpdate(filter, update, opts) {
          const idx = store.findIndex((d) => d._id?.toString() === filter._id?.toString() && d.userId === filter.userId);
          if (idx === -1) return null;
          const before = opts?.returnDocument === 'before' ? { ...store[idx] } : null;
          if (update.$set) Object.assign(store[idx], update.$set);
          return opts?.returnDocument === 'before' ? before : { ...store[idx] };
        },
      };
    },
  };
}

test('createIntention: creates with status active', async () => {
  const db = makeDb();
  const result = await createIntention({
    db, userId: 'u1',
    behaviorKey: 'walking', behaviorLabel: 'Walking', durationMinutes: 20,
    cues: [{ text: 'After dinner', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After dinner, I will go for a 20-min walk.',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.status, 'active');
  assert.equal(result.userId, 'u1');
  assert.ok(result._id);
});

test('createIntention: enforces maxHabits=1', async () => {
  const existing = {
    _id: new ObjectId(), userId: 'u1', status: 'active',
    behaviorKey: 'walking', behaviorLabel: 'Walking', durationMinutes: 20,
    cues: [], intentionStatement: '', createdAt: new Date(), updatedAt: new Date(),
  };
  const db = makeDb([existing]);
  const result = await createIntention({
    db, userId: 'u1',
    behaviorKey: 'yoga', behaviorLabel: 'Yoga', durationMinutes: 20,
    cues: [], intentionStatement: '',
    cueConfig: { maxHabits: 1 },
  });
  assert.equal(result.limitReached, true);
});

test('createIntention: maxHabits=null allows multiple', async () => {
  const existing = {
    _id: new ObjectId(), userId: 'u1', status: 'active',
    behaviorKey: 'walking', behaviorLabel: 'Walking', durationMinutes: 20,
    cues: [], intentionStatement: '', createdAt: new Date(), updatedAt: new Date(),
  };
  const db = makeDb([existing]);
  const result = await createIntention({
    db, userId: 'u1',
    behaviorKey: 'yoga', behaviorLabel: 'Yoga', durationMinutes: 20,
    cues: [], intentionStatement: '',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.status, 'active');
});

test('updateIntentionStatus: sets new status', async () => {
  const id = new ObjectId();
  const db = makeDb([{
    _id: id, userId: 'u1', status: 'active',
    behaviorKey: 'walking', behaviorLabel: 'Walking', durationMinutes: 20,
    cues: [], intentionStatement: '', createdAt: new Date(), updatedAt: new Date(),
  }]);
  const result = await updateIntentionStatus({ db, id: id.toString(), userId: 'u1', status: 'abandoned' });
  assert.equal(result.updated, true);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd app && node --test tests/unit/intentionService.test.js
```
Expected: `Cannot find module '../../services/intentionService.js'`

- [ ] **Step 3: Implement `intentionService.js`**

```js
// app/services/intentionService.js
import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/implementationIntention.js';

export async function createIntention({ db, userId, enrollmentId = null, studyId = null, groupId = null, behaviorKey, behaviorLabel, durationMinutes, cues, intentionStatement, cueConfig }) {
  if (cueConfig?.maxHabits != null) {
    const count = await db.collection(COLLECTION).countDocuments({ userId, status: 'active' });
    if (count >= cueConfig.maxHabits) return { limitReached: true };
  }
  const now = new Date();
  const doc = {
    userId,
    enrollmentId: enrollmentId ? new ObjectId(enrollmentId) : null,
    studyId:      studyId      ? new ObjectId(studyId)      : null,
    groupId:      groupId      ? new ObjectId(groupId)      : null,
    behaviorKey,
    behaviorLabel,
    durationMinutes: parseInt(durationMinutes, 10),
    cues,
    intentionStatement,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function listIntentions({ db, userId }) {
  const docs = await db.collection(COLLECTION).find({ userId }).toArray();
  return docs.map(serialize);
}

export async function getIntention({ db, id, userId }) {
  let oid;
  try { oid = new ObjectId(id); } catch { return null; }
  const doc = await db.collection(COLLECTION).findOne({ _id: oid, userId });
  return doc ? serialize(doc) : null;
}

export async function updateIntentionStatus({ db, id, userId, status }) {
  let oid;
  try { oid = new ObjectId(id); } catch { return { notFound: true }; }
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: oid, userId },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) return { notFound: true };
  return { updated: true };
}

function serialize(doc) {
  return {
    id:                 doc._id.toString(),
    userId:             doc.userId,
    enrollmentId:       doc.enrollmentId?.toString() ?? null,
    studyId:            doc.studyId?.toString() ?? null,
    groupId:            doc.groupId?.toString() ?? null,
    behaviorKey:        doc.behaviorKey,
    behaviorLabel:      doc.behaviorLabel,
    durationMinutes:    doc.durationMinutes,
    cues:               doc.cues,
    intentionStatement: doc.intentionStatement,
    status:             doc.status,
    createdAt:          doc.createdAt,
    updatedAt:          doc.updatedAt,
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd app && node --test tests/unit/intentionService.test.js
```
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/intentionService.js app/tests/unit/intentionService.test.js
git commit -m "feat: add intentionService with maxHabits enforcement"
```

---

## Task 6: Daily Log Service

**Files:**
- Create: `app/services/dailyLogService.js`
- Create: `app/tests/unit/dailyLogService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// app/tests/unit/dailyLogService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { upsertLog, getLogs, touchEnrollmentActivity } from '../../services/dailyLogService.js';

function makeDb() {
  const logs = [];
  const enrollments = [];
  return {
    collection(name) {
      if (name === 'daily_behavior_logs') return {
        async findOneAndUpdate(filter, update, opts) {
          const key = `${filter.intentionId}|${filter.date}`;
          const idx = logs.findIndex((d) => `${d.intentionId}|${d.date}` === key);
          if (idx === -1) {
            if (opts?.upsert) {
              const doc = { ...update.$setOnInsert, ...update.$set, _id: new ObjectId() };
              logs.push(doc);
              return null;
            }
            return null;
          }
          if (update.$set) Object.assign(logs[idx], update.$set);
          return opts?.returnDocument === 'after' ? { ...logs[idx] } : null;
        },
        find(filter = {}) {
          const results = logs.filter((d) =>
            d.intentionId?.toString() === filter.intentionId?.toString()
          );
          return { async toArray() { return results; } };
        },
      };
      if (name === 'enrollments') return {
        async updateOne(filter, update) {
          const idx = enrollments.findIndex((e) => e.userId === filter.userId);
          if (idx >= 0) Object.assign(enrollments[idx], update.$set);
        },
      };
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('upsertLog: inserts on first call', async () => {
  const db = makeDb();
  const intentionId = new ObjectId();
  await upsertLog({ db, intentionId: intentionId.toString(), userId: 'u1', date: '2026-06-01', enacted: true });
  const logs = await db.collection('daily_behavior_logs').find({ intentionId }).toArray();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].enacted, true);
});

test('upsertLog: updates on duplicate date', async () => {
  const db = makeDb();
  const intentionId = new ObjectId();
  await upsertLog({ db, intentionId: intentionId.toString(), userId: 'u1', date: '2026-06-01', enacted: true });
  await upsertLog({ db, intentionId: intentionId.toString(), userId: 'u1', date: '2026-06-01', enacted: false });
  const logs = await db.collection('daily_behavior_logs').find({ intentionId }).toArray();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].enacted, false);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd app && node --test tests/unit/dailyLogService.test.js
```
Expected: `Cannot find module '../../services/dailyLogService.js'`

- [ ] **Step 3: Implement `dailyLogService.js`**

```js
// app/services/dailyLogService.js
import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/dailyBehaviorLog.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';

export async function upsertLog({ db, intentionId, userId, date, enacted }) {
  const oid = new ObjectId(intentionId);
  const now = new Date();
  await db.collection(COLLECTION).findOneAndUpdate(
    { intentionId: oid, date },
    {
      $setOnInsert: { intentionId: oid, userId, date, loggedAt: now },
      $set: { enacted, loggedAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  await touchEnrollmentActivity({ db, userId });
}

export async function getLogs({ db, intentionId, from, to }) {
  const oid = new ObjectId(intentionId);
  const filter = { intentionId: oid };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to)   filter.date.$lte = to;
  }
  const docs = await db.collection(COLLECTION).find(filter).toArray();
  return docs.map((d) => ({ date: d.date, enacted: d.enacted, loggedAt: d.loggedAt }));
}

export async function touchEnrollmentActivity({ db, userId }) {
  await db.collection(ENROLLMENTS).updateOne(
    { userId },
    { $set: { lastActiveAt: new Date() } }
  );
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd app && node --test tests/unit/dailyLogService.test.js
```
Expected: all 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/dailyLogService.js app/tests/unit/dailyLogService.test.js
git commit -m "feat: add dailyLogService with idempotent upsert"
```

---

## Task 7: SRHI Service

**Files:**
- Create: `app/services/srhiService.js`
- Create: `app/tests/unit/srhiService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// app/tests/unit/srhiService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { generateWindows, getDueWindows, submitSrhi } from '../../services/srhiService.js';
import { SRHI_ITEM_IDS } from '../../utils/srhi.js';

function makeDb(responses = []) {
  const store = [...responses];
  return {
    collection(name) {
      if (name === 'srhi_responses') return {
        find(filter = {}) {
          const now = new Date();
          const results = store.filter((d) => {
            if (filter.userId && d.userId !== filter.userId) return false;
            if (filter.submittedAt === null && d.submittedAt !== null) return false;
            if (filter.scheduledFor?.$lte && d.scheduledFor > filter.scheduledFor.$lte) return false;
            return true;
          });
          return { async toArray() { return results.map((x) => ({ ...x })); } };
        },
        async insertMany(docs) { store.push(...docs); },
        async findOneAndUpdate(filter, update, opts) {
          const idx = store.findIndex(
            (d) => d.intentionId?.toString() === filter.intentionId?.toString() &&
                   d.weekNumber === filter.weekNumber &&
                   d.submittedAt === null
          );
          if (idx === -1) return null;
          Object.assign(store[idx], update.$set);
          return { ...store[idx] };
        },
      };
      if (name === 'enrollments') return {
        async updateOne() {},
      };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('generateWindows: creates 4 upcoming windows from createdAt', async () => {
  const db = makeDb();
  const intentionId = new ObjectId();
  const createdAt = new Date('2026-01-01T10:00:00Z');
  const windows = await generateWindows({ db, intentionId: intentionId.toString(), userId: 'u1', createdAt, studyId: null, groupId: null });
  assert.equal(windows.length, 4);
  assert.equal(windows[0].weekNumber, 1);
  assert.equal(windows[3].weekNumber, 4);
  assert.equal(windows[0].submittedAt, null);
  assert.equal(windows[0].score, null);
});

test('getDueWindows: returns open windows within 3-day window', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  const openWindow = {
    _id: new ObjectId(), intentionId, userId: 'u1',
    weekNumber: 1,
    scheduledFor: new Date(now - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    submittedAt: null, score: null, createdAt: now,
  };
  const db = makeDb([openWindow]);
  const due = await getDueWindows({ db, userId: 'u1' });
  assert.equal(due.length, 1);
  assert.equal(due[0].weekNumber, 1);
});

test('submitSrhi: computes mean score from 12 items', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  const window = {
    _id: new ObjectId(), intentionId, userId: 'u1',
    weekNumber: 1, scheduledFor: now, submittedAt: null, score: null,
    studyId: null, groupId: null, items: null, createdAt: now,
  };
  const db = makeDb([window]);
  const items = Object.fromEntries(SRHI_ITEM_IDS.map((id) => [id, 4]));
  const result = await submitSrhi({ db, intentionId: intentionId.toString(), userId: 'u1', weekNumber: 1, items });
  assert.equal(result.score, 4);
  assert.ok(result.submittedAt);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd app && node --test tests/unit/srhiService.test.js
```
Expected: `Cannot find module '../../services/srhiService.js'`

- [ ] **Step 3: Implement `srhiService.js`**

```js
// app/services/srhiService.js
import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/srhiResponse.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { SRHI_ITEM_IDS } from '../utils/srhi.js';

const WINDOW_DAYS = 3;
const GENERATE_AHEAD = 4;

export async function generateWindows({ db, intentionId, userId, createdAt, studyId, groupId }) {
  const oid = new ObjectId(intentionId);
  const sOid = studyId ? new ObjectId(studyId) : null;
  const gOid = groupId ? new ObjectId(groupId) : null;
  const now = new Date();
  const docs = [];
  for (let w = 1; w <= GENERATE_AHEAD; w++) {
    const scheduledFor = new Date(createdAt.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
    docs.push({
      intentionId: oid, userId,
      studyId: sOid, groupId: gOid,
      weekNumber: w, scheduledFor,
      submittedAt: null, items: null, score: null,
      createdAt: now,
    });
  }
  await db.collection(COLLECTION).insertMany(docs);
  return docs;
}

export async function getDueWindows({ db, userId }) {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const docs = await db.collection(COLLECTION).find({
    userId,
    submittedAt: null,
    scheduledFor: { $lte: now, $gte: windowCutoff },
  }).toArray();
  return docs.map(serialize);
}

export async function submitSrhi({ db, intentionId, userId, weekNumber, items }) {
  const oid = new ObjectId(intentionId);
  const missing = SRHI_ITEM_IDS.filter((id) => items[id] == null || items[id] < 1 || items[id] > 7);
  if (missing.length > 0) return { invalid: true, missing };

  const score = SRHI_ITEM_IDS.reduce((sum, id) => sum + Number(items[id]), 0) / SRHI_ITEM_IDS.length;
  const now = new Date();

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { intentionId: oid, weekNumber: parseInt(weekNumber, 10), submittedAt: null },
    { $set: { items, score, submittedAt: now } },
    { returnDocument: 'after' }
  );
  if (!result) return { notFound: true };

  await db.collection(ENROLLMENTS).updateOne({ userId }, { $set: { lastActiveAt: now } });
  return serialize(result);
}

export async function getTrajectory({ db, intentionId, userId }) {
  const oid = new ObjectId(intentionId);
  const docs = await db.collection(COLLECTION).find({ intentionId: oid, userId }).toArray();
  return docs.map((d) => ({
    weekNumber:   d.weekNumber,
    scheduledFor: d.scheduledFor,
    submittedAt:  d.submittedAt,
    score:        d.score,
  }));
}

function serialize(doc) {
  return {
    id:           doc._id.toString(),
    intentionId:  doc.intentionId.toString(),
    userId:       doc.userId,
    weekNumber:   doc.weekNumber,
    scheduledFor: doc.scheduledFor,
    submittedAt:  doc.submittedAt,
    score:        doc.score,
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd app && node --test tests/unit/srhiService.test.js
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/srhiService.js app/tests/unit/srhiService.test.js
git commit -m "feat: add srhiService with window scheduling and score computation"
```

---

## Task 8: Cue Pool Service

**Files:**
- Create: `app/services/cuePoolService.js`
- Create: `app/tests/unit/cuePoolService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// app/tests/unit/cuePoolService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { createCue, listCues, deleteCue } from '../../services/cuePoolService.js';

function makeDb(cues = []) {
  const store = [...cues];
  return {
    collection(name) {
      assert.equal(name, 'cue_pools');
      return {
        async insertOne(doc) {
          const saved = { ...doc, _id: new ObjectId() };
          store.push(saved);
          return { insertedId: saved._id };
        },
        find(filter = {}) {
          const results = store.filter((d) => {
            if (filter.quality && d.quality !== filter.quality) return false;
            if (filter.language && d.language !== filter.language) return false;
            return true;
          });
          return {
            skip(n) { return { limit(m) { return { async toArray() { return results.slice(n, n + m); } }; }; } },
          };
        },
        async countDocuments(filter = {}) {
          return store.filter((d) => {
            if (filter.quality && d.quality !== filter.quality) return false;
            return true;
          }).length;
        },
        async deleteOne(filter) {
          const idx = store.findIndex((d) => d._id?.toString() === filter._id?.toString());
          if (idx >= 0) store.splice(idx, 1);
          return { deletedCount: idx >= 0 ? 1 : 0 };
        },
      };
    },
  };
}

test('createCue: stores a cue and returns it', async () => {
  const db = makeDb();
  const result = await createCue({
    db, text: 'After dinner each evening', quality: 'high',
    dimensions: { stability: 5, salience: 4, specificity: 5 },
    domain: 'physical_activity', language: 'en',
  });
  assert.equal(result.text, 'After dinner each evening');
  assert.equal(result.quality, 'high');
  assert.ok(result.id);
});

test('deleteCue: removes a cue by id', async () => {
  const id = new ObjectId();
  const db = makeDb([{ _id: id, text: 'x', quality: 'low', dimensions: {}, domain: 'd', language: 'en', createdAt: new Date() }]);
  const result = await deleteCue({ db, id: id.toString() });
  assert.equal(result.deleted, true);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd app && node --test tests/unit/cuePoolService.test.js
```

- [ ] **Step 3: Implement `cuePoolService.js`**

```js
// app/services/cuePoolService.js
import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/cuePool.js';

export async function createCue({ db, text, quality, dimensions, domain, language }) {
  const doc = { text, quality, dimensions, domain, language, createdAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

export async function listCues({ db, quality, language, page = 1, limit = 50 }) {
  const filter = {};
  if (quality)  filter.quality  = quality;
  if (language) filter.language = language;
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    db.collection(COLLECTION).find(filter).skip(skip).limit(limit).toArray(),
    db.collection(COLLECTION).countDocuments(filter),
  ]);
  return { total, page, limit, cues: docs.map(serialize) };
}

export async function deleteCue({ db, id }) {
  let oid;
  try { oid = new ObjectId(id); } catch { return { notFound: true }; }
  const result = await db.collection(COLLECTION).deleteOne({ _id: oid });
  return result.deletedCount === 0 ? { notFound: true } : { deleted: true };
}

function serialize(doc) {
  return { id: doc._id.toString(), text: doc.text, quality: doc.quality, dimensions: doc.dimensions, domain: doc.domain, language: doc.language, createdAt: doc.createdAt };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd app && node --test tests/unit/cuePoolService.test.js
```
Expected: all 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/cuePoolService.js app/tests/unit/cuePoolService.test.js
git commit -m "feat: add cuePoolService for researcher-managed cue pools"
```

---

## Task 9: Export Service

**Files:**
- Create: `app/services/exportService.js`
- Create: `app/tests/unit/exportService.test.js`

Note: this service depends on `csv-stringify`. Install it first:

```bash
cd app && npm install csv-stringify
```

- [ ] **Step 1: Write the failing tests**

```js
// app/tests/unit/exportService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { buildSrhiCsv, buildDailyLogsCsv, buildDropoutCsv } from '../../services/exportService.js';

function makeDb({ srhi = [], logs = [], enrollments = [], intentions = [] } = {}) {
  return {
    collection(name) {
      if (name === 'srhi_responses')             return { find: (f) => ({ toArray: async () => srhi }) };
      if (name === 'daily_behavior_logs')        return { find: (f) => ({ toArray: async () => logs }) };
      if (name === 'enrollments')                return { find: (f) => ({ toArray: async () => enrollments }) };
      if (name === 'implementation_intentions')  return { find: (f) => ({ toArray: async () => intentions }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('buildSrhiCsv: includes header and a data row', async () => {
  const intentionId = new ObjectId();
  const db = makeDb({
    srhi: [{
      intentionId, userId: 'u1', weekNumber: 1,
      scheduledFor: new Date('2026-01-01'), submittedAt: new Date('2026-01-02'),
      score: 4.5, studyId: null, groupId: null,
    }],
    enrollments: [{ userId: 'u1', studyId: null, groupId: null, cueConfig: { cueSource: 'high_quality', cueCount: 'single' } }],
  });
  const csv = await buildSrhiCsv({ db, studyId: null });
  assert.ok(csv.includes('userId'), 'missing header');
  assert.ok(csv.includes('u1'), 'missing data row');
  assert.ok(csv.includes('4.5'), 'missing score');
});

test('buildSrhiCsv: missing windows appear as NA rows', async () => {
  const intentionId = new ObjectId();
  const db = makeDb({
    srhi: [{
      intentionId, userId: 'u1', weekNumber: 1,
      scheduledFor: new Date('2026-01-01'), submittedAt: null,
      score: null, studyId: null, groupId: null,
    }],
    enrollments: [{ userId: 'u1', studyId: null, groupId: null, cueConfig: null }],
  });
  const csv = await buildSrhiCsv({ db, studyId: null });
  assert.ok(csv.includes('TRUE'), 'missed=TRUE missing');
});

test('buildDropoutCsv: marks dropped participants', async () => {
  const db = makeDb({
    enrollments: [{
      userId: 'u1', studyId: null, groupId: null,
      enrolledAt: new Date('2026-01-01'),
      lastActiveAt: new Date('2026-01-15'),
      droppedOutAt: new Date('2026-01-30'),
      cueConfig: null,
    }],
  });
  const csv = await buildDropoutCsv({ db, studyId: null });
  assert.ok(csv.includes('TRUE'), 'dropped=TRUE missing');
  assert.ok(csv.includes('u1'));
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd app && node --test tests/unit/exportService.test.js
```

- [ ] **Step 3: Implement `exportService.js`**

```js
// app/services/exportService.js
import { stringify } from 'csv-stringify/sync';
import { ObjectId } from 'mongodb';
import { COLLECTION as SRHI }        from '../models/srhiResponse.js';
import { COLLECTION as LOGS }        from '../models/dailyBehaviorLog.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as INTENTIONS }  from '../models/implementationIntention.js';

async function enrollmentMap(db, studyId) {
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const docs = await db.collection(ENROLLMENTS).find(filter).toArray();
  return Object.fromEntries(docs.map((e) => [e.userId, e]));
}

export async function buildSrhiCsv({ db, studyId }) {
  const eMap = await enrollmentMap(db, studyId);
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const rows = await db.collection(SRHI).find(filter).toArray();

  const records = rows.map((r) => {
    const e = eMap[r.userId] ?? {};
    return {
      userId:       r.userId,
      studyId:      r.studyId?.toString() ?? 'NA',
      groupLabel:   e.cueConfig?.cueSource ?? 'NA',
      cueSource:    e.cueConfig?.cueSource ?? 'NA',
      cueCount:     e.cueConfig?.cueCount  ?? 'NA',
      weekNumber:   r.weekNumber,
      scheduledFor: r.scheduledFor?.toISOString() ?? 'NA',
      submittedAt:  r.submittedAt?.toISOString() ?? 'NA',
      score:        r.score ?? 'NA',
      missed:       r.submittedAt == null ? 'TRUE' : 'FALSE',
    };
  });

  return stringify(records, { header: true });
}

export async function buildDailyLogsCsv({ db, studyId }) {
  const eMap = await enrollmentMap(db, studyId);
  const intentionFilter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const intentions = await db.collection(INTENTIONS).find(intentionFilter).toArray();
  const intentionIds = intentions.map((i) => i._id);

  const logFilter = intentionIds.length ? { intentionId: { $in: intentionIds } } : {};
  const logs = await db.collection(LOGS).find(logFilter).toArray();

  const iMap = Object.fromEntries(intentions.map((i) => [i._id.toString(), i]));

  const records = logs.map((l) => {
    const intention = iMap[l.intentionId?.toString()] ?? {};
    const e = eMap[l.userId] ?? {};
    const dayNumber = intention.createdAt
      ? Math.floor((new Date(l.date) - intention.createdAt) / 86400000) + 1
      : 'NA';
    return {
      userId:     l.userId,
      studyId:    intention.studyId?.toString() ?? 'NA',
      groupLabel: e.cueConfig?.cueSource ?? 'NA',
      cueSource:  e.cueConfig?.cueSource ?? 'NA',
      cueCount:   e.cueConfig?.cueCount  ?? 'NA',
      date:       l.date,
      dayNumber,
      enacted:    l.enacted == null ? 'NA' : (l.enacted ? 'TRUE' : 'FALSE'),
      loggedAt:   l.loggedAt?.toISOString() ?? 'NA',
    };
  });

  return stringify(records, { header: true });
}

export async function buildDropoutCsv({ db, studyId }) {
  const filter = studyId ? { studyId: new ObjectId(studyId) } : {};
  const enrollments = await db.collection(ENROLLMENTS).find(filter).toArray();

  const records = enrollments.map((e) => ({
    userId:         e.userId,
    studyId:        e.studyId?.toString() ?? 'NA',
    groupLabel:     e.cueConfig?.cueSource ?? 'NA',
    enrolledAt:     e.enrolledAt?.toISOString() ?? 'NA',
    lastActiveDate: e.lastActiveAt?.toISOString() ?? 'NA',
    droppedOutAt:   e.droppedOutAt?.toISOString() ?? 'NA',
    daysObserved:   e.enrolledAt && e.lastActiveAt
      ? Math.floor((e.lastActiveAt - e.enrolledAt) / 86400000)
      : 'NA',
    dropped: e.droppedOutAt ? 'TRUE' : 'FALSE',
  }));

  return stringify(records, { header: true });
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd app && node --test tests/unit/exportService.test.js
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/exportService.js app/tests/unit/exportService.test.js
git commit -m "feat: add exportService with H1/H2a/H2b CSV generation"
```

---

## Task 10: Notification Campaign Service

**Files:**
- Create: `app/services/notificationCampaignService.js`
- Create: `app/tests/unit/notificationCampaignService.test.js`

Note: Check how `app/services/notificationService.js` imports Firebase Admin SDK — replicate the same import pattern. The test mocks the FCM send call.

- [ ] **Step 1: Read the existing notification service to understand the Firebase import pattern**

```bash
head -20 app/services/notificationService.js
```

- [ ] **Step 2: Write the failing tests**

```js
// app/tests/unit/notificationCampaignService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { createCampaign, sendCampaign } from '../../services/notificationCampaignService.js';

function makeDb(campaigns = [], users = []) {
  const cStore = [...campaigns];
  const uStore = [...users];
  return {
    collection(name) {
      if (name === 'notification_campaigns') return {
        async insertOne(doc) {
          const saved = { ...doc, _id: new ObjectId() };
          cStore.push(saved);
          return { insertedId: saved._id };
        },
        async findOneAndUpdate(filter, update, opts) {
          const idx = cStore.findIndex((d) => d._id?.toString() === filter._id?.toString());
          if (idx === -1) return null;
          Object.assign(cStore[idx], update.$set);
          return { ...cStore[idx] };
        },
        findOne: async (filter) => cStore.find((d) => d._id?.toString() === filter._id?.toString()) ?? null,
      };
      if (name === 'users') return {
        find: (filter) => ({ toArray: async () => uStore.filter((u) => filter.userId?.$in?.includes(u.userId) ?? true) }),
      };
      if (name === 'enrollments') return {
        find: (filter) => ({ toArray: async () => [] }),
      };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('createCampaign: stores campaign with draft status', async () => {
  const db = makeDb();
  const result = await createCampaign({
    db, createdBy: 'researcher1', studyId: null,
    title: 'Check in', body: 'How are your habits going?',
    targetType: 'all_enrolled', targetIds: [],
    scheduledFor: null,
  });
  assert.equal(result.status, 'draft');
  assert.equal(result.title, 'Check in');
  assert.ok(result.id);
});

test('sendCampaign: dispatches to provided mock sender', async () => {
  const id = new ObjectId();
  const db = makeDb([{
    _id: id, title: 'Hi', body: 'Hello', targetType: 'individual',
    targetIds: ['u1'], status: 'draft', studyId: null,
    createdBy: 'r1', createdAt: new Date(), scheduledFor: null,
    sentAt: null, recipientCount: null,
  }], [{ userId: 'u1', fcmToken: 'tok-abc' }]);

  let sent = null;
  const mockSend = async (tokens, title, body) => { sent = { tokens, title, body }; return tokens.length; };

  const result = await sendCampaign({ db, id: id.toString(), send: mockSend });
  assert.equal(result.recipientCount, 1);
  assert.ok(sent);
  assert.deepEqual(sent.tokens, ['tok-abc']);
});
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd app && node --test tests/unit/notificationCampaignService.test.js
```

- [ ] **Step 4: Implement `notificationCampaignService.js`**

```js
// app/services/notificationCampaignService.js
import { ObjectId } from 'mongodb';
import { COLLECTION }              from '../models/notificationCampaign.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';

export async function createCampaign({ db, createdBy, studyId, title, body, targetType, targetIds = [], scheduledFor = null }) {
  const now = new Date();
  const doc = {
    studyId:      studyId ? new ObjectId(studyId) : null,
    createdBy,
    title,
    body,
    targetType,
    targetIds,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    sentAt:         null,
    recipientCount: null,
    status:         'draft',
    createdAt:      now,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

export async function listCampaigns({ db, studyId, status, page = 1, limit = 20 }) {
  // Simple list — pagination left as direct Mongo query for brevity
  const filter = {};
  if (studyId) filter.studyId = new ObjectId(studyId);
  if (status)  filter.status  = status;
  const docs = await db.collection(COLLECTION)
    .find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  return docs.map(serialize);
}

export async function cancelCampaign({ db, id }) {
  let oid;
  try { oid = new ObjectId(id); } catch { return { notFound: true }; }
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: oid, sentAt: null },
    { $set: { status: 'draft' } },
    { returnDocument: 'after' }
  );
  return result ? { cancelled: true } : { notFound: true };
}

/**
 * Resolve target user FCM tokens and dispatch via `send` callback.
 * `send` is injected so tests can mock it; production passes the Firebase sender.
 *
 * @param {{ db, id: string, send: (tokens: string[], title: string, body: string) => Promise<number> }} deps
 */
export async function sendCampaign({ db, id, send }) {
  let oid;
  try { oid = new ObjectId(id); } catch { return { notFound: true }; }
  const campaign = await db.collection(COLLECTION).findOne({ _id: oid });
  if (!campaign) return { notFound: true };

  let userIds = [];
  if (campaign.targetType === 'individual') {
    userIds = campaign.targetIds;
  } else if (campaign.targetType === 'group') {
    const enrollments = await db.collection(ENROLLMENTS)
      .find({ groupId: { $in: campaign.targetIds.map((id) => new ObjectId(id)) } })
      .toArray();
    userIds = enrollments.map((e) => e.userId);
  } else {
    const filter = campaign.studyId ? { studyId: campaign.studyId } : {};
    const enrollments = await db.collection(ENROLLMENTS).find(filter).toArray();
    userIds = enrollments.map((e) => e.userId);
  }

  const users = await db.collection('users').find({ userId: { $in: userIds } }).toArray();
  const tokens = users.map((u) => u.fcmToken).filter(Boolean);

  const recipientCount = tokens.length > 0 ? await send(tokens, campaign.title, campaign.body) : 0;
  const now = new Date();
  await db.collection(COLLECTION).findOneAndUpdate(
    { _id: oid },
    { $set: { sentAt: now, recipientCount, status: 'sent' } },
    { returnDocument: 'after' }
  );
  return { recipientCount, sentAt: now };
}

function serialize(doc) {
  return {
    id:             doc._id.toString(),
    studyId:        doc.studyId?.toString() ?? null,
    createdBy:      doc.createdBy,
    title:          doc.title,
    body:           doc.body,
    targetType:     doc.targetType,
    targetIds:      doc.targetIds,
    scheduledFor:   doc.scheduledFor,
    sentAt:         doc.sentAt,
    recipientCount: doc.recipientCount,
    status:         doc.status,
    createdAt:      doc.createdAt,
  };
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd app && node --test tests/unit/notificationCampaignService.test.js
```
Expected: all 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/services/notificationCampaignService.js app/tests/unit/notificationCampaignService.test.js
git commit -m "feat: add notificationCampaignService with injectable FCM sender"
```

---

## Task 11: API Routes

**Files:**
- Create: `app/routes/intentionsRouter.js`
- Create: `app/routes/srhiRouter.js`
- Create: `app/routes/habitConfigRouter.js`
- Create: `app/routes/cuePoolRouter.js`
- Create: `app/routes/studyExportRouter.js`
- Create: `app/routes/notificationCampaignRouter.js`

- [ ] **Step 1: Create `app/routes/intentionsRouter.js`**

```js
// app/routes/intentionsRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { createIntention, listIntentions, updateIntentionStatus } from '../services/intentionService.js';
import { upsertLog, getLogs } from '../services/dailyLogService.js';
import { generateWindows } from '../services/srhiService.js';

export function createIntentionsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const intentions = await listIntentions({ db: database, userId: req.user.sub });
      res.json(intentions);
    } catch (err) {
      console.error('[intentions] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { behaviorKey, behaviorLabel, durationMinutes, cues, intentionStatement } = req.body;
      if (!behaviorKey || !behaviorLabel || !durationMinutes || !cues?.length || !intentionStatement) {
        return res.status(400).json({ error: 'behaviorKey, behaviorLabel, durationMinutes, cues, and intentionStatement are required' });
      }
      const database = await getDb();
      const userId = req.user.sub;
      const cueConfig = await resolveHabitConfig({ db: database, userId });
      const result = await createIntention({ db: database, userId, behaviorKey, behaviorLabel, durationMinutes, cues, intentionStatement, cueConfig });
      if (result.limitReached) return res.status(409).json({ error: 'Habit limit reached for your study condition' });
      await generateWindows({
        db: database,
        intentionId: result._id.toString(),
        userId,
        createdAt: result.createdAt,
        studyId: result.studyId?.toString() ?? null,
        groupId: result.groupId?.toString() ?? null,
      });
      res.status(201).json(result);
    } catch (err) {
      console.error('[intentions] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ['paused', 'completed', 'abandoned'];
      if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
      const database = await getDb();
      const result = await updateIntentionStatus({ db: database, id: req.params.id, userId: req.user.sub, status });
      if (result.notFound) return res.status(404).json({ error: 'Intention not found' });
      res.json({ updated: true });
    } catch (err) {
      console.error('[intentions] PATCH /:id/status:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id/logs', async (req, res) => {
    try {
      const { from, to } = req.query;
      const database = await getDb();
      const logs = await getLogs({ db: database, intentionId: req.params.id, from, to });
      res.json(logs);
    } catch (err) {
      console.error('[intentions] GET /:id/logs:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:id/logs', async (req, res) => {
    try {
      const { date, enacted } = req.body;
      if (!date || typeof enacted !== 'boolean') return res.status(400).json({ error: 'date (YYYY-MM-DD) and enacted (boolean) are required' });
      const database = await getDb();
      await upsertLog({ db: database, intentionId: req.params.id, userId: req.user.sub, date, enacted });
      res.status(201).json({ logged: true });
    } catch (err) {
      console.error('[intentions] POST /:id/logs:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 2: Create `app/routes/srhiRouter.js`**

```js
// app/routes/srhiRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { getDueWindows, submitSrhi, getTrajectory } from '../services/srhiService.js';

export function createSrhiRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/due', async (req, res) => {
    try {
      const database = await getDb();
      const due = await getDueWindows({ db: database, userId: req.user.sub });
      res.json(due);
    } catch (err) {
      console.error('[srhi] GET /due:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:intentionId/week/:weekNumber', async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || typeof items !== 'object') return res.status(400).json({ error: 'items object required' });
      const database = await getDb();
      const result = await submitSrhi({
        db: database,
        intentionId: req.params.intentionId,
        userId: req.user.sub,
        weekNumber: parseInt(req.params.weekNumber, 10),
        items,
      });
      if (result.invalid)  return res.status(400).json({ error: 'Missing or invalid items', missing: result.missing });
      if (result.notFound) return res.status(404).json({ error: 'SRHI window not found or already submitted' });
      res.status(201).json(result);
    } catch (err) {
      console.error('[srhi] POST:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:intentionId/trajectory', async (req, res) => {
    try {
      const database = await getDb();
      const trajectory = await getTrajectory({ db: database, intentionId: req.params.intentionId, userId: req.user.sub });
      res.json(trajectory);
    } catch (err) {
      console.error('[srhi] GET /trajectory:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 3: Create `app/routes/habitConfigRouter.js`**

```js
// app/routes/habitConfigRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { SRHI_ITEMS } from '../utils/srhi.js';

export function createHabitConfigRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const config = await resolveHabitConfig({ db: database, userId: req.user.sub });
      res.json({ ...config, srhiItems: SRHI_ITEMS });
    } catch (err) {
      console.error('[habit-config] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Create `app/routes/cuePoolRouter.js`**

```js
// app/routes/cuePoolRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { createCue, listCues, deleteCue } from '../services/cuePoolService.js';

export function createCuePoolRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const { quality, language, page, limit } = req.query;
      const database = await getDb();
      const result = await listCues({ db: database, quality, language, page: parseInt(page ?? '1', 10), limit: parseInt(limit ?? '50', 10) });
      res.json(result);
    } catch (err) {
      console.error('[cue-pools] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { text, quality, dimensions, domain, language } = req.body;
      if (!text || !quality || !dimensions || !domain || !language) {
        return res.status(400).json({ error: 'text, quality, dimensions, domain, language required' });
      }
      const database = await getDb();
      const result = await createCue({ db: database, text, quality, dimensions, domain, language });
      res.status(201).json(result);
    } catch (err) {
      console.error('[cue-pools] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await deleteCue({ db: database, id: req.params.id });
      if (result.notFound) return res.status(404).json({ error: 'Cue not found' });
      res.json({ deleted: true });
    } catch (err) {
      console.error('[cue-pools] DELETE /:id:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 5: Create `app/routes/studyExportRouter.js`**

```js
// app/routes/studyExportRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { buildSrhiCsv, buildDailyLogsCsv, buildDropoutCsv } from '../services/exportService.js';

export function createStudyExportRouter({ db } = {}) {
  const router = express.Router({ mergeParams: true });
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const { id: studyId } = req.params;
      const [srhiCsv, logsCsv, dropoutCsv] = await Promise.all([
        buildSrhiCsv({ db: database, studyId }),
        buildDailyLogsCsv({ db: database, studyId }),
        buildDropoutCsv({ db: database, studyId }),
      ]);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="study-${studyId}-export.zip"`);

      // Build ZIP in-memory using adm-zip (install: npm install adm-zip)
      const { default: AdmZip } = await import('adm-zip');
      const zip = new AdmZip();
      zip.addFile('srhi_trajectories.csv',  Buffer.from(srhiCsv,    'utf8'));
      zip.addFile('daily_logs.csv',          Buffer.from(logsCsv,   'utf8'));
      zip.addFile('dropout.csv',             Buffer.from(dropoutCsv,'utf8'));
      res.end(zip.toBuffer());
    } catch (err) {
      console.error('[export] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

Note: install `adm-zip`:
```bash
cd app && npm install adm-zip
```

- [ ] **Step 6: Create `app/routes/notificationCampaignRouter.js`**

```js
// app/routes/notificationCampaignRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { createCampaign, listCampaigns, cancelCampaign, sendCampaign } from '../services/notificationCampaignService.js';

export function createNotificationCampaignRouter({ db, fcmSend } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const { studyId, status, page, limit } = req.query;
      const database = await getDb();
      const result = await listCampaigns({ db: database, studyId, status, page: parseInt(page ?? '1', 10), limit: parseInt(limit ?? '20', 10) });
      res.json(result);
    } catch (err) {
      console.error('[notifications] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { studyId, title, body, targetType, targetIds, scheduledFor } = req.body;
      if (!title || !body || !targetType) return res.status(400).json({ error: 'title, body, targetType required' });
      if (title.length > 65)  return res.status(400).json({ error: 'title max 65 chars' });
      if (body.length > 240)  return res.status(400).json({ error: 'body max 240 chars' });
      const database = await getDb();
      const campaign = await createCampaign({
        db: database, createdBy: req.user.sub,
        studyId: studyId ?? null, title, body, targetType, targetIds: targetIds ?? [], scheduledFor: scheduledFor ?? null,
      });
      if (!scheduledFor) {
        await sendCampaign({ db: database, id: campaign.id, send: fcmSend });
      }
      res.status(201).json(campaign);
    } catch (err) {
      console.error('[notifications] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await cancelCampaign({ db: database, id: req.params.id });
      if (result.notFound) return res.status(404).json({ error: 'Campaign not found or already sent' });
      res.json({ cancelled: true });
    } catch (err) {
      console.error('[notifications] DELETE /:id:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

- [ ] **Step 7: Commit all route files**

```bash
git add app/routes/intentionsRouter.js app/routes/srhiRouter.js \
        app/routes/habitConfigRouter.js app/routes/cuePoolRouter.js \
        app/routes/studyExportRouter.js app/routes/notificationCampaignRouter.js
git commit -m "feat: add API routes for intentions, SRHI, cue pools, export, notifications"
```

---

## Task 12: Register Routes in v1Router

**Files:**
- Modify: `app/routes/v1Router.js`

- [ ] **Step 1: Add imports at top of `v1Router.js` (after existing imports)**

```js
import { createIntentionsRouter }          from './intentionsRouter.js';
import { createSrhiRouter }                from './srhiRouter.js';
import { createHabitConfigRouter }         from './habitConfigRouter.js';
import { createCuePoolRouter }             from './cuePoolRouter.js';
import { createStudyExportRouter }         from './studyExportRouter.js';
import { createNotificationCampaignRouter } from './notificationCampaignRouter.js';
```

- [ ] **Step 2: Register the new routes in `createV1Router` (add after existing `/habits` registration)**

```js
// Implementation intentions (user + admin + researcher)
router.use(
  '/habits/intentions',
  requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
  createIntentionsRouter({ db })
);

// SRHI measurement (user + admin + researcher)
router.use(
  '/srhi',
  requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
  createSrhiRouter({ db })
);

// Resolved habit config (user + admin + researcher)
router.use(
  '/me/habit-config',
  requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
  createHabitConfigRouter({ db })
);

// Cue pool management (admin + researcher)
router.use(
  '/admin/cue-pools',
  requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
  createCuePoolRouter({ db })
);

// Study data export (admin + researcher)
router.use(
  '/admin/studies/:id/export',
  requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
  createStudyExportRouter({ db })
);

// Researcher notification campaigns (admin + researcher)
router.use(
  '/admin/notifications',
  requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
  createNotificationCampaignRouter({ db, fcmSend: null /* wired in app.js */ })
);
```

- [ ] **Step 3: Wire `fcmSend` in `app.js` (or wherever `createV1Router` is called)**

Find the call to `createV1Router(...)` in `app/app.js`. Add:

```js
import { getMessaging } from 'firebase-admin/messaging';

// Inside the v1Router creation, pass fcmSend:
// Replace the notificationCampaignRouter registration's fcmSend: null with:
fcmSend: async (tokens, title, body) => {
  const messaging = getMessaging();
  const result = await messaging.sendEachForMulticast({ tokens, notification: { title, body } });
  return result.successCount;
},
```

Note: Firebase Admin SDK must already be initialised (`initializeApp()`). Check `notificationService.js` for the existing initialisation — do not initialise twice.

- [ ] **Step 4: Run the full unit test suite to confirm nothing is broken**

```bash
cd app && npm run test:unitTests
```
Expected: all existing and new unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/routes/v1Router.js app/app.js
git commit -m "feat: register DFG study routes in v1Router"
```

---

## Task 13: Seed Data

**Files:**
- Modify: `scripts/seed-local.js`

- [ ] **Step 1: Read the current seed script structure before modifying**

```bash
head -80 scripts/seed-local.js
```

- [ ] **Step 2: Add `seedTestParticipant()` function**

Append to `scripts/seed-local.js`:

```js
// ── DFG study test seed data ─────────────────────────────────────────────────

const CUE_CONFIGS = {
  c1: { cueCount: 'single', cueSource: 'low_quality',  maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c2: { cueCount: 'multi',  cueSource: 'low_quality',  maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c3: { cueCount: 'single', cueSource: 'high_quality', maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c4: { cueCount: 'multi',  cueSource: 'high_quality', maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c5: { cueCount: 'single', cueSource: 'self_selected',maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c6: { cueCount: 'multi',  cueSource: 'self_selected',maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
};

const EXAMPLE_CUES = {
  low_quality_single:  [{ text: 'When I have some free time in the evening', source: 'pre_rated', cueId: null }],
  low_quality_multi:   [{ text: 'When I get home in the evening', source: 'pre_rated', cueId: null }, { text: 'and have some free time', source: 'pre_rated', cueId: null }],
  high_quality_single: [{ text: 'After dinner each evening', source: 'pre_rated', cueId: null }],
  high_quality_multi:  [{ text: 'After dinner each evening', source: 'pre_rated', cueId: null }, { text: 'at home on weekdays', source: 'pre_rated', cueId: null }],
  self_selected_single:[{ text: 'After my morning coffee', source: 'self_selected', cueId: null }],
  self_selected_multi: [{ text: 'After my morning coffee', source: 'self_selected', cueId: null }, { text: 'on workdays at home', source: 'self_selected', cueId: null }],
};

function fakeSrhiScore(week, seed) {
  const asymptote = 3.5 + (seed % 3) * 0.5;
  const rate = 0.12;
  return Math.min(7, parseFloat((asymptote * (1 - Math.exp(-rate * week)) + 1.5 + (Math.random() - 0.5) * 0.4).toFixed(2)));
}

async function seedTestParticipant(db) {
  const conditions = ['c1','c2','c3','c4','c5','c6'];
  const dropDays = { c4: 30, c6: 45 };

  for (const cond of conditions) {
    const userId = `test-${cond}`;
    const cueConfig = CUE_CONFIGS[cond];
    const cueKey = `${cueConfig.cueSource}_${cueConfig.cueCount}`;
    const cues = EXAMPLE_CUES[cueKey] ?? EXAMPLE_CUES['high_quality_single'];
    const enrolledAt = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000); // 56 days ago

    // Upsert enrollment
    await db.collection('enrollments').updateOne(
      { userId },
      { $setOnInsert: { userId, studyId: null, groupId: null, studyCodeUsed: null, enrolledAt, cueConfig } },
      { upsert: true }
    );

    // Create intention
    const { ObjectId } = await import('mongodb');
    const intentionId = new ObjectId();
    await db.collection('implementation_intentions').updateOne(
      { userId, status: 'active' },
      { $setOnInsert: {
          _id: intentionId, userId,
          enrollmentId: null, studyId: null, groupId: null,
          behaviorKey: 'walking', behaviorLabel: 'Walking', durationMinutes: 20,
          cues,
          intentionStatement: `${cues.map(c=>c.text).join(', ')}, I will go for a 20-min walk.`,
          status: 'active', createdAt: enrolledAt, updatedAt: enrolledAt,
        }
      },
      { upsert: true }
    );

    const intention = await db.collection('implementation_intentions').findOne({ userId, status: 'active' });

    // Daily logs: 56 days, ~80% enactment, no logs after dropDay
    const dropDay = dropDays[cond] ?? Infinity;
    for (let d = 0; d < 56; d++) {
      if (d >= dropDay) continue;
      const enacted = Math.random() < 0.80;
      const date = new Date(enrolledAt.getTime() + d * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      await db.collection('daily_behavior_logs').updateOne(
        { intentionId: intention._id, date: dateStr },
        { $setOnInsert: { intentionId: intention._id, userId, date: dateStr, enacted, loggedAt: date } },
        { upsert: true }
      );
    }

    // SRHI responses: 8 weeks
    for (let w = 1; w <= 8; w++) {
      const scheduledFor = new Date(enrolledAt.getTime() + (w - 1) * 7 * 86400000);
      const missed = dropDays[cond] && (w - 1) * 7 >= dropDays[cond];
      const score = missed ? null : fakeSrhiScore(w, conditions.indexOf(cond));
      const items = missed ? null : Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`srhi_${i + 1}`, Math.min(7, Math.max(1, Math.round(score + (Math.random() - 0.5))))])
      );
      await db.collection('srhi_responses').updateOne(
        { intentionId: intention._id, weekNumber: w },
        { $setOnInsert: {
            intentionId: intention._id, userId,
            studyId: null, groupId: null,
            weekNumber: w, scheduledFor,
            submittedAt: missed ? null : new Date(scheduledFor.getTime() + 86400000),
            items, score, createdAt: scheduledFor,
          }
        },
        { upsert: true }
      );
    }

    if (dropDays[cond]) {
      await db.collection('enrollments').updateOne(
        { userId },
        { $set: { droppedOutAt: new Date(enrolledAt.getTime() + dropDays[cond] * 86400000), lastActiveAt: new Date(enrolledAt.getTime() + (dropDays[cond] - 1) * 86400000) } }
      );
    }

    console.log(`  ✓ seeded test-${cond}`);
  }

  // Public user: 3 habits, varying density
  const pubId = 'test-public';
  await db.collection('enrollments').updateOne(
    { userId: pubId },
    { $setOnInsert: { userId: pubId, studyId: null, groupId: null, studyCodeUsed: null, enrolledAt: new Date(), cueConfig: null } },
    { upsert: true }
  );
  console.log('  ✓ seeded test-public');
}
```

Also call it from the main seed function:
```js
// At the bottom of the seed script's main block, add:
console.log('Seeding DFG test participants...');
await seedTestParticipant(db);
```

- [ ] **Step 3: Run the seed script to verify it executes without errors**

```bash
cd app && npm run seed
```
Expected: output includes `✓ seeded test-c1` through `✓ seeded test-c6` and `✓ seeded test-public`.

- [ ] **Step 4: Run the full test suite one final time**

```bash
cd app && npm run test:unitTests
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-local.js
git commit -m "feat: add DFG study test seed data with 7 participants and fake longitudinal data"
```

---

## Plan Complete

**Next plans:**
- `2026-06-01-dfg-admin-panel.md` — Next.js admin pages (cue pools, study group config, notification center, export UI)
- `2026-06-01-dfg-flutter-ux.md` — Flutter screens and widgets (My Habits tab, New Habit flow, heatmap, SRHI form)

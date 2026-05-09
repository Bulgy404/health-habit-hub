# Neo4j User Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `User` nodes to Neo4j with generic questionnaire trajectory tracking, linked to existing `Habit` nodes via `[:DONATED]` edges; sync is triggered on every questionnaire submission.

**Architecture:** `userQueries.js` holds all Cypher (same injectable pattern as `habitQueries.js`). `questionnaireResponsesRouter.js` gains a `neo4jRun` option, creates a local `queryNeo4j` wrapper (identical to `habitsRouter.js`), and calls the user-graph sync after the MongoDB write — non-blocking (errors are caught and logged). A backfill script handles existing data.

**Tech Stack:** Node.js (ES modules), neo4j-driver, node:test

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `app/db/userQueries.js` | Cypher functions for User/Submission/QuestionItem |
| Modify | `app/routes/questionnaireResponsesRouter.js` | Accept `neo4jRun`, call sync after MongoDB write |
| Modify | `app/routes/v1Router.js` | Pass `neo4jRun` to `createQuestionnaireResponsesRouter` |
| Modify | `app/tests/integration/questionnaire-responses.routes.test.js` | Add neo4jRun mock + sync assertion |
| Modify | `neo4j/init/constraints.cypher` | Add User/QuestionItem/Submission indexes |
| Create | `scripts/backfill-user-nodes.js` | One-time User node + DONATED edge backfill |

---

## Task 1: Cypher query functions

**Files:**
- Create: `app/db/userQueries.js`

- [ ] **Step 1: Write failing test**

Add to `app/tests/unit/` as a new file `user.queries.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeUserAndHabits, createSubmissionWithScores } from '../../db/userQueries.js';

test('mergeUserAndHabits calls queryNeo4j with userId param', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => { calls.push({ cypher, params }); return []; };
  await mergeUserAndHabits(mockRun, 'user-abc');
  assert.ok(calls.length > 0);
  assert.ok(calls.every(c => c.params.userId === 'user-abc'));
});

test('createSubmissionWithScores passes all scores to queryNeo4j', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => { calls.push({ cypher, params }); return []; };
  const answers = { sliq_diet: '2', sliq_activity: '3' };
  await createSubmissionWithScores(mockRun, 'user-abc', 'sliq', answers);
  const scoreCall = calls.find(c => c.params.scores !== undefined);
  assert.ok(scoreCall, 'expected a call with scores param');
  assert.strictEqual(scoreCall.params.scores.length, 2);
  assert.ok(scoreCall.params.scores.every(s => typeof s.value === 'number'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && node --test tests/unit/user.queries.test.js
```

Expected: FAIL — `userQueries.js` does not exist.

- [ ] **Step 3: Create `app/db/userQueries.js`**

```js
/**
 * Named Neo4j query functions for the User/questionnaire-trajectory domain.
 *
 * All functions accept a `queryNeo4j(cypher, params)` runner as their first
 * argument so they can be used with either an injected test stub or the real
 * driver. This keeps Cypher strings out of route and service layers.
 */

/**
 * MERGE a User node and link it to all existing Habit nodes donated by that user.
 * Safe to call repeatedly — MERGE on User and MERGE on [:DONATED] are idempotent.
 * @param {Function} queryNeo4j
 * @param {string} userId  Keycloak subject UUID
 */
export async function mergeUserAndHabits(queryNeo4j, userId) {
  await queryNeo4j(
    `MERGE (u:User {userId: $userId})
     ON CREATE SET u.createdAt = datetime()
     WITH u
     MATCH (h:Habit {userID: $userId})
     MERGE (u)-[:DONATED]->(h)`,
    { userId }
  );
}

/**
 * Create a Submission node for one questionnaire fill, link it to the User,
 * and store each item score as a [:HAS_SCORE] edge to a (shared) QuestionItem node.
 *
 * Generic by design: `answers` is the raw flat map from MongoDB; any
 * questionnaire slug flows through without code changes.
 *
 * @param {Function} queryNeo4j
 * @param {string} userId
 * @param {string} questionnaireId   e.g. 'sliq', 'rand-36', 'srhi'
 * @param {Object} answers           flat map { questionId: rawValue }
 */
export async function createSubmissionWithScores(queryNeo4j, userId, questionnaireId, answers) {
  const scores = Object.entries(answers).map(([itemId, value]) => ({
    itemId,
    value: parseFloat(value) || 0,
  }));

  await queryNeo4j(
    `MATCH (u:User {userId: $userId})
     CREATE (s:Submission {questionnaireId: $questionnaireId, submittedAt: datetime()})
     CREATE (u)-[:SUBMITTED]->(s)
     WITH s
     UNWIND $scores AS score
     MERGE (qi:QuestionItem {id: score.itemId, questionnaireId: $questionnaireId})
     CREATE (s)-[:HAS_SCORE {value: score.value}]->(qi)`,
    { userId, questionnaireId, scores }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd app && node --test tests/unit/user.queries.test.js
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add app/db/userQueries.js app/tests/unit/user.queries.test.js
git commit -m "feat: add userQueries.js — User/Submission/QuestionItem Cypher functions"
```

---

## Task 2: Wire sync into questionnaire submission route

**Files:**
- Modify: `app/routes/questionnaireResponsesRouter.js`

- [ ] **Step 1: Write failing test**

Open `app/tests/integration/questionnaire-responses.routes.test.js`.

Add these imports at the top (after existing imports):

```js
// ── Neo4j mock ────────────────────────────────────────────────────────────────
function createNeo4jMock() {
  const calls = [];
  return {
    async neo4jRun(cypher, params = {}) {
      calls.push({ cypher, params });
      return [];
    },
    getCalls() { return calls; },
  };
}
```

Add a `neo4jMock` variable next to the existing `let server; let port;` block:

```js
let neo4jMock;
```

In the `before` block, just before `const db = createMockDb();`, add:

```js
  neo4jMock = createNeo4jMock();
```

Pass `neo4jRun` into `createV1Router`:

```js
  app.use(
    '/api/v1',
    createV1Router({
      jwksUrl: `http://127.0.0.1:${jwksPort}/realms/hhh/protocol/openid-connect/certs`,
      expectedIssuer: null,
      expectedAudience: null,
      db,
      neo4jRun: neo4jMock.neo4jRun,
    })
  );
```

Add a new test at the bottom of the file:

```js
test('POST /questionnaire-responses — triggers neo4j user sync', async () => {
  const token = makeToken('user-neo4j-sync', ['participant']);
  const callsBefore = neo4jMock.getCalls().length;

  const res = await request('POST', '/questionnaire-responses', token, {
    questionnaireSlug: 'sliq',
    answers: { sliq_diet: '3', sliq_activity: '2' },
  });
  assert.strictEqual(res.status, 201);

  const newCalls = neo4jMock.getCalls().slice(callsBefore);
  assert.ok(newCalls.length >= 2, 'expected at least 2 neo4j calls (mergeUser + createSubmission)');
  assert.ok(
    newCalls.some(c => c.params.userId === 'user-neo4j-sync'),
    'expected a call with the submitting userId'
  );
  assert.ok(
    newCalls.some(c => c.params.questionnaireId === 'sliq'),
    'expected a call with the questionnaireId'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && node --test tests/integration/questionnaire-responses.routes.test.js
```

Expected: FAIL — neo4j sync test fails because `neo4jRun` is not yet accepted by the router.

- [ ] **Step 3: Update `questionnaireResponsesRouter.js`**

Replace the function signature and add the neo4j setup after the existing imports:

```js
import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { mergeUserAndHabits, createSubmissionWithScores } from '../db/userQueries.js';

export function createQuestionnaireResponsesRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Long-lived Neo4j driver — created once per router instance if not injected
  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        process.env.NEO4J_URI || 'bolt://neo4j:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );

  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }
```

Keep all existing router logic intact. In the `router.post('/')` handler, add the Neo4j sync call after the `database.collection('form_responses').insertOne(...)` line and before `res.status(201).json({ ok: true })`:

```js
      await database.collection('form_responses').insertOne({
        userId,
        questionnaireSlug,
        answers,
        submitted_at: new Date(),
      });

      // Sync to Neo4j — non-blocking: errors are logged but never surface to the caller
      syncUserGraph(userId, questionnaireSlug, answers).catch((err) => {
        console.error('[questionnaire-responses] neo4j sync error:', err);
      });

      res.status(201).json({ ok: true });
```

Add the `syncUserGraph` helper function (inside the router factory, before the `router.post` definition):

```js
  async function syncUserGraph(userId, questionnaireId, answers) {
    await mergeUserAndHabits(queryNeo4j, userId);
    await createSubmissionWithScores(queryNeo4j, userId, questionnaireId, answers);
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd app && node --test tests/integration/questionnaire-responses.routes.test.js
```

Expected: All tests PASS, including the new neo4j sync test.

- [ ] **Step 5: Commit**

```bash
git add app/routes/questionnaireResponsesRouter.js app/tests/integration/questionnaire-responses.routes.test.js
git commit -m "feat: sync User/Submission graph on questionnaire submission"
```

---

## Task 3: Pass neo4jRun to the questionnaire responses router in v1Router

**Files:**
- Modify: `app/routes/v1Router.js`

- [ ] **Step 1: Write failing test**

The existing integration test suite exercises the full router. Run it to confirm the current state passes before making changes:

```bash
cd app && node --test tests/integration/questionnaire-responses.routes.test.js
```

Expected: All tests PASS (baseline confirmed).

- [ ] **Step 2: Update `v1Router.js`**

Find the line that mounts the questionnaire-responses router (around line 209):

```js
  router.use(
    '/questionnaire-responses',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createQuestionnaireResponsesRouter({ db })
  );
```

Change it to:

```js
  router.use(
    '/questionnaire-responses',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createQuestionnaireResponsesRouter({ db, neo4jRun })
  );
```

- [ ] **Step 3: Run full unit+integration test suite**

```bash
cd app && node --test "tests/unit/**/*.test.js" "tests/integration/**/*.test.js"
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/routes/v1Router.js
git commit -m "feat: pass neo4jRun to createQuestionnaireResponsesRouter"
```

---

## Task 4: Add Neo4j constraints/indexes

**Files:**
- Modify: `neo4j/init/constraints.cypher`

- [ ] **Step 1: Append new constraints**

Open `neo4j/init/constraints.cypher` and append at the end:

```cypher
// User node — one node per Keycloak subject
CREATE CONSTRAINT user_userId IF NOT EXISTS
  FOR (u:User) REQUIRE u.userId IS UNIQUE;

// QuestionItem — shared across users; (id, questionnaireId) must be unique
CREATE CONSTRAINT question_item_unique IF NOT EXISTS
  FOR (qi:QuestionItem) REQUIRE (qi.id, qi.questionnaireId) IS NODE KEY;

// Index for trajectory queries: find all submissions for a given questionnaire, ordered by time
CREATE INDEX submission_timeline IF NOT EXISTS
  FOR (s:Submission) ON (s.questionnaireId, s.submittedAt);
```

- [ ] **Step 2: Apply to running Neo4j (if local dev instance is up)**

```bash
# Copy constraints into the container and apply via cypher-shell
docker exec -i hhh-neo4j cypher-shell \
  -u neo4j -p "$(grep NEO4J_PASSWORD .env | cut -d= -f2)" \
  < neo4j/init/constraints.cypher
```

If Neo4j is not running locally, skip this step — constraints are applied automatically on next container start because the file is mounted at startup.

- [ ] **Step 3: Commit**

```bash
git add neo4j/init/constraints.cypher
git commit -m "feat: add User/QuestionItem/Submission constraints to Neo4j init"
```

---

## Task 5: Backfill existing users

**Files:**
- Create: `scripts/backfill-user-nodes.js`

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-user-nodes.js`:

```js
#!/usr/bin/env node
/**
 * backfill-user-nodes.js
 *
 * One-time script: creates User nodes and [:DONATED] edges for all existing
 * Habit nodes in Neo4j. Safe to run multiple times — all writes use MERGE.
 *
 * Questionnaire history is NOT backfilled — trajectory starts from deploy date.
 *
 * Usage (run from project root):
 *   NEO4J_URI=bolt://localhost:7687 \
 *   NEO4J_USER=neo4j \
 *   NEO4J_PASSWORD=yourpassword \
 *   node scripts/backfill-user-nodes.js [--dry-run]
 */

import neo4j from 'neo4j-driver';

const DRY_RUN = process.argv.includes('--dry-run');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function run() {
  if (DRY_RUN) console.log('[dry-run] No changes will be written.');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    // 1. Collect all distinct userIDs from Habit nodes
    const result = await session.run(
      'MATCH (h:Habit) WHERE h.userID IS NOT NULL RETURN DISTINCT h.userID AS userId'
    );
    const userIds = result.records.map((r) => r.get('userId'));
    console.log(`Found ${userIds.length} distinct users with Habit nodes.`);

    if (DRY_RUN) {
      console.log('[dry-run] Would create User nodes for:', userIds);
      return;
    }

    // 2. For each user: MERGE User node + DONATED edges
    let count = 0;
    for (const userId of userIds) {
      await session.run(
        `MERGE (u:User {userId: $userId})
         ON CREATE SET u.createdAt = datetime()
         WITH u
         MATCH (h:Habit {userID: $userId})
         MERGE (u)-[:DONATED]->(h)`,
        { userId }
      );
      count++;
      if (count % 10 === 0) console.log(`  Processed ${count}/${userIds.length}`);
    }

    console.log(`Done. Created/merged User nodes for ${count} users.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify script is runnable**

```bash
node scripts/backfill-user-nodes.js --dry-run
```

Expected output (no Neo4j connection needed for dry-run shape check):
```
[dry-run] No changes will be written.
```
(Script will error if Neo4j is unreachable, which is fine for CI — it's a manual one-time script.)

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-user-nodes.js
git commit -m "feat: add backfill-user-nodes.js for existing habit donor graph migration"
```

---

## Task 6: Full test suite verification

- [ ] **Step 1: Run complete unit + integration tests**

```bash
cd app && node --test "tests/unit/**/*.test.js" "tests/integration/**/*.test.js"
```

Expected: All tests PASS.

- [ ] **Step 2: Run lint + format check**

```bash
cd app && npm run lint && npm run format:check
```

Expected: No errors.

- [ ] **Step 3: Final commit if any lint fixes needed**

```bash
git add -p  # stage only the lint fixes
git commit -m "fix: lint/format cleanup for user graph sync"
```

---

## Verification Queries (manual, after deployment)

Connect to Neo4j Browser or cypher-shell and run:

```cypher
// 1. Count User nodes
MATCH (u:User) RETURN count(u) AS users;

// 2. Verify DONATED edges exist
MATCH (u:User)-[:DONATED]->(h:Habit) RETURN u.userId, count(h) AS habits LIMIT 10;

// 3. Trajectory for a specific user
MATCH (u:User {userId: 'YOUR_USER_ID'})-[:SUBMITTED]->(s:Submission)
RETURN s.questionnaireId, s.submittedAt,
       [(s)-[r:HAS_SCORE]->(qi) | {item: qi.id, value: r.value}] AS scores
ORDER BY s.submittedAt ASC;
```

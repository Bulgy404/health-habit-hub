# Neo4j User Graph Design

**Date:** 2026-05-09  
**Status:** Approved  
**Scope:** Add User nodes to Neo4j with generic questionnaire trajectory tracking; habit-ownership edges. Recommendations pipeline changes are out of scope.

---

## Goal

Extend the Neo4j graph with `User` nodes that:
1. Link to habits the user has donated.
2. Store questionnaire item scores generically — any questionnaire a researcher adds is automatically captured without code changes.
3. Preserve trajectory: multiple submissions of the same questionnaire over time are all kept, ordered by timestamp.

---

## Graph Schema

```
(:User {userId: string, createdAt: datetime})
  -[:DONATED]->
(:Habit {uuid, sentence, userID, …})   ← existing node, unchanged

(:User)
  -[:SUBMITTED]->
(:Submission {questionnaireId: string, submittedAt: datetime})
  -[:HAS_SCORE {value: float}]->
(:QuestionItem {id: string, questionnaireId: string})
```

### Node properties

| Label | Property | Type | Notes |
|---|---|---|---|
| `User` | `userId` | string | Keycloak subject; unique |
| `User` | `createdAt` | datetime | Set once on first MERGE |
| `Submission` | `questionnaireId` | string | e.g. `"sliq"`, `"rand36"`, `"srhi"` |
| `Submission` | `submittedAt` | datetime | Set at creation time |
| `QuestionItem` | `id` | string | Question ID from the answer map key, e.g. `"sliq_diet"` |
| `QuestionItem` | `questionnaireId` | string | Parent questionnaire; together with `id` forms a unique pair |

### Relationship properties

| Type | Property | Type | Notes |
|---|---|---|---|
| `HAS_SCORE` | `value` | float | Raw answer value from the submission |

### Indexes

```cypher
CREATE CONSTRAINT user_userId IF NOT EXISTS
  FOR (u:User) REQUIRE u.userId IS UNIQUE;

CREATE CONSTRAINT question_item_unique IF NOT EXISTS
  FOR (qi:QuestionItem) REQUIRE (qi.id, qi.questionnaireId) IS NODE KEY;

CREATE INDEX submission_timeline IF NOT EXISTS
  FOR (s:Submission) ON (s.questionnaireId, s.submittedAt);
```

---

## Data Flow

**Source of truth:** MongoDB. Neo4j is a derived graph — sync failures are logged but never block the questionnaire submission response.

**Trigger:** After a questionnaire answer map is written to MongoDB, the submission route calls `syncUserToNeo4j(userId, questionnaireId, answers)`.

`answers` is the existing flat map already in the system: `{ questionId: rawValue, … }`.

### Sync Cypher (single transaction)

```cypher
// 1. Ensure User node exists
MERGE (u:User {userId: $userId})
ON CREATE SET u.createdAt = datetime()

// 2. Link to all existing habits owned by this user (idempotent)
WITH u
MATCH (h:Habit {userID: $userId})
MERGE (u)-[:DONATED]->(h)

// 3. Create this submission
WITH u
CREATE (s:Submission {questionnaireId: $questionnaireId, submittedAt: datetime()})
CREATE (u)-[:SUBMITTED]->(s)

// 4. Store each item score generically
WITH s
UNWIND $scores AS score
MERGE (qi:QuestionItem {id: score.itemId, questionnaireId: $questionnaireId})
CREATE (s)-[:HAS_SCORE {value: score.value}]->(qi)
```

`$scores` is built in JavaScript before calling Neo4j:

```js
const scores = Object.entries(answers).map(([itemId, value]) => ({
  itemId,
  value: parseFloat(value),
}));
```

**Generic by design:** the Cypher never names a specific questionnaire. A researcher registers a new questionnaire in MongoDB; users submit answers; the sync writes whatever keys arrive in the answer map to `QuestionItem` nodes automatically.

---

## Trajectory Queries

**All submissions for one user + questionnaire, in order:**
```cypher
MATCH (u:User {userId: $uid})-[:SUBMITTED]->(s:Submission {questionnaireId: $qid})
RETURN s.submittedAt,
       [(s)-[r:HAS_SCORE]->(qi) | {item: qi.id, value: r.value}] AS scores
ORDER BY s.submittedAt ASC
```

**Collaborative filtering seed (users with similar item scores):**
```cypher
MATCH (u:User {userId: $uid})-[:SUBMITTED]->(s:Submission)-[r:HAS_SCORE]->(qi:QuestionItem)
WITH qi, r.value AS myValue
MATCH (other:User)-[:SUBMITTED]->(os:Submission)-[r2:HAS_SCORE]->(qi)
WHERE other.userId <> $uid AND abs(myValue - r2.value) < 1.5
RETURN other.userId, count(qi) AS overlap
ORDER BY overlap DESC LIMIT 10
```

---

## Implementation — Files Changed

### New files

| File | Purpose |
|---|---|
| `app/db/userQueries.js` | Cypher constants for User/Submission/QuestionItem operations |
| `app/services/userGraphService.js` | `syncUserToNeo4j(userId, questionnaireId, answers)` — wraps Neo4j session, non-blocking |
| `scripts/backfill-user-nodes.js` | One-time script: creates User nodes + DONATED edges for all existing habits |

### Modified files

| File | Change |
|---|---|
| Questionnaire submission route (to be located) | Call `syncUserToNeo4j` after MongoDB write; catch and log errors without re-throwing |

### Unchanged

- `app/db/habitQueries.js` — existing habit Cypher untouched
- `API-service/` — recommendations pipeline deferred
- MongoDB schemas — Neo4j is derived; no MongoDB changes
- Flutter app / admin panel — no user-facing changes

---

## Backfill

A one-time Node.js script (`scripts/backfill-user-nodes.js`) runs after deployment:

1. Query Neo4j for all distinct `userID` values on `Habit` nodes.
2. For each: `MERGE (u:User {userId: uid}) ON CREATE SET u.createdAt = datetime()`.
3. `MATCH (h:Habit {userID: uid}) MERGE (u)-[:DONATED]->(h)`.

Questionnaire history is not backfilled — trajectory starts from the deploy date. Past MongoDB submissions are the historical record if needed later.

---

## Error Handling

- Neo4j sync is fire-and-log: errors are caught, written to the application logger, and do not propagate to the HTTP response.
- If the Neo4j driver is unavailable, the questionnaire submission still succeeds (MongoDB is source of truth).
- `MERGE` on `User` and `QuestionItem` makes sync idempotent for the node-creation steps; `Submission` nodes are always `CREATE`d (each fill is a distinct event).

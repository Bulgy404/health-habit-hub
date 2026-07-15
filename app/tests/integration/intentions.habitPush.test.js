import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createIntentionsRouter } from '../../routes/intentionsRouter.js';

// Focused coverage for the post-habit-creation check-in push: when a
// participant's study delivers SRHI on habit creation, POST /habits/intentions
// must fire exactly one push to that participant with the right payload. We
// mount the router directly (rather than the full apiRouter) so we can inject a
// notifier spy and a zero-delay timer instead of a real Firebase + 5s wait.

const STUDY_ID = new ObjectId();

// Assignment the mock study exposes — an active SRHI assignment — plus the
// questionnaire definitions' `scope`, which together gate SRHI window
// generation + push (habit-scoped + active).
let assignmentDocs;
let questionnaireDocs;
// Records SRHI windows the route generated, so we can assert delivery happened.
let srhiInserts;
// Captures every notifier invocation (the "push").
let pushCalls;

function makeDb() {
  const generic = () => ({
    insertOne: async () => ({ insertedId: new ObjectId() }),
    insertMany: async () => ({}),
    find: () => ({
      toArray: async () => [],
      sort: () => ({ toArray: async () => [] }),
    }),
    findOne: async () => null,
    countDocuments: async () => 0,
    aggregate: () => ({ toArray: async () => [] }),
    bulkWrite: async () => ({}),
    updateOne: async () => ({}),
  });

  return {
    collection(name) {
      if (name === 'implementation_intentions') {
        return {
          ...generic(),
          insertOne: async (doc) => ({ insertedId: doc._id ?? new ObjectId() }),
        };
      }
      if (name === 'enrollments') {
        return {
          ...generic(),
          findOne: async () => ({ studyId: STUDY_ID, groupId: null }),
        };
      }
      if (name === 'questionnaire_assignments') {
        return {
          ...generic(),
          find: () => ({ toArray: async () => assignmentDocs }),
        };
      }
      if (name === 'questionnaires') {
        return {
          ...generic(),
          find: () => ({ toArray: async () => questionnaireDocs }),
        };
      }
      if (name === 'srhi_responses') {
        return {
          ...generic(),
          insertMany: async (docs) => {
            srhiInserts.push(...docs);
            return {};
          },
        };
      }
      return generic();
    },
  };
}

const validBody = {
  behaviorKey: 'walking',
  behaviorLabel: 'Walking',
  durationMinutes: 20,
  cues: [
    { text: 'After dinner each evening', source: 'pre_rated', cueId: null },
  ],
  intentionStatement: 'After dinner each evening, I will go for a 20-min walk.',
};

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  // Stand-in auth middleware — the real one sets req.user from the JWT.
  app.use((req, _res, next) => {
    req.user = { sub: 'push-user' };
    next();
  });
  const router = createIntentionsRouter({
    db: makeDb(),
    // No Neo4j enrollment → resolveHabitConfig falls back to permissive public
    // defaults, so habit creation is allowed.
    neo4jRun: async () => [],
    // Spy notifier + immediate delivery instead of Firebase + a 5s timer.
    notify: async (args) => {
      pushCalls.push(args);
      return 1;
    },
    pushDelayMs: 0,
  });
  app.use('/', router);
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  assignmentDocs = [];
  questionnaireDocs = [];
  srhiInserts = [];
  pushCalls = [];
});

async function createHabit() {
  return fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBody),
  });
}

// setTimeout(0) defers the push to the next tick; give it room to run.
const flush = () => new Promise((r) => setTimeout(r, 30));

test('fires exactly one check-in push when SRHI delivers on habit creation', async () => {
  const srhiQuestionnaireId = new ObjectId();
  assignmentDocs = [
    {
      _id: new ObjectId(),
      studyId: STUDY_ID,
      groupId: null,
      questionnaireId: srhiQuestionnaireId,
      questionnaireSlug: 'srhi',
      active: true,
    },
  ];
  questionnaireDocs = [{ _id: srhiQuestionnaireId, scope: 'habit' }];

  const res = await createHabit();
  assert.strictEqual(res.status, 201);
  const body = await res.json();

  await flush();

  // SRHI windows were generated (delivery happened) …
  assert.strictEqual(srhiInserts.length, 4);
  // … and exactly one push fired, addressed to this participant, deep-linking
  // to the just-created habit's SRHI check-in.
  assert.strictEqual(pushCalls.length, 1);
  const push = pushCalls[0];
  assert.strictEqual(push.userId, 'push-user');
  assert.strictEqual(push.data.type, 'srhi');
  assert.strictEqual(push.data.intentionId, body.id);
  assert.ok(/walk/i.test(push.body), 'push body should name the new habit');
});

test('does NOT push when no questionnaire delivers on habit creation', async () => {
  assignmentDocs = []; // no flagged assignment for this study

  const res = await createHabit();
  assert.strictEqual(res.status, 201);

  await flush();

  assert.strictEqual(srhiInserts.length, 0);
  assert.strictEqual(pushCalls.length, 0);
});

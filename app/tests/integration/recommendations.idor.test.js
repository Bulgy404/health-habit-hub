/**
 * IDOR regression test for POST /recommendations/:id/feedback
 *
 * Verifies that USER_B cannot post feedback on USER_A's recommendation.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createRecommendationsRouter } from '../../routes/recommendationsRouter.js';

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';
const REC_ID = 'rec-idor-001';

function makeApp(userId) {
  const db = {
    collection: () => ({
      findOne: async ({ recommendation_id, userId: scopedUserId }) => {
        // Simulate DB: only USER_A owns REC_ID
        if (recommendation_id === REC_ID && scopedUserId === USER_A) {
          return { recommendation_id: REC_ID, userId: USER_A, goal: 'eat better' };
        }
        return null;
      },
      insertOne: async () => ({ insertedId: 'feedback-1' }),
    }),
  };

  const app = express();
  app.use(express.json());
  // Simulate auth middleware — inject req.user
  app.use((req, _res, next) => {
    req.user = { sub: userId };
    next();
  });
  app.use('/', createRecommendationsRouter({ db, redisClient: null }));
  return app;
}

let serverA;
let serverB;
let baseUrlA;
let baseUrlB;

before(async () => {
  serverA = createServer(makeApp(USER_A));
  serverB = createServer(makeApp(USER_B));
  await Promise.all([
    new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve)),
    new Promise((resolve) => serverB.listen(0, '127.0.0.1', resolve)),
  ]);
  baseUrlA = `http://127.0.0.1:${serverA.address().port}`;
  baseUrlB = `http://127.0.0.1:${serverB.address().port}`;
});

after(() => {
  serverA.close();
  serverB.close();
});

test('USER_A can post feedback on their own recommendation', async () => {
  const res = await fetch(`${baseUrlA}/${REC_ID}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: 'good rec' }),
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('USER_B receives 404 on USER_A recommendation ID', async () => {
  const res = await fetch(`${baseUrlB}/${REC_ID}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: 'sneaky' }),
  });
  assert.strictEqual(res.status, 404);
});

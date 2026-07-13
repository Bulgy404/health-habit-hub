import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createNotificationCampaignRouter } from '../../routes/notificationCampaignRouter.js';

// Mounts createNotificationCampaignRouter directly (rather than going through
// createApiRouter + real JWT/JWKS auth, as most integration tests here do)
// because this router is the only place that accepts an injectable `fcmSend`
// — needed to simulate a successful FCM send without a real Firebase project.
// Auth/role-gating for this route is already covered by requireRole's own
// tests; this file is scoped to the send-and-report-recipientCount behavior.

// ── In-memory mock DB ─────────────────────────────────────────────────────────

function createMockDb() {
  const campaigns = [];
  const deviceTokens = [
    { userId: 'participant-1', token: 'fcm-token-1' },
    { userId: 'participant-2', token: 'fcm-token-2' },
  ];

  return {
    collection(name) {
      if (name === 'notification_campaigns') {
        return {
          async insertOne(doc) {
            const _id = doc._id ?? new ObjectId();
            campaigns.push({ ...doc, _id });
            return { insertedId: _id };
          },
          async findOne(q) {
            return (
              campaigns.find((c) => c._id.toString() === q._id?.toString()) ??
              null
            );
          },
          find(q = {}) {
            return {
              skip() {
                return this;
              },
              limit() {
                return this;
              },
              toArray: async () =>
                campaigns.filter((c) => {
                  if (
                    q.studyId &&
                    c.studyId?.toString() !== q.studyId.toString()
                  )
                    return false;
                  if (q.status && c.status !== q.status) return false;
                  return true;
                }),
            };
          },
          async findOneAndUpdate(q, update, opts) {
            const idx = campaigns.findIndex(
              (c) => c._id.toString() === q._id?.toString()
            );
            if (idx === -1) return null;
            if (update.$set) Object.assign(campaigns[idx], update.$set);
            return opts?.returnDocument === 'after'
              ? { ...campaigns[idx] }
              : null;
          },
        };
      }
      if (name === 'deviceTokens') {
        return {
          find(q = {}) {
            return {
              toArray: async () =>
                deviceTokens.filter((t) =>
                  q.userId?.$in ? q.userId.$in.includes(t.userId) : true
                ),
            };
          },
        };
      }
      return {
        insertOne: async () => ({}),
        find: () => ({ toArray: async () => [] }),
        findOne: async () => null,
        countDocuments: async () => 0,
        aggregate: () => ({ toArray: async () => [] }),
      };
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const mockDb = createMockDb();

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, res, next) => {
    req.user = { sub: 'admin-user' };
    next();
  });
  testApp.use(
    '/api/v1/admin/notifications',
    createNotificationCampaignRouter({
      db: mockDb,
      // Simulates a successful FCM multicast reaching every provided token.
      fcmSend: async (tokens) => tokens.length,
      // Simulates two enrolled participants for any 'all_enrolled' campaign —
      // matches the two seeded deviceTokens rows above.
      neo4jRun: async (query) => {
        if (query.includes('ENROLLED_IN'))
          return [{ userId: 'participant-1' }, { userId: 'participant-2' }];
        return [];
      },
    })
  );
  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CAMPAIGNS = '/api/v1/admin/notifications';

test('POST /admin/notifications returns the real recipientCount from sending, not the pre-send null snapshot', async () => {
  // Regression test: the route used to respond with createCampaign's return
  // value (recipientCount: null at creation time) instead of merging in
  // sendCampaign's result, so the admin UI always showed "Sent to 0
  // participants" regardless of how many were actually reached.
  const res = await post(CAMPAIGNS, {
    title: 'Reminder',
    body: 'Please complete your check-in.',
    targetType: 'all_enrolled',
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.recipientCount, 2);
  assert.strictEqual(body.status, 'sent');
  assert.ok(body.sentAt);
});

test('POST /admin/notifications returns a deliveryWarning when it reaches nobody (enrolled but no registered device)', async () => {
  // Targets an individual with no matching deviceTokens row: the campaign
  // resolves one user but zero devices, so the admin should get an actionable
  // reason rather than a bare "Sent to 0".
  const res = await post(CAMPAIGNS, {
    title: 'Reminder',
    body: 'Please complete your check-in.',
    targetType: 'individual',
    targetIds: ['participant-with-no-device'],
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.recipientCount, 0);
  assert.strictEqual(body.resolvedUserCount, 1);
  assert.strictEqual(body.tokenCount, 0);
  assert.match(body.deliveryWarning, /registered device/i);
});

test('POST /admin/notifications with a scheduledFor date does not send immediately (recipientCount stays null)', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const res = await post(CAMPAIGNS, {
    title: 'Reminder',
    body: 'Please complete your check-in.',
    targetType: 'all_enrolled',
    scheduledFor: future,
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.recipientCount, null);
  assert.strictEqual(body.status, 'scheduled');
});

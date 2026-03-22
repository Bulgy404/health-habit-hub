import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendToTokens,
  removeInvalidTokens,
  sendStudyNotification,
  dispatchDueNotifications,
  COLLECTION_DEVICE_TOKENS,
  COLLECTION_SCHEDULED,
} from '../../services/notificationService.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeMessaging({ failTokens = [], invalidTokens = [] } = {}) {
  return {
    async sendEach(messages) {
      const responses = messages.map((m) => {
        if (invalidTokens.includes(m.token)) {
          return {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          };
        }
        if (failTokens.includes(m.token)) {
          return {
            success: false,
            error: { code: 'messaging/internal-error' },
          };
        }
        return { success: true };
      });
      return { responses };
    },
  };
}

function makeDb({ deviceTokens = [], enrollments = [], scheduled = [] } = {}) {
  const store = {
    [COLLECTION_DEVICE_TOKENS]: [...deviceTokens],
    enrollments: [...enrollments],
    [COLLECTION_SCHEDULED]: [...scheduled],
  };

  return {
    collection(name) {
      return {
        find(filter = {}) {
          return {
            toArray: async () => {
              let docs = store[name] || [];
              // Apply simple filter matching
              docs = docs.filter((doc) => {
                for (const [key, val] of Object.entries(filter)) {
                  if (val && typeof val === 'object' && '$in' in val) {
                    const strVals = val.$in.map((v) => v?.toString?.() ?? v);
                    if (!strVals.includes(doc[key]?.toString?.() ?? doc[key]))
                      return false;
                  } else if (val && typeof val === 'object' && '$lte' in val) {
                    if (doc[key] > val.$lte) return false;
                  } else {
                    if (doc[key]?.toString?.() !== val?.toString?.())
                      return false;
                  }
                }
                return true;
              });
              return docs;
            },
            sort() {
              return this;
            },
          };
        },
        async deleteMany(filter) {
          const col = store[name];
          if (filter.token && filter.token.$in) {
            const toRemove = new Set(filter.token.$in);
            const before = col.length;
            store[name] = col.filter((d) => !toRemove.has(d.token));
            return { deletedCount: before - store[name].length };
          }
          return { deletedCount: 0 };
        },
        async updateOne(filter, update, opts = {}) {
          const col = store[name];
          const idx = col.findIndex(
            (d) =>
              d.userId === filter.userId ||
              d._id?.toString?.() === filter._id?.toString?.()
          );
          if (idx !== -1) {
            Object.assign(col[idx], update.$set || {});
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
          }
          if (opts.upsert) {
            col.push({ ...filter, ...(update.$set || {}) });
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
          }
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        },
        async insertOne(doc) {
          const { ObjectId } = await import('mongodb');
          doc._id = new ObjectId();
          (store[name] = store[name] || []).push(doc);
          return { insertedId: doc._id };
        },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// sendToTokens
// ──────────────────────────────────────────────────────────────────────────────

describe('sendToTokens', () => {
  it('returns sent=0, failed=0, invalidTokens=[] when messaging is null', async () => {
    const result = await sendToTokens({
      messaging: null,
      tokens: ['tok1'],
      title: 'Hello',
      body: 'World',
    });
    assert.deepEqual(result, { sent: 0, failed: 0, invalidTokens: [] });
  });

  it('returns sent=0, failed=0, invalidTokens=[] when tokens array is empty', async () => {
    const messaging = makeMessaging();
    const result = await sendToTokens({
      messaging,
      tokens: [],
      title: 'Hello',
      body: 'World',
    });
    assert.deepEqual(result, { sent: 0, failed: 0, invalidTokens: [] });
  });

  it('counts successful sends correctly', async () => {
    const messaging = makeMessaging();
    const result = await sendToTokens({
      messaging,
      tokens: ['tok1', 'tok2', 'tok3'],
      title: 'T',
      body: 'B',
    });
    assert.equal(result.sent, 3);
    assert.equal(result.failed, 0);
    assert.deepEqual(result.invalidTokens, []);
  });

  it('identifies invalid tokens and counts failures', async () => {
    const messaging = makeMessaging({ invalidTokens: ['bad-token'] });
    const result = await sendToTokens({
      messaging,
      tokens: ['good-token', 'bad-token'],
      title: 'T',
      body: 'B',
    });
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.invalidTokens, ['bad-token']);
  });

  it('counts non-invalid failures without adding to invalidTokens', async () => {
    const messaging = makeMessaging({ failTokens: ['fail-token'] });
    const result = await sendToTokens({
      messaging,
      tokens: ['fail-token'],
      title: 'T',
      body: 'B',
    });
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.invalidTokens, []);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// removeInvalidTokens
// ──────────────────────────────────────────────────────────────────────────────

describe('removeInvalidTokens', () => {
  it('removes documents whose token is in the invalidTokens list', async () => {
    const db = makeDb({
      deviceTokens: [
        { userId: 'u1', token: 'bad-token' },
        { userId: 'u2', token: 'good-token' },
      ],
    });

    await removeInvalidTokens({ db, invalidTokens: ['bad-token'] });

    const remaining = await db
      .collection(COLLECTION_DEVICE_TOKENS)
      .find()
      .toArray();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].token, 'good-token');
  });

  it('is a no-op when invalidTokens is empty', async () => {
    const db = makeDb({
      deviceTokens: [{ userId: 'u1', token: 'tok' }],
    });

    await removeInvalidTokens({ db, invalidTokens: [] });

    const remaining = await db
      .collection(COLLECTION_DEVICE_TOKENS)
      .find()
      .toArray();
    assert.equal(remaining.length, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sendStudyNotification
// ──────────────────────────────────────────────────────────────────────────────

describe('sendStudyNotification', () => {
  it('returns sent=0, failed=0 when no participants are enrolled', async () => {
    const { ObjectId } = await import('mongodb');
    const studyId = new ObjectId().toString();
    const db = makeDb({ enrollments: [], deviceTokens: [] });
    const messaging = makeMessaging();

    const result = await sendStudyNotification({
      db,
      messaging,
      studyId,
      title: 'T',
      body: 'B',
    });

    assert.deepEqual(result, { sent: 0, failed: 0 });
  });

  it('sends to tokens of enrolled participants', async () => {
    const { ObjectId } = await import('mongodb');
    const studyId = new ObjectId();
    const db = makeDb({
      enrollments: [
        { userId: 'u1', studyId },
        { userId: 'u2', studyId },
      ],
      deviceTokens: [
        { userId: 'u1', token: 'tok1' },
        { userId: 'u2', token: 'tok2' },
      ],
    });
    const messaging = makeMessaging();

    const result = await sendStudyNotification({
      db,
      messaging,
      studyId: studyId.toString(),
      title: 'T',
      body: 'B',
    });

    assert.equal(result.sent, 2);
    assert.equal(result.failed, 0);
  });

  it('removes invalid tokens after sending', async () => {
    const { ObjectId } = await import('mongodb');
    const studyId = new ObjectId();
    const db = makeDb({
      enrollments: [{ userId: 'u1', studyId }],
      deviceTokens: [{ userId: 'u1', token: 'bad-token' }],
    });
    const messaging = makeMessaging({ invalidTokens: ['bad-token'] });

    await sendStudyNotification({
      db,
      messaging,
      studyId: studyId.toString(),
      title: 'T',
      body: 'B',
    });

    const remaining = await db
      .collection(COLLECTION_DEVICE_TOKENS)
      .find()
      .toArray();
    assert.equal(remaining.length, 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// dispatchDueNotifications
// ──────────────────────────────────────────────────────────────────────────────

describe('dispatchDueNotifications', () => {
  it('marks due notifications as sent', async () => {
    const { ObjectId } = await import('mongodb');
    const studyId = new ObjectId();
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    const dueNotif = {
      _id: new ObjectId(),
      studyId,
      groupId: null,
      title: 'Due',
      body: 'Now',
      data: null,
      scheduledAt: past,
      sent: false,
    };
    const futureNotif = {
      _id: new ObjectId(),
      studyId,
      groupId: null,
      title: 'Future',
      body: 'Later',
      data: null,
      scheduledAt: future,
      sent: false,
    };

    const db = makeDb({
      enrollments: [],
      deviceTokens: [],
      scheduled: [dueNotif, futureNotif],
    });

    await dispatchDueNotifications({ db });

    const scheduled = await db
      .collection(COLLECTION_SCHEDULED)
      .find()
      .toArray();
    const due = scheduled.find(
      (n) => n._id.toString() === dueNotif._id.toString()
    );
    const fut = scheduled.find(
      (n) => n._id.toString() === futureNotif._id.toString()
    );

    assert.equal(due?.sent, true);
    assert.equal(fut?.sent, false);
  });
});

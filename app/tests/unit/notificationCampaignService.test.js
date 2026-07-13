import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createCampaign,
  sendCampaign,
  dispatchDueCampaigns,
} from '../../services/notificationCampaignService.js';

function makeDb(campaigns = [], deviceTokens = []) {
  const cStore = [...campaigns];
  const tStore = [...deviceTokens];
  return {
    collection(name) {
      if (name === 'notification_campaigns')
        return {
          async insertOne(doc) {
            const saved = { ...doc, _id: new ObjectId() };
            cStore.push(saved);
            return { insertedId: saved._id };
          },
          async findOneAndUpdate(filter, update, _opts) {
            const idx = cStore.findIndex(
              (d) => d._id?.toString() === filter._id?.toString()
            );
            if (idx === -1) return null;
            Object.assign(cStore[idx], update.$set);
            return { ...cStore[idx] };
          },
          findOne: async (filter) =>
            cStore.find((d) => d._id?.toString() === filter._id?.toString()) ??
            null,
          find: (filter = {}) => ({
            toArray: async () =>
              cStore.filter((d) => {
                if (filter.status && d.status !== filter.status) return false;
                if (
                  filter.scheduledFor?.$lte &&
                  !(d.scheduledFor <= filter.scheduledFor.$lte)
                )
                  return false;
                return true;
              }),
          }),
        };
      if (name === 'deviceTokens')
        return {
          find: (filter) => ({
            toArray: async () =>
              tStore.filter(
                (t) => filter.userId?.$in?.includes(t.userId) ?? true
              ),
          }),
        };
      if (name === 'enrollments')
        return {
          find: () => ({ toArray: async () => [] }),
        };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('createCampaign: stores campaign with draft status', async () => {
  const db = makeDb();
  const result = await createCampaign({
    db,
    createdBy: 'researcher1',
    studyId: null,
    title: 'Check in',
    body: 'How are your habits going?',
    targetType: 'all_enrolled',
    targetIds: [],
    scheduledFor: null,
  });
  assert.equal(result.status, 'draft');
  assert.equal(result.title, 'Check in');
  assert.ok(result.id);
});

test('createCampaign: sets status scheduled when scheduledFor is provided', async () => {
  const db = makeDb();
  const result = await createCampaign({
    db,
    createdBy: 'r1',
    studyId: null,
    title: 'Reminder',
    body: 'Check in',
    targetType: 'all_enrolled',
    targetIds: [],
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(result.status, 'scheduled');
});

test('sendCampaign: dispatches to provided mock sender', async () => {
  const id = new ObjectId();
  const db = makeDb(
    [
      {
        _id: id,
        title: 'Hi',
        body: 'Hello',
        targetType: 'individual',
        targetIds: ['u1'],
        status: 'draft',
        studyId: null,
        createdBy: 'r1',
        createdAt: new Date(),
        scheduledFor: null,
        sentAt: null,
        recipientCount: null,
      },
    ],
    [{ userId: 'u1', token: 'tok-abc' }]
  );

  let sent = null;
  const mockSend = async (tokens, title, body) => {
    sent = { tokens, title, body };
    return tokens.length;
  };

  const result = await sendCampaign({
    db,
    id: id.toString(),
    send: mockSend,
  });
  assert.equal(result.recipientCount, 1);
  assert.ok(sent);
  assert.deepEqual(sent.tokens, ['tok-abc']);
});

test('sendCampaign: reports resolvedUserCount and tokenCount for diagnostics', async () => {
  const id = new ObjectId();
  const db = makeDb(
    [
      {
        _id: id,
        title: 'Hi',
        body: 'Hello',
        targetType: 'individual',
        targetIds: ['u1', 'u2'], // two targeted
        status: 'draft',
        scheduledFor: null,
        sentAt: null,
        recipientCount: null,
      },
    ],
    [{ userId: 'u1', token: 'tok-abc' }] // only one has a registered device
  );

  const result = await sendCampaign({
    db,
    id: id.toString(),
    send: async (tokens) => tokens.length,
  });
  assert.equal(result.resolvedUserCount, 2);
  assert.equal(result.tokenCount, 1);
  assert.equal(result.recipientCount, 1);
});

test('sendCampaign: reaches nobody and never calls send when no devices are registered', async () => {
  const id = new ObjectId();
  const db = makeDb(
    [
      {
        _id: id,
        title: 'Hi',
        body: 'Hello',
        targetType: 'individual',
        targetIds: ['ghost'],
        status: 'draft',
        scheduledFor: null,
        sentAt: null,
        recipientCount: null,
      },
    ],
    [] // no device tokens at all
  );

  let called = false;
  const result = await sendCampaign({
    db,
    id: id.toString(),
    send: async () => {
      called = true;
      return 9;
    },
  });
  assert.equal(called, false);
  assert.equal(result.resolvedUserCount, 1);
  assert.equal(result.tokenCount, 0);
  assert.equal(result.recipientCount, 0);
});

test('dispatchDueCampaigns: sends only past-due scheduled campaigns and marks them sent', async () => {
  const dueId = new ObjectId();
  const futureId = new ObjectId();
  const cancelledId = new ObjectId();
  const db = makeDb(
    [
      {
        _id: dueId,
        title: 'Due',
        body: 'now',
        targetType: 'individual',
        targetIds: ['u1'],
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 60_000),
        sentAt: null,
        recipientCount: null,
      },
      {
        _id: futureId,
        title: 'Later',
        body: 'later',
        targetType: 'individual',
        targetIds: ['u1'],
        status: 'scheduled',
        scheduledFor: new Date(Date.now() + 3_600_000),
        sentAt: null,
        recipientCount: null,
      },
      {
        _id: cancelledId,
        title: 'Cancelled',
        body: 'x',
        targetType: 'individual',
        targetIds: ['u1'],
        status: 'cancelled',
        scheduledFor: new Date(Date.now() - 60_000),
        sentAt: null,
        recipientCount: null,
      },
    ],
    [{ userId: 'u1', token: 'tok-1' }]
  );

  const dispatched = await dispatchDueCampaigns({
    db,
    send: async (tokens) => tokens.length,
  });

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].id, dueId.toString());
  assert.equal(dispatched[0].recipientCount, 1);

  // Only the past-due one flips to 'sent'; the others are left alone.
  const state = async (oid) =>
    (await db.collection('notification_campaigns').findOne({ _id: oid }))
      .status;
  assert.equal(await state(dueId), 'sent');
  assert.equal(await state(futureId), 'scheduled');
  assert.equal(await state(cancelledId), 'cancelled');
});

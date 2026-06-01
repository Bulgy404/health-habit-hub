import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createCampaign,
  sendCampaign,
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
          async findOneAndUpdate(filter, update, opts) {
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

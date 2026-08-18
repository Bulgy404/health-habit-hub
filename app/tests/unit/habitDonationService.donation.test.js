import { test } from 'node:test';
import assert from 'node:assert';
import {
  createDonationRecord,
  markDonationOutcome,
  getPostDonationQuestionnaire,
} from '../../services/habitDonationService.js';

// Minimal in-memory Mongo-like mock scoped to what these three functions
// touch: habit_donations (insertOne/updateOne/findOne) and questionnaires
// (findOne).
function makeDb({ questionnaires = [] } = {}) {
  const habitDonations = [];
  return {
    collection(name) {
      if (name === 'habit_donations') {
        return {
          async insertOne(doc) {
            habitDonations.push({ ...doc });
            return { insertedId: 'mock-id' };
          },
          async updateOne(query, update) {
            const doc = habitDonations.find((d) => d.uuid === query.uuid);
            if (!doc) return { matchedCount: 0 };
            if (update.$set) Object.assign(doc, update.$set);
            return { matchedCount: 1 };
          },
          async findOne(query) {
            return habitDonations.find((d) => d.uuid === query.uuid) ?? null;
          },
        };
      }
      if (name === 'questionnaires') {
        return {
          async findOne(query) {
            return (
              questionnaires.find(
                (q) => q.slug === query.slug && (!query.active || q.active)
              ) ?? null
            );
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
    _habitDonations: habitDonations,
  };
}

test('createDonationRecord: writes a habit_donations doc keyed by uuid, defaulting cleanly', async () => {
  const db = makeDb();
  await createDonationRecord({ db, uuid: 'u-1', userID: 'user-1' });
  const [doc] = db._habitDonations;
  assert.equal(doc.uuid, 'u-1');
  assert.equal(doc.userId, 'user-1');
  assert.equal(doc.inputMode, 'text');
  assert.equal(doc.isHabit, null);
  assert.equal(doc.audioClip, null);
  assert.equal(doc.questionnaireSlug, null);
  assert.equal(doc.questionnaireResponseId, null);
});

test('createDonationRecord: an unrecognised inputMode falls back to text', async () => {
  const db = makeDb();
  await createDonationRecord({
    db,
    uuid: 'u-2',
    userID: 'user-1',
    inputMode: 'nonsense',
  });
  assert.equal(db._habitDonations[0].inputMode, 'text');
});

test('createDonationRecord: speech mode + questionnaire slug are persisted', async () => {
  const db = makeDb();
  await createDonationRecord({
    db,
    uuid: 'u-3',
    userID: 'user-1',
    studyId: 'study-1',
    groupId: 'group-1',
    inputMode: 'speech',
    questionnaireSlug: 'who5',
  });
  const doc = db._habitDonations[0];
  assert.equal(doc.inputMode, 'speech');
  assert.equal(doc.studyId, 'study-1');
  assert.equal(doc.groupId, 'group-1');
  assert.equal(doc.questionnaireSlug, 'who5');
});

test('markDonationOutcome: sets isHabit on the matching record', async () => {
  const db = makeDb();
  await createDonationRecord({ db, uuid: 'u-4', userID: 'user-1' });
  await markDonationOutcome({ db, uuid: 'u-4', isHabit: true });
  assert.equal(db._habitDonations[0].isHabit, true);
});

test('markDonationOutcome: never throws for an unknown uuid (best-effort)', async () => {
  const db = makeDb();
  await assert.doesNotReject(
    markDonationOutcome({ db, uuid: 'does-not-exist', isHabit: false })
  );
});

test('markDonationOutcome: never throws even if the collection call itself throws', async () => {
  const throwingDb = {
    collection() {
      return {
        updateOne: async () => {
          throw new Error('boom');
        },
      };
    },
  };
  await assert.doesNotReject(
    markDonationOutcome({ db: throwingDb, uuid: 'u-5', isHabit: true })
  );
});

test('getPostDonationQuestionnaire: returns null when no slug is configured', async () => {
  const db = makeDb();
  const result = await getPostDonationQuestionnaire({ db, slug: null });
  assert.equal(result, null);
});

test('getPostDonationQuestionnaire: returns null when the configured slug is missing or inactive', async () => {
  const db = makeDb({
    questionnaires: [{ slug: 'who5', title: 'WHO-5', active: false }],
  });
  const result = await getPostDonationQuestionnaire({ db, slug: 'who5' });
  assert.equal(result, null);
});

test('getPostDonationQuestionnaire: returns the slug when the configured questionnaire is active', async () => {
  const db = makeDb({
    questionnaires: [
      {
        slug: 'who5',
        title: 'WHO-5 Well-Being Index',
        active: true,
        scope: 'donation',
      },
    ],
  });
  const result = await getPostDonationQuestionnaire({ db, slug: 'who5' });
  assert.equal(result, 'who5');
});

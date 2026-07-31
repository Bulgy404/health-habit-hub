import { test } from 'node:test';
import assert from 'node:assert';
import {
  getPreferences,
  setInformationOverloadOptOut,
} from '../../services/userPreferencesService.js';

/** In-memory mock of the user_preferences collection with upsert semantics. */
function makeDb() {
  const store = [];
  return {
    _store: store,
    collection(name) {
      assert.equal(name, 'user_preferences');
      return {
        async findOne(filter) {
          return store.find((d) => d.userId === filter.userId) ?? null;
        },
        async updateOne(filter, update, opts) {
          let doc = store.find((d) => d.userId === filter.userId);
          if (!doc) {
            if (!opts?.upsert) return { matchedCount: 0 };
            doc = { ...(update.$setOnInsert ?? {}) };
            store.push(doc);
          }
          Object.assign(doc, update.$set ?? {});
          return { matchedCount: 1 };
        },
      };
    },
  };
}

test('getPreferences: defaults optOut to false when no doc exists', async () => {
  const db = makeDb();
  const prefs = await getPreferences({ db, userId: 'u1' });
  assert.deepEqual(prefs, { informationOverloadOptOut: false });
});

test('setInformationOverloadOptOut: upserts and reads back true', async () => {
  const db = makeDb();
  const set = await setInformationOverloadOptOut({
    db,
    userId: 'u1',
    optOut: true,
  });
  assert.deepEqual(set, { informationOverloadOptOut: true });
  const prefs = await getPreferences({ db, userId: 'u1' });
  assert.equal(prefs.informationOverloadOptOut, true);
});

test('setInformationOverloadOptOut: can be toggled back off', async () => {
  const db = makeDb();
  await setInformationOverloadOptOut({ db, userId: 'u1', optOut: true });
  await setInformationOverloadOptOut({ db, userId: 'u1', optOut: false });
  const prefs = await getPreferences({ db, userId: 'u1' });
  assert.equal(prefs.informationOverloadOptOut, false);
});

test('setInformationOverloadOptOut: coerces non-true values to false', async () => {
  const db = makeDb();
  const set = await setInformationOverloadOptOut({
    db,
    userId: 'u1',
    optOut: 'yes',
  });
  assert.equal(set.informationOverloadOptOut, false);
});

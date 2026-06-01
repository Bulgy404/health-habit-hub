import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createCue,
  listCues,
  deleteCue,
} from '../../services/cuePoolService.js';

function makeDb(cues = []) {
  const store = [...cues];
  return {
    collection(name) {
      assert.equal(name, 'cue_pools');
      return {
        async insertOne(doc) {
          const saved = { ...doc, _id: new ObjectId() };
          store.push(saved);
          return { insertedId: saved._id };
        },
        find(filter = {}) {
          const results = store.filter((d) => {
            if (filter.quality && d.quality !== filter.quality) return false;
            if (filter.language && d.language !== filter.language) return false;
            return true;
          });
          return {
            skip(n) {
              return {
                limit(m) {
                  return {
                    async toArray() {
                      return results.slice(n, n + m);
                    },
                  };
                },
              };
            },
          };
        },
        async countDocuments(filter = {}) {
          return store.filter((d) => {
            if (filter.quality && d.quality !== filter.quality) return false;
            return true;
          }).length;
        },
        async deleteOne(filter) {
          const idx = store.findIndex(
            (d) => d._id?.toString() === filter._id?.toString()
          );
          if (idx >= 0) store.splice(idx, 1);
          return { deletedCount: idx >= 0 ? 1 : 0 };
        },
      };
    },
  };
}

test('createCue: stores a cue and returns it', async () => {
  const db = makeDb();
  const result = await createCue({
    db,
    text: 'After dinner each evening',
    quality: 'high',
    dimensions: { stability: 5, salience: 4, specificity: 5 },
    domain: 'physical_activity',
    language: 'en',
  });
  assert.equal(result.text, 'After dinner each evening');
  assert.equal(result.quality, 'high');
  assert.ok(result.id);
});

test('deleteCue: removes a cue by id', async () => {
  const id = new ObjectId();
  const db = makeDb([
    {
      _id: id,
      text: 'x',
      quality: 'low',
      dimensions: {},
      domain: 'd',
      language: 'en',
      createdAt: new Date(),
    },
  ]);
  const result = await deleteCue({ db, id: id.toString() });
  assert.equal(result.deleted, true);
});

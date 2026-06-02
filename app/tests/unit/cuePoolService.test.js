import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createCue,
  listCues,
  deleteCue,
  pickAssignedCues,
  importCues,
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

// --- pickAssignedCues ---

function makePoolDb(cues = []) {
  return {
    collection(name) {
      if (name !== 'cue_pools') throw new Error(`unexpected: ${name}`);
      return {
        aggregate(pipeline) {
          const matchStage = pipeline.find(s => s.$match)?.$match ?? {};
          const sampleN = pipeline.find(s => s.$sample)?.$sample?.size ?? 1;
          const filtered = cues.filter(c =>
            !matchStage.quality || c.quality === matchStage.quality
          );
          return { toArray: async () => filtered.slice(0, sampleN) };
        },
      };
    },
  };
}

test('pickAssignedCues: returns empty array for self_selected source', async () => {
  const db = makePoolDb([]);
  const result = await pickAssignedCues({ db, cueSource: 'self_selected', cueCount: 'single' });
  assert.deepEqual(result, []);
});

test('pickAssignedCues: returns one cue for single count', async () => {
  const db = makePoolDb([
    { _id: 'c1', text: 'After dinner', quality: 'high', dimensions: { stability: 5, salience: 5, specificity: 5 }, domain: 'physical_activity', language: 'en' },
  ]);
  const result = await pickAssignedCues({ db, cueSource: 'high_quality', cueCount: 'single' });
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'After dinner');
  assert.equal(result[0].source, 'pre_rated');
});

test('pickAssignedCues: returns two cues for multi count', async () => {
  const db = makePoolDb([
    { _id: 'c1', text: 'After dinner', quality: 'low', dimensions: { stability: 2, salience: 2, specificity: 2 }, domain: 'physical_activity', language: 'en' },
    { _id: 'c2', text: 'On weekends', quality: 'low', dimensions: { stability: 2, salience: 2, specificity: 2 }, domain: 'physical_activity', language: 'en' },
  ]);
  const result = await pickAssignedCues({ db, cueSource: 'low_quality', cueCount: 'multi' });
  assert.equal(result.length, 2);
  assert.ok(result.every(c => c.source === 'pre_rated'));
});

test('pickAssignedCues: returns empty array when pool is empty', async () => {
  const db = makePoolDb([]);
  const result = await pickAssignedCues({ db, cueSource: 'high_quality', cueCount: 'single' });
  assert.deepEqual(result, []);
});

// --- importCues ---

function makeImportDb() {
  const inserted = [];
  return {
    inserted,
    collection(name) {
      if (name !== 'cue_pools') throw new Error(`unexpected: ${name}`);
      return {
        insertMany: async (docs) => {
          inserted.push(...docs);
          return { insertedCount: docs.length };
        },
      };
    },
  };
}

test('importCues: inserts valid rows and returns count', async () => {
  const mockDb = makeImportDb();
  const rows = [
    { text: 'After dinner', quality: 'high', stability: 5, salience: 5, specificity: 5, domain: 'physical_activity', language: 'en' },
    { text: 'On weekends', quality: 'low', stability: 2, salience: 2, specificity: 2, domain: 'physical_activity', language: 'de' },
  ];
  const result = await importCues({ db: mockDb, rows });
  assert.equal(result.inserted, 2);
  assert.equal(result.skipped, 0);
  assert.equal(mockDb.inserted.length, 2);
  assert.equal(mockDb.inserted[0].text, 'After dinner');
  assert.equal(mockDb.inserted[0].quality, 'high');
  assert.deepEqual(mockDb.inserted[0].dimensions, { stability: 5, salience: 5, specificity: 5 });
});

test('importCues: skips rows with missing required fields', async () => {
  const mockDb = makeImportDb();
  const rows = [
    { text: '', quality: 'high', stability: 5, salience: 5, specificity: 5, domain: 'physical_activity', language: 'en' },
    { text: 'Valid cue', quality: 'low', stability: 3, salience: 3, specificity: 3, domain: 'physical_activity', language: 'en' },
    { text: 'Bad quality', quality: 'medium', stability: 3, salience: 3, specificity: 3, domain: 'physical_activity', language: 'en' },
  ];
  const result = await importCues({ db: mockDb, rows });
  assert.equal(result.inserted, 1);
  assert.equal(result.skipped, 2);
});

test('importCues: returns inserted 0 for empty rows array', async () => {
  const mockDb = makeImportDb();
  const result = await importCues({ db: mockDb, rows: [] });
  assert.equal(result.inserted, 0);
  assert.equal(result.skipped, 0);
});

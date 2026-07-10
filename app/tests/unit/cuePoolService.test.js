import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createCue,
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
            // Mongo matches a scalar against an array field as
            // "array contains value" — mirror that here.
            if (filter.languages && !d.languages?.includes(filter.languages))
              return false;
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
    text: { en: 'After dinner each evening' },
    languages: ['en'],
    quality: 'high',
    dimensions: { stability: 5, salience: 4, specificity: 5 },
    domain: 'physical_activity',
  });
  assert.deepEqual(result.text, { en: 'After dinner each evening' });
  assert.deepEqual(result.languages, ['en']);
  assert.equal(result.quality, 'high');
  assert.ok(result.id);
});

test('deleteCue: removes a cue by id', async () => {
  const id = new ObjectId();
  const db = makeDb([
    {
      _id: id,
      text: { en: 'x' },
      languages: ['en'],
      quality: 'low',
      dimensions: { stability: 1, salience: 1, specificity: 1 },
      domain: 'd',
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
          const matchStage = pipeline.find((s) => s.$match)?.$match ?? {};
          const sampleN = pipeline.find((s) => s.$sample)?.$sample?.size ?? 1;
          const filtered = cues.filter(
            (c) => !matchStage.quality || c.quality === matchStage.quality
          );
          return { toArray: async () => filtered.slice(0, sampleN) };
        },
      };
    },
  };
}

test('pickAssignedCues: returns empty array for self_selected source', async () => {
  const db = makePoolDb([]);
  const result = await pickAssignedCues({
    db,
    cueSource: 'self_selected',
    cueCount: 'single',
  });
  assert.deepEqual(result, []);
});

test('pickAssignedCues: returns one cue for single count, resolved to the requested language', async () => {
  const db = makePoolDb([
    {
      _id: 'c1',
      text: { en: 'After dinner', de: 'Nach dem Abendessen' },
      languages: ['en', 'de'],
      quality: 'high',
      dimensions: { stability: 5, salience: 5, specificity: 5 },
      domain: 'physical_activity',
    },
  ]);
  const result = await pickAssignedCues({
    db,
    cueSource: 'high_quality',
    cueCount: 'single',
    lang: 'de',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'Nach dem Abendessen');
  assert.equal(result[0].source, 'pre_rated');
});

test('pickAssignedCues: falls back to English when the requested language is unavailable', async () => {
  const db = makePoolDb([
    {
      _id: 'c1',
      text: { en: 'After dinner' },
      languages: ['en'],
      quality: 'high',
      dimensions: { stability: 5, salience: 5, specificity: 5 },
      domain: 'physical_activity',
    },
  ]);
  const result = await pickAssignedCues({
    db,
    cueSource: 'high_quality',
    cueCount: 'single',
    lang: 'ja',
  });
  assert.equal(result[0].text, 'After dinner');
});

test('pickAssignedCues: returns two cues for multi count', async () => {
  const db = makePoolDb([
    {
      _id: 'c1',
      text: { en: 'After dinner' },
      languages: ['en'],
      quality: 'low',
      dimensions: { stability: 2, salience: 2, specificity: 2 },
      domain: 'physical_activity',
    },
    {
      _id: 'c2',
      text: { en: 'On weekends' },
      languages: ['en'],
      quality: 'low',
      dimensions: { stability: 2, salience: 2, specificity: 2 },
      domain: 'physical_activity',
    },
  ]);
  const result = await pickAssignedCues({
    db,
    cueSource: 'low_quality',
    cueCount: 'multi',
  });
  assert.equal(result.length, 2);
  assert.ok(result.every((c) => c.source === 'pre_rated'));
});

test('pickAssignedCues: returns empty array when pool is empty', async () => {
  const db = makePoolDb([]);
  const result = await pickAssignedCues({
    db,
    cueSource: 'high_quality',
    cueCount: 'single',
  });
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

test('importCues: inserts valid wide-format rows and returns count', async () => {
  const mockDb = makeImportDb();
  const rows = [
    {
      text_en: 'After dinner',
      quality: 'high',
      stability: '5',
      salience: '5',
      specificity: '5',
      domain: 'physical_activity',
    },
    {
      text_de: 'Am Wochenende',
      quality: 'low',
      stability: '2',
      salience: '2',
      specificity: '2',
      domain: 'physical_activity',
    },
  ];
  const result = await importCues({ db: mockDb, rows });
  assert.equal(result.inserted, 2);
  assert.equal(result.skipped, 0);
  assert.equal(mockDb.inserted.length, 2);
  assert.deepEqual(mockDb.inserted[0].text, { en: 'After dinner' });
  assert.deepEqual(mockDb.inserted[0].languages, ['en']);
  assert.equal(mockDb.inserted[0].quality, 'high');
  assert.deepEqual(mockDb.inserted[0].dimensions, {
    stability: 5,
    salience: 5,
    specificity: 5,
  });
  assert.deepEqual(mockDb.inserted[1].text, { de: 'Am Wochenende' });
  assert.deepEqual(mockDb.inserted[1].languages, ['de']);
});

test('importCues: a row with multiple language columns gets all of them', async () => {
  const mockDb = makeImportDb();
  const rows = [
    {
      text_en: 'After dinner',
      text_de: 'Nach dem Abendessen',
      quality: 'high',
      stability: '3',
      salience: '3',
      specificity: '3',
      domain: 'physical_activity',
    },
  ];
  const result = await importCues({ db: mockDb, rows });
  assert.equal(result.inserted, 1);
  assert.deepEqual(mockDb.inserted[0].text, {
    en: 'After dinner',
    de: 'Nach dem Abendessen',
  });
  assert.deepEqual(mockDb.inserted[0].languages.sort(), ['de', 'en']);
});

test('importCues: skips rows with missing required fields', async () => {
  const mockDb = makeImportDb();
  const rows = [
    {
      // no text_* column filled in at all
      quality: 'high',
      stability: '5',
      salience: '5',
      specificity: '5',
      domain: 'physical_activity',
    },
    {
      text_en: 'Valid cue',
      quality: 'low',
      stability: '3',
      salience: '3',
      specificity: '3',
      domain: 'physical_activity',
    },
    {
      text_en: 'Bad quality',
      quality: 'medium',
      stability: '3',
      salience: '3',
      specificity: '3',
      domain: 'physical_activity',
    },
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

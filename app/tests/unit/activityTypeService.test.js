import { test } from 'node:test';
import assert from 'node:assert';

import {
  listActivityTypes,
  createActivityType,
  updateActivityType,
  deleteActivityType,
} from '../../services/activityTypeService.js';

function makeDb(initial = []) {
  const docs = [...initial];
  return {
    collection() {
      return {
        async findOne(filter) {
          return docs.find((d) => d.key === filter.key) ?? null;
        },
        async insertOne(doc) {
          docs.push(doc);
        },
        async updateOne(filter, update) {
          const doc = docs.find((d) => d.key === filter.key);
          if (!doc) return { matchedCount: 0 };
          Object.assign(doc, update.$set);
          return { matchedCount: 1 };
        },
        async deleteOne(filter) {
          const idx = docs.findIndex((d) => d.key === filter.key);
          if (idx === -1) return { deletedCount: 0 };
          docs.splice(idx, 1);
          return { deletedCount: 1 };
        },
        find(filter = {}) {
          const results = docs.filter((d) =>
            filter.isDefault === undefined
              ? true
              : d.isDefault === filter.isDefault
          );
          return {
            sort() {
              return this;
            },
            async toArray() {
              return results;
            },
          };
        },
      };
    },
  };
}

test('createActivityType stores all five language labels', async () => {
  const db = makeDb();
  const result = await createActivityType(db, {
    key: 'swimming',
    label_en: 'Swimming',
    label_de: 'Schwimmen',
    label_ja: '水泳',
    label_fr: 'Natation',
    label_nl: 'Zwemmen',
    isDefault: false,
  });
  assert.strictEqual(result.label_en, 'Swimming');
  assert.strictEqual(result.label_de, 'Schwimmen');
  assert.strictEqual(result.label_ja, '水泳');
  assert.strictEqual(result.label_fr, 'Natation');
  assert.strictEqual(result.label_nl, 'Zwemmen');
});

test('createActivityType defaults missing optional labels to empty strings', async () => {
  const db = makeDb();
  const result = await createActivityType(db, {
    key: 'swimming',
    label_en: 'Swimming',
    isDefault: false,
  });
  assert.strictEqual(result.label_de, '');
  assert.strictEqual(result.label_ja, '');
  assert.strictEqual(result.label_fr, '');
  assert.strictEqual(result.label_nl, '');
});

test('createActivityType rejects a duplicate key', async () => {
  const db = makeDb([{ key: 'swimming', label_en: 'Swimming' }]);
  const result = await createActivityType(db, {
    key: 'swimming',
    label_en: 'Swimming again',
  });
  assert.strictEqual(result.status, 409);
});

test('updateActivityType patches only the supplied label fields', async () => {
  const db = makeDb([
    {
      key: 'swimming',
      label_en: 'Swimming',
      label_de: '',
      label_fr: '',
      label_nl: '',
      isDefault: false,
    },
  ]);
  const result = await updateActivityType(db, 'swimming', {
    label_fr: 'Natation',
    label_nl: 'Zwemmen',
  });
  assert.deepStrictEqual(result, { ok: true });

  const [doc] = await (await db.collection()).find({}).toArray();
  assert.strictEqual(doc.label_en, 'Swimming');
  assert.strictEqual(doc.label_fr, 'Natation');
  assert.strictEqual(doc.label_nl, 'Zwemmen');
});

test('updateActivityType returns notFound for an unknown key', async () => {
  const db = makeDb();
  const result = await updateActivityType(db, 'missing', { label_en: 'X' });
  assert.deepStrictEqual(result, { notFound: true });
});

test('listActivityTypes returns seeded entries', async () => {
  const db = makeDb([
    { key: 'walking', label_en: 'Walking', isDefault: true },
    { key: 'swimming', label_en: 'Swimming', isDefault: false },
  ]);
  const types = await listActivityTypes(db);
  assert.strictEqual(types.length, 2);
});

test('deleteActivityType removes the entry', async () => {
  const db = makeDb([{ key: 'swimming', label_en: 'Swimming' }]);
  const result = await deleteActivityType(db, 'swimming');
  assert.deepStrictEqual(result, { deleted: true });
  const types = await listActivityTypes(db);
  assert.strictEqual(types.length, 0);
});

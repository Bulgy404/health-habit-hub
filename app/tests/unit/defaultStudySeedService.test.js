import { test } from 'node:test';
import assert from 'node:assert';
import {
  seedDefaultQuestionnaires,
  seedDefaultStudy,
} from '../../services/defaultStudySeedService.js';

// Regression coverage: neither the manual seed script (scripts/seed-local.js)
// nor a fresh Mongo volume ever populated the `questionnaires` collection or
// a default study automatically — a deploy that skipped `make seed` hit
// "failed to load questionnaires" and had no default study to enroll
// participants into. These functions now run on every app boot (see
// adminRouter.js) to make that state self-healing.

function makeDb() {
  const stores = { questionnaires: new Map(), studies: new Map() };
  function collection(name) {
    const store = stores[name];
    return {
      async updateOne(filter, update) {
        const existing = [...store.values()].find(
          (d) => d.slug === filter.slug
        );
        if (existing) {
          Object.assign(existing, update.$set);
        } else {
          const doc = {
            _id: `${name}-${store.size + 1}`,
            ...update.$set,
            ...update.$setOnInsert,
          };
          store.set(doc._id, doc);
        }
      },
      async findOne(filter) {
        if (filter.slug !== undefined) {
          return [...store.values()].find((d) => d.slug === filter.slug) ?? null;
        }
        if (filter.isDefault !== undefined) {
          return (
            [...store.values()].find((d) => d.isDefault === filter.isDefault) ??
            null
          );
        }
        return null;
      },
      async insertOne(doc) {
        const _id = `${name}-${store.size + 1}`;
        store.set(_id, { _id, ...doc });
        return { insertedId: _id };
      },
    };
  }
  return { collection, stores };
}

test('seedDefaultQuestionnaires: inserts sliq, rand-36 and srhi by slug', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  const slugs = [...db.stores.questionnaires.values()].map((d) => d.slug).sort();
  assert.deepStrictEqual(slugs, ['rand-36', 'sliq', 'srhi']);
});

test('seedDefaultQuestionnaires: is idempotent (re-run does not duplicate)', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultQuestionnaires(db);
  assert.strictEqual(db.stores.questionnaires.size, 3);
});

test('seedDefaultStudy: creates a default study linking sliq + rand-36 (not srhi)', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultStudy(db);

  const study = [...db.stores.studies.values()].find((s) => s.isDefault);
  assert.ok(study, 'default study should exist');
  assert.strictEqual(study.groups.length, 4);

  const linkedSlugs = study.questionnaires
    .map((id) =>
      [...db.stores.questionnaires.values()].find((q) => q._id === id)
    )
    .map((q) => q.slug)
    .sort();
  assert.deepStrictEqual(linkedSlugs, ['rand-36', 'sliq']);
});

test('seedDefaultStudy: no-ops if a default study already exists', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultStudy(db);
  await seedDefaultStudy(db);
  const defaults = [...db.stores.studies.values()].filter((s) => s.isDefault);
  assert.strictEqual(defaults.length, 1);
});

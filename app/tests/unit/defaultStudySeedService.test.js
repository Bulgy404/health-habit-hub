import { test } from 'node:test';
import assert from 'node:assert';
import {
  seedDefaultQuestionnaires,
  seedDefaultStudy,
  retireLegacySrhiLibraryEntry,
} from '../../services/defaultStudySeedService.js';

// Regression coverage: neither the manual seed script (scripts/seed-local.js)
// nor a fresh Mongo volume ever populated the `questionnaires` collection or
// a default study automatically — a deploy that skipped `make seed` hit
// "failed to load questionnaires" and had no default study to enroll
// participants into. seedDefaultQuestionnaires/seedDefaultStudy now run on
// every app boot (see adminRouter.js) to make that state self-healing — but
// seed a default study with NO study-scoped questionnaires (SLIQ, RAND-36)
// enabled; an admin must explicitly turn each one on. SRHI is unconditional
// (see intentionsRouter.js) and has no assignment to seed.

function makeDb() {
  const stores = {
    questionnaires: new Map(),
    studies: new Map(),
    questionnaire_assignments: new Map(),
  };
  // Shallow equality over the filter's own keys (handles both slug-keyed
  // questionnaire upserts and the compound assignment upsert filter).
  const matches = (doc, filter) =>
    Object.keys(filter).every((k) => doc[k] === filter[k]);
  function collection(name) {
    const store = stores[name];
    return {
      async updateOne(filter, update) {
        const existing = [...store.values()].find((d) => matches(d, filter));
        if (existing) {
          Object.assign(existing, update.$set);
        } else {
          const doc = {
            _id: `${name}-${store.size + 1}`,
            ...update.$setOnInsert,
            ...update.$set,
          };
          store.set(doc._id, doc);
        }
      },
      async findOne(filter) {
        if (filter.slug !== undefined) {
          return (
            [...store.values()].find((d) => d.slug === filter.slug) ?? null
          );
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
      async deleteMany(filter) {
        let deletedCount = 0;
        for (const [id, doc] of [...store.entries()]) {
          if (matches(doc, filter)) {
            store.delete(id);
            deletedCount++;
          }
        }
        return { deletedCount };
      },
    };
  }
  return { collection, stores };
}

test('seedDefaultQuestionnaires: inserts sliq and rand-36 by slug', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  const slugs = [...db.stores.questionnaires.values()]
    .map((d) => d.slug)
    .sort();
  assert.deepStrictEqual(slugs, ['rand-36', 'sliq']);
});

test('seedDefaultQuestionnaires: is idempotent (re-run does not duplicate)', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultQuestionnaires(db);
  assert.strictEqual(db.stores.questionnaires.size, 2);
});

test('retireLegacySrhiLibraryEntry: removes a leftover srhi questionnaire doc and its assignments', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  db.stores.questionnaires.set('q-srhi', { _id: 'q-srhi', slug: 'srhi' });
  db.stores.questionnaire_assignments.set('a-srhi', {
    _id: 'a-srhi',
    questionnaireSlug: 'srhi',
    active: false,
  });

  await retireLegacySrhiLibraryEntry(db);

  const slugs = [...db.stores.questionnaires.values()].map((d) => d.slug);
  assert.ok(!slugs.includes('srhi'));
  assert.strictEqual(db.stores.questionnaire_assignments.size, 0);
});

test('retireLegacySrhiLibraryEntry: no-op when nothing srhi-related exists', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await retireLegacySrhiLibraryEntry(db);
  assert.strictEqual(db.stores.questionnaires.size, 2);
});

test('seedDefaultStudy: creates a default study with no questionnaires enabled', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultStudy(db);

  const study = [...db.stores.studies.values()].find((s) => s.isDefault);
  assert.ok(study, 'default study should exist');
  assert.strictEqual(study.groups.length, 1);
  assert.deepStrictEqual(study.questionnaires, []);

  // Nothing pre-assigns/activates any questionnaire for the new default study.
  assert.strictEqual(db.stores.questionnaire_assignments.size, 0);
});

test('seedDefaultStudy: idempotent — exactly one default study', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultStudy(db);
  await seedDefaultStudy(db);
  const defaults = [...db.stores.studies.values()].filter((s) => s.isDefault);
  assert.strictEqual(defaults.length, 1);
});

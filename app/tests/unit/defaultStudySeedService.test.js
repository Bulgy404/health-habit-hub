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
    };
  }
  return { collection, stores };
}

test('seedDefaultQuestionnaires: inserts sliq, rand-36 and srhi by slug', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  const slugs = [...db.stores.questionnaires.values()]
    .map((d) => d.slug)
    .sort();
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
  assert.strictEqual(study.groups.length, 1);

  const linkedSlugs = study.questionnaires
    .map((id) =>
      [...db.stores.questionnaires.values()].find((q) => q._id === id)
    )
    .map((q) => q.slug)
    .sort();
  assert.deepStrictEqual(linkedSlugs, ['rand-36', 'sliq']);
});

test('seedDefaultStudy: adds an SRHI assignment flagged deliverOnHabitCreation', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultStudy(db);

  const assignments = [...db.stores.questionnaire_assignments.values()];
  const srhi = assignments.find((a) => a.questionnaireSlug === 'srhi');
  assert.ok(srhi, 'SRHI assignment should be created');
  assert.strictEqual(srhi.deliverOnHabitCreation, true);
  assert.strictEqual(srhi.active, true);
  assert.strictEqual(srhi.groupId, null);
});

test('seedDefaultStudy: idempotent — one default study, one SRHI assignment', async () => {
  const db = makeDb();
  await seedDefaultQuestionnaires(db);
  await seedDefaultStudy(db);
  await seedDefaultStudy(db);
  const defaults = [...db.stores.studies.values()].filter((s) => s.isDefault);
  assert.strictEqual(defaults.length, 1);
  const srhiAssignments = [
    ...db.stores.questionnaire_assignments.values(),
  ].filter((a) => a.questionnaireSlug === 'srhi');
  assert.strictEqual(srhiAssignments.length, 1);
});

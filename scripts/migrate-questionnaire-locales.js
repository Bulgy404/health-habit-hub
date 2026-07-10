#!/usr/bin/env node
/**
 * One-time migration: wraps flat-string questionnaire content (title,
 * description, question text, option labels) into locale-text maps
 * (`{ en: '<original>' }`) and sets `languages: ['en']`.
 *
 * The 3 built-in library questionnaires (SLIQ, RAND-36, SRHI) re-seed
 * themselves into the new shape automatically on every server boot (see
 * defaultStudySeedService.js's seedDefaultQuestionnaires, which upserts
 * app/db/seed/questionnaires.json — already migrated — by slug on every
 * request). This script exists for any *custom* questionnaire an admin
 * created before this migration, which isn't covered by that reseed.
 *
 * Idempotent — a document whose `title` is already an object is left alone,
 * so this is safe to run more than once (e.g. across multiple deploys).
 *
 * Run once: node scripts/migrate-questionnaire-locales.js
 */
import { MongoClient } from 'mongodb';
import { migrateQuestionnaireDoc } from './lib/questionnaireLocaleMigration.js';

const MONGO_URI =
  process.env.MONGO_URI ||
  `mongodb://${process.env.MONGO_USER || ''}:${process.env.MONGO_PASSWORD || ''}@${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || '27017'}/hhh?authSource=admin`;

const DB_NAME = process.env.MONGO_DB || 'hhh';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const collection = db.collection('questionnaires');
    // Only plain-string titles need migrating — already-migrated docs (or
    // ones seeded fresh from the updated seed file) have an object title.
    const cursor = collection.find({ title: { $type: 'string' } });
    let migrated = 0;
    for await (const doc of cursor) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: migrateQuestionnaireDoc(doc) }
      );
      migrated += 1;
    }
    console.log(`Migrated ${migrated} questionnaire document(s).`);
  } finally {
    await client.close();
  }
}

// Only run when executed directly (`node scripts/migrate-questionnaire-locales.js`),
// not when this module might be imported elsewhere.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  });
}

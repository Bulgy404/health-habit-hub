#!/usr/bin/env node
/**
 * Seed script: inserts SLIQ and RAND-36 questionnaire definitions into MongoDB.
 * Safe to re-run — uses upsert by slug.
 *
 * Usage:
 *   MONGO_URL=mongodb://localhost:27017 MONGO_DB=hhh node mongo/seed/seed-questionnaires.js
 */

import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB || 'hhh';

async function seed() {
  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('questionnaires');

    const data = JSON.parse(
      readFileSync(join(__dirname, 'questionnaires.json'), 'utf8')
    );

    let upserted = 0;
    for (const doc of data) {
      const { _id, ...rest } = doc;
      await collection.updateOne(
        { slug: rest.slug },
        {
          $set: { ...rest, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
      upserted++;
      console.log(
        `  Upserted: ${rest.slug} (${rest.questions.length} questions)`
      );
    }

    console.log(
      `\nSeed complete — ${upserted} questionnaires upserted into ${dbName}.questionnaires`
    );
  } finally {
    await client.close();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

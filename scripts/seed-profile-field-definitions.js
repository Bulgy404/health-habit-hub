#!/usr/bin/env node
/**
 * seed-profile-field-definitions.js
 *
 * One-time (idempotent) seed script that inserts the initial profile field
 * definitions into the `profile_field_definitions` MongoDB collection.
 * Safe to run multiple times — all writes use upsert.
 *
 * Usage (from repo root):
 *   node scripts/seed-profile-field-definitions.js
 *   node scripts/seed-profile-field-definitions.js --dry-run
 *
 * Environment variables:
 *   MONGO_HOST        MongoDB hostname      (default: localhost)
 *   MONGO_PORT        MongoDB port          (default: 27017)
 *   MONGO_USER        MongoDB username      (default: admin)
 *   MONGO_PASSWORD    MongoDB password      (default: password)
 *   MONGO_DB          MongoDB database name (default: surveyjs)
 *   MONGO_AUTH_SOURCE MongoDB auth source   (default: admin)
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load mongodb from app/node_modules (scripts/ has no node_modules of its own)
const appRequire = createRequire(resolve(__dirname, '../app/package.json'));
const { MongoClient } = appRequire('mongodb');

// ── Environment variables ──────────────────────────────────────────────────

const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
const MONGO_USER = process.env.MONGO_USER || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'password';
const MONGO_DB = process.env.MONGO_DB || 'surveyjs';
const MONGO_AUTH_SOURCE = process.env.MONGO_AUTH_SOURCE || 'admin';

// ── Field definitions to seed ──────────────────────────────────────────────

/** @type {Array<{fieldId: string, label: string, type: string, options: string[], required: boolean, order: number}>} */
const FIELD_DEFINITIONS = [
  {
    fieldId: 'birthday',
    label: 'When were you born?',
    type: 'date',
    options: [],
    required: false,
    order: 1,
  },
  {
    fieldId: 'gender',
    label: 'What is your gender?',
    type: 'select',
    options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    required: false,
    order: 2,
  },
];

// ── Dry-run flag ───────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run');

// ── Seed logic ─────────────────────────────────────────────────────────────

/**
 * Upserts profile field definitions into MongoDB.
 * Uses $setOnInsert for createdAt (only written on first insert) and
 * $set for all mutable fields + updatedAt (written on every upsert).
 *
 * @returns {Promise<void>}
 */
async function seedProfileFieldDefinitions() {
  if (isDryRun) {
    console.log('[dry-run] Would upsert the following profile field definitions:');
    for (const def of FIELD_DEFINITIONS) {
      console.log(`[dry-run]   fieldId="${def.fieldId}"`, JSON.stringify(def, null, 2));
    }
    console.log('[dry-run] No changes made to the database.');
    return;
  }

  const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    const collection = db.collection('profile_field_definitions');

    const now = new Date();

    for (const def of FIELD_DEFINITIONS) {
      const { fieldId, ...fields } = def;

      const result = await collection.updateOne(
        { fieldId },
        {
          $set: {
            ...fields,
            updatedAt: now,
          },
          $setOnInsert: {
            fieldId,
            createdAt: now,
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        console.log(`[mongo] inserted  profile field "${fieldId}"`);
      } else if (result.matchedCount > 0) {
        console.log(`[mongo] already existed — updated  profile field "${fieldId}"`);
      } else {
        // Should not happen with upsert, but guard anyway
        console.warn(`[mongo] unexpected result for fieldId="${fieldId}":`, result);
      }
    }

    console.log('[mongo] Done.');
  } finally {
    await client.close();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Seed: profile_field_definitions ===');
  if (isDryRun) {
    console.log('(dry-run mode — no DB writes will occur)\n');
  }

  try {
    await seedProfileFieldDefinitions();
    console.log('\nSeed completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
  }
}

main();

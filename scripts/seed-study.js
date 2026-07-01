#!/usr/bin/env node
/**
 * seed-study.js
 *
 * Ensures study-management MongoDB indexes exist and seeds the default study
 * (with 4 groups) on a clean install. All operations are idempotent.
 *
 * Usage (from repo root):
 *   node scripts/seed-study.js
 *
 * Or add to app/package.json scripts:
 *   "seed:study": "node ../scripts/seed-study.js"
 *
 * Environment variables:
 *   MONGO_HOST              MongoDB hostname           (default: localhost)
 *   MONGO_PORT              MongoDB port               (default: 27017)
 *   MONGO_USER              MongoDB username           (default: admin)
 *   MONGO_PASSWORD          MongoDB password           (default: password)
 *   MONGO_DB                MongoDB database name      (default: surveyjs)
 *   MONGO_AUTH_SOURCE       MongoDB auth source        (default: admin)
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load mongodb from app/node_modules (scripts/ has no node_modules of its own)
const appRequire = createRequire(resolve(__dirname, '../app/package.json'));
const { MongoClient, ObjectId } = appRequire('mongodb');

// ── Environment variables ──────────────────────────────────────────────────
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
const MONGO_USER = process.env.MONGO_USER || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'password';
const MONGO_DB = process.env.MONGO_DB || 'surveyjs';
const MONGO_AUTH_SOURCE = process.env.MONGO_AUTH_SOURCE || 'admin';

// ── Default study definition ───────────────────────────────────────────────

const DEFAULT_STUDY_NAME = 'HHH Default Study';
const DEFAULT_STUDY_DESCRIPTION =
  'The default study used when no specific study code is provided during onboarding.';

// Default group config: all features enabled, unrestricted.
// Researchers can update per-group config via the admin portal
// (PATCH /admin/studies/:id/groups/:groupId/config).
const DEFAULT_GROUPS = [
  {
    index: 1,
    label: 'Group 1',
    cueConfig: null,
    activityTypeConfig: null,
    reminderConfig: { enabled: true, fixedTime: null },
    autoDonate: false,
  },
  {
    index: 2,
    label: 'Group 2',
    cueConfig: null,
    activityTypeConfig: null,
    reminderConfig: { enabled: true, fixedTime: null },
    autoDonate: false,
  },
  {
    index: 3,
    label: 'Group 3',
    cueConfig: null,
    activityTypeConfig: null,
    reminderConfig: { enabled: true, fixedTime: null },
    autoDonate: false,
  },
  {
    index: 4,
    label: 'Group 4',
    cueConfig: null,
    activityTypeConfig: null,
    reminderConfig: { enabled: true, fixedTime: null },
    autoDonate: false,
  },
];

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    console.log(`[mongo] Connected to ${MONGO_DB}`);

    await ensureIndexes(db);
    await seedDefaultStudy(db);

    console.log('\n[seed-study] Done.');
  } finally {
    await client.close();
  }
}

async function ensureIndexes(db) {
  console.log('\n[mongo] Ensuring indexes...');

  // studies: partial unique index — at most one document may have isDefault: true
  await db
    .collection('studies')
    .createIndex(
      { isDefault: 1 },
      {
        unique: true,
        partialFilterExpression: { isDefault: true },
        name: 'studies_isDefault_unique',
      }
    );
  console.log('  ✓ studies.isDefault (partial unique)');

  // studyCodes: unique on code
  await db
    .collection('studyCodes')
    .createIndex({ code: 1 }, { unique: true, name: 'studyCodes_code_unique' });
  await db
    .collection('studyCodes')
    .createIndex({ studyId: 1 }, { name: 'studyCodes_studyId' });
  console.log('  ✓ studyCodes.code (unique), studyCodes.studyId');

  // enrollments: unique on userId — one active enrollment per user
  await db
    .collection('enrollments')
    .createIndex(
      { userId: 1 },
      { unique: true, name: 'enrollments_userId_unique' }
    );
  await db
    .collection('enrollments')
    .createIndex({ studyId: 1 }, { name: 'enrollments_studyId' });
  console.log('  ✓ enrollments.userId (unique), enrollments.studyId');
}

async function seedDefaultStudy(db) {
  console.log('\n[mongo] Seeding default study...');

  const existing = await db.collection('studies').findOne({ isDefault: true });
  if (existing) {
    console.log(
      `  ✓ Default study already exists: "${existing.name}" (${existing._id})`
    );
    return;
  }

  const now = new Date();
  const groups = DEFAULT_GROUPS.map(
    ({ index, label, cueConfig, activityTypeConfig, reminderConfig, autoDonate }) => ({
      id: new ObjectId(),
      label,
      index,
      cueConfig,
      activityTypeConfig,
      reminderConfig,
      autoDonate,
    })
  );

  const result = await db.collection('studies').insertOne({
    name: DEFAULT_STUDY_NAME,
    description: DEFAULT_STUDY_DESCRIPTION,
    isDefault: true,
    isActive: true,
    groups,
    questionnaires: [],
    createdAt: now,
    updatedAt: now,
  });

  console.log(
    `  ✓ Default study created: "${DEFAULT_STUDY_NAME}" (${result.insertedId})`
  );
  console.log(
    `    Groups: ${groups.map((g) => `${g.index}=${g.label}`).join(', ')}`
  );
}

main().catch((err) => {
  console.error('[seed-study] Fatal error:', err);
  process.exit(1);
});

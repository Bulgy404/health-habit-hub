#!/usr/bin/env node
/**
 * seed-local.js
 *
 * Populates MongoDB and Neo4j with baseline seed data: questionnaires,
 * surveys, the default study, and the habit graph. Contains no test
 * accounts or demo participants, so it is safe for production deployments.
 * Safe to run multiple times — all operations are idempotent.
 *
 * Usage (from app/ directory via npm):
 *   npm run seed
 *
 * Or directly:
 *   node scripts/seed-local.js   (from repo root)
 *
 * Environment variables:
 *   MONGO_HOST              MongoDB hostname           (default: localhost)
 *   MONGO_PORT              MongoDB port               (default: 27017)
 *   MONGO_USER              MongoDB username           (default: admin)
 *   MONGO_PASSWORD          MongoDB password           (default: password)
 *   MONGO_DB                MongoDB database name      (default: surveyjs)
 *   MONGO_AUTH_SOURCE       MongoDB auth source        (default: admin)
 *   NEO4J_HTTP              Neo4j HTTP API base URL    (default: http://localhost:7474)
 *   NEO4J_USER              Neo4j username             (default: neo4j)
 *   NEO4J_PASSWORD          Neo4j password             (default: password)
 *
 * Notes:
 *   - Neo4j can take 40-60s to start; the script polls with retries before proceeding.
 *   - MongoDB client is loaded from app/node_modules via createRequire.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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

const NEO4J_HTTP = process.env.NEO4J_HTTP || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// ── Neo4j helpers ──────────────────────────────────────────────────────────

function neo4jBasicAuth() {
  return (
    'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASSWORD}`).toString('base64')
  );
}

async function neo4jQuery(cypher, params = {}) {
  const res = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: neo4jBasicAuth(),
    },
    body: JSON.stringify({
      statements: [{ statement: cypher, parameters: params }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Neo4j HTTP ${res.status} for query "${cypher.slice(0, 60)}…": ${text}`
    );
  }
  const data = await res.json();
  if (data.errors && data.errors.length > 0) {
    throw new Error(`Neo4j error: ${data.errors[0].message}`);
  }
  return data.results;
}

async function waitForNeo4j(maxAttempts = 30, delayMs = 3000) {
  console.log('[neo4j] Waiting for Neo4j to be ready...');
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: neo4jBasicAuth(),
        },
        body: JSON.stringify({ statements: [{ statement: 'RETURN 1' }] }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.errors || data.errors.length === 0) {
          console.log('[neo4j] Ready.');
          return;
        }
      }
    } catch (_) {
      // connection refused or network error — not ready yet
    }
    if (i < maxAttempts) {
      console.log(
        `[neo4j] Not ready (attempt ${i}/${maxAttempts}), retrying in ${delayMs / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `Neo4j did not become ready after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s).`
  );
}

function parseCypherStatements(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return raw
    .split(';')
    .map((stmt) =>
      stmt
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
        .trim()
    )
    .filter(Boolean);
}

// ── MongoDB seeding ────────────────────────────────────────────────────────

async function seedMongo() {
  console.log('\n[mongo] Seeding MongoDB questionnaires...');
  const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });
  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    const collection = db.collection('questionnaires');

    // Single source of truth — same file app/services/defaultStudySeedService.js
    // upserts on every backend boot. (A separate, drifted copy used to live at
    // mongo/seed/questionnaires.json; it was missing i18n and still had the
    // retired SRHI library entry — removed rather than kept in sync by hand.)
    const questionnaires = JSON.parse(
      readFileSync(
        resolve(__dirname, '../app/db/seed/questionnaires.json'),
        'utf8'
      )
    );

    for (const q of questionnaires) {
      // eslint-disable-next-line no-unused-vars
      const { _id, ...doc } = q;
      const result = await collection.replaceOne({ slug: doc.slug }, doc, {
        upsert: true,
      });
      const action = result.upsertedCount ? 'inserted' : 'updated';
      console.log(`[mongo]   questionnaire "${doc.slug}" ${action}`);
    }
    // Backfill isLibrary: true on any existing library questionnaires missing the flag
    const backfill = await collection.updateMany(
      { slug: { $in: ['sliq', 'rand-36'] }, isLibrary: { $exists: false } },
      { $set: { isLibrary: true } }
    );
    if (backfill.modifiedCount > 0) {
      console.log(
        `[mongo]   backfilled isLibrary on ${backfill.modifiedCount} questionnaire(s)`
      );
    }
    console.log('[mongo] Done.');
  } finally {
    await client.close();
  }
}

// ── Surveys seeding ────────────────────────────────────────────────────────

async function seedSurveys() {
  console.log('\n[mongo] Seeding surveys...');
  const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });
  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    const surveys = db.collection('surveys');

    const { randomUUID } = await import('node:crypto');
    const now = new Date();

    const existingDonation = await surveys.findOne({ type: 'habit-donation' });
    if (existingDonation) {
      console.log('[mongo]   habit-donation survey already exists, skipping.');
    } else {
      await surveys.insertOne({
        id: randomUUID(),
        title: 'Habit Donation',
        type: 'habit-donation',
        status: 'published',
        targetMode: 'all_participants',
        assignedGroups: [],
        jsonSchema: {},
        createdAt: now,
        updatedAt: now,
      });
      console.log('[mongo]   habit-donation survey created.');
    }

    const existingProfile = await surveys.findOne({ type: 'profile' });
    if (existingProfile) {
      console.log('[mongo]   profile survey already exists, skipping.');
    } else {
      await surveys.insertOne({
        id: randomUUID(),
        title: 'My Profile',
        type: 'profile',
        status: 'published',
        targetMode: 'all_participants',
        assignedGroups: [],
        jsonSchema: {
          locale: 'en',
          title: { en: 'Your Health Profile', de: 'Dein Gesundheitsprofil' },
          description: {
            en: 'Help us understand you better so we can improve our recommendations.',
            de: 'Hilf uns, dich besser zu verstehen, damit wir unsere Empfehlungen verbessern können.',
          },
          showProgressBar: 'top',
          pages: [
            {
              name: 'profile_info',
              elements: [
                {
                  type: 'radiogroup',
                  name: 'age_group',
                  title: {
                    en: 'What is your age group?',
                    de: 'Welche Altersgruppe trifft auf dich zu?',
                  },
                  isRequired: true,
                  choices: [
                    {
                      value: 'under_18',
                      text: { en: 'Under 18', de: 'Unter 18' },
                    },
                    { value: '18_24', text: { en: '18–24', de: '18–24' } },
                    { value: '25_34', text: { en: '25–34', de: '25–34' } },
                    { value: '35_44', text: { en: '35–44', de: '35–44' } },
                    { value: '45_54', text: { en: '45–54', de: '45–54' } },
                    { value: '55_plus', text: { en: '55+', de: '55+' } },
                  ],
                },
                {
                  type: 'checkbox',
                  name: 'health_goals',
                  title: {
                    en: 'What are your main health goals? (select all that apply)',
                    de: 'Was sind deine Gesundheitsziele? (alle zutreffenden auswählen)',
                  },
                  choices: [
                    {
                      value: 'sleep',
                      text: { en: 'Better sleep', de: 'Besserer Schlaf' },
                    },
                    {
                      value: 'exercise',
                      text: { en: 'More exercise', de: 'Mehr Bewegung' },
                    },
                    {
                      value: 'nutrition',
                      text: {
                        en: 'Healthier eating',
                        de: 'Gesündere Ernährung',
                      },
                    },
                    {
                      value: 'stress',
                      text: { en: 'Stress reduction', de: 'Stressabbau' },
                    },
                    {
                      value: 'mindfulness',
                      text: { en: 'Mindfulness', de: 'Achtsamkeit' },
                    },
                  ],
                },
                {
                  type: 'rating',
                  name: 'habit_confidence',
                  title: {
                    en: 'How confident are you in building new habits?',
                    de: 'Wie zuversichtlich bist du dabei, neue Gewohnheiten aufzubauen?',
                  },
                  rateMin: 1,
                  rateMax: 5,
                  minRateDescription: { en: 'Not at all', de: 'Gar nicht' },
                  maxRateDescription: {
                    en: 'Very confident',
                    de: 'Sehr zuversichtlich',
                  },
                  isRequired: true,
                },
              ],
            },
          ],
        },
        createdAt: now,
        updatedAt: now,
      });
      console.log('[mongo]   profile survey created.');
    }

    console.log('[mongo] Done.');
  } finally {
    await client.close();
  }
}

// ── Default study seeding ──────────────────────────────────────────────────

async function seedDefaultStudy() {
  console.log('\n[mongo] Seeding default study...');
  const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });
  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    const studies = db.collection('studies');

    const { ObjectId } = appRequire('mongodb');

    // Check if a default study already exists
    const existing = await studies.findOne({ isDefault: true });
    if (existing) {
      console.log(
        `[mongo]   default study already exists ("${existing.name}").`
      );
      return;
    }

    const now = new Date();
    const doc = {
      name: 'Default Study',
      description:
        'Pre-configured default study. Participants without a study code are enrolled here.',
      isDefault: true,
      isActive: true,
      // Organic app-store signups (no study code) all land in this one group —
      // the default study has no experimental arms to randomize into.
      groups: [
        {
          id: new ObjectId(),
          label: 'Group 1',
          index: 1,
          cueConfig: null,
          activityTypeConfig: null,
          reminderConfig: { enabled: true, fixedTime: null },
          autoDonate: false,
        },
      ],
      // No questionnaire is pre-enabled — an admin must explicitly turn each
      // one on for the study via the admin UI.
      questionnaires: [],
      createdAt: now,
      updatedAt: now,
    };

    await studies.insertOne(doc);
    console.log('[mongo]   default study "Default Study" created (no questionnaires enabled)');
  } finally {
    await client.close();
  }
}

// ── Neo4j seeding ──────────────────────────────────────────────────────────

async function seedNeo4j() {
  console.log('\n[neo4j] Seeding Neo4j...');

  await waitForNeo4j();

  // Apply constraints (idempotent — all use IF NOT EXISTS)
  console.log('[neo4j] Applying constraints...');
  const constraintsFile = resolve(
    __dirname,
    '../neo4j/init/constraints.cypher'
  );
  const statements = parseCypherStatements(constraintsFile);
  for (const stmt of statements) {
    await neo4jQuery(stmt);
  }
  console.log('[neo4j] Constraints applied.');

  // Seed 2 Habit nodes (idempotent via MERGE on uuid)
  console.log('[neo4j] Seeding Habit nodes...');
  const habits = [
    {
      uuid: 'seed-habit-001',
      sentence: 'I drink a glass of water every morning.',
      language: 'en',
      habitStrength: 3,
      translationEN: null,
      translationDE: 'Ich trinke jeden Morgen ein Glas Wasser.',
    },
    {
      uuid: 'seed-habit-002',
      sentence: 'Ich gehe täglich 30 Minuten spazieren.',
      language: 'de',
      habitStrength: 4,
      translationEN: 'I walk for 30 minutes every day.',
      translationDE: null,
    },
  ];
  for (const h of habits) {
    await neo4jQuery(
      `MERGE (h:Habit {uuid: $uuid})
       ON CREATE SET
         h.sentence      = $sentence,
         h.language      = $language,
         h.habitStrength = $habitStrength,
         h.translationEN = $translationEN,
         h.translationDE = $translationDE,
         h.created_at    = $created_at,
         h.seeded        = true`,
      {
        uuid: h.uuid,
        sentence: h.sentence,
        language: h.language,
        habitStrength: h.habitStrength,
        translationEN: h.translationEN,
        translationDE: h.translationDE,
        created_at: new Date().toISOString(),
      }
    );
    console.log(`[neo4j]   Habit "${h.uuid}" seeded`);
  }

  console.log('[neo4j] Done.');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Health Habit Hub — Seed Script ===');
  try {
    await seedMongo();
    await seedSurveys();
    await seedDefaultStudy();
    await seedNeo4j();
    console.log('\n✓ All seed steps completed successfully.');
  } catch (err) {
    console.error('\n✗ Seed failed:', err.message);
    process.exit(1);
  }
}

main();

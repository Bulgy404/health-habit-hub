#!/usr/bin/env node
/**
 * seed-local.js
 *
 * Populates MongoDB, Neo4j, and Keycloak with local development seed data.
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
 *   KEYCLOAK_URL            Keycloak base URL          (default: http://localhost:8080)
 *   KEYCLOAK_ADMIN          Keycloak admin username    (default: admin)
 *   KEYCLOAK_ADMIN_PASSWORD Keycloak admin password    (default: admin)
 *
 * Notes:
 *   - Neo4j can take 40-60s to start; the script polls with retries before proceeding.
 *   - MongoDB client is loaded from app/node_modules via createRequire.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  recoveryPhraseFromCredentials,
  recoveryPhrasesEnabled,
} from '../app/utils/recoveryPhrase.js';
import { generateTokenCard } from '../app/services/tokenCardService.js';
import {
  generateWindowsForUser,
  markWindowSubmitted,
} from '../app/services/questionnaireScheduleService.js';

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

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

const KEYCLOAK_REALM = 'hhh';

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

    const questionnaires = JSON.parse(
      readFileSync(
        resolve(__dirname, '../mongo/seed/questionnaires.json'),
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
      console.log(`[mongo]   backfilled isLibrary on ${backfill.modifiedCount} questionnaire(s)`);
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
                  title: { en: 'What is your age group?', de: 'Welche Altersgruppe trifft auf dich zu?' },
                  isRequired: true,
                  choices: [
                    { value: 'under_18', text: { en: 'Under 18', de: 'Unter 18' } },
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
                    { value: 'sleep', text: { en: 'Better sleep', de: 'Besserer Schlaf' } },
                    { value: 'exercise', text: { en: 'More exercise', de: 'Mehr Bewegung' } },
                    { value: 'nutrition', text: { en: 'Healthier eating', de: 'Gesündere Ernährung' } },
                    { value: 'stress', text: { en: 'Stress reduction', de: 'Stressabbau' } },
                    { value: 'mindfulness', text: { en: 'Mindfulness', de: 'Achtsamkeit' } },
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
                  maxRateDescription: { en: 'Very confident', de: 'Sehr zuversichtlich' },
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
    const questionnaires = db.collection('questionnaires');

    // Check if a default study already exists
    const existing = await studies.findOne({ isDefault: true });
    if (existing) {
      console.log(`[mongo]   default study already exists ("${existing.name}"), skipping.`);
      return;
    }

    // Resolve SLIQ and RAND-36 questionnaire IDs
    const sliq = await questionnaires.findOne({ slug: 'sliq' });
    const rand36 = await questionnaires.findOne({ slug: 'rand-36' });
    const qIds = [sliq?._id, rand36?._id].filter(Boolean);

    const { ObjectId } = appRequire('mongodb');
    const now = new Date();
    const doc = {
      name: 'Default Study',
      description: 'Pre-configured default study. Participants without a study code are enrolled here.',
      isDefault: true,
      isActive: true,
      groups: [
        { id: new ObjectId(), label: 'Group 1', index: 1, cueConfig: null, activityTypeConfig: null, reminderConfig: { enabled: true, fixedTime: null }, autoDonate: false },
        { id: new ObjectId(), label: 'Group 2', index: 2, cueConfig: null, activityTypeConfig: null, reminderConfig: { enabled: true, fixedTime: null }, autoDonate: false },
        { id: new ObjectId(), label: 'Group 3', index: 3, cueConfig: null, activityTypeConfig: null, reminderConfig: { enabled: true, fixedTime: null }, autoDonate: false },
        { id: new ObjectId(), label: 'Group 4', index: 4, cueConfig: null, activityTypeConfig: null, reminderConfig: { enabled: true, fixedTime: null }, autoDonate: false },
      ],
      questionnaires: qIds,
      createdAt: now,
      updatedAt: now,
    };

    await studies.insertOne(doc);
    console.log(`[mongo]   default study "Default Study" created (questionnaires: ${qIds.length})`);
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

// ── Keycloak seeding ───────────────────────────────────────────────────────

async function getKeycloakAdminToken() {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KEYCLOAK_ADMIN,
        password: KEYCLOAK_ADMIN_PASSWORD,
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to get Keycloak admin token: ${res.status} ${text}`
    );
  }
  const data = await res.json();
  return data.access_token;
}

async function seedKeycloak() {
  console.log('\n[keycloak] Seeding Keycloak...');

  const token = await getKeycloakAdminToken();
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Check if testuser already exists
  const searchRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=testuser&exact=true`,
    { headers: authHeaders }
  );
  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(
      `Failed to search Keycloak users: ${searchRes.status} ${text}`
    );
  }
  const existingUsers = await searchRes.json();

  let userId;
  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    console.log(
      `[keycloak] testuser already exists (id: ${userId}), skipping create.`
    );
  } else {
    const createRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          username: 'testuser',
          enabled: true,
          credentials: [
            { type: 'password', value: 'testpass1234', temporary: false },
          ],
          attributes: { group: [] },
        }),
      }
    );
    // 201 = created, 409 = already exists (race condition guard)
    if (!createRes.ok && createRes.status !== 409) {
      const text = await createRes.text();
      throw new Error(`Failed to create testuser: ${createRes.status} ${text}`);
    }

    // Re-fetch to get the server-assigned id
    const refetchRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=testuser&exact=true`,
      { headers: authHeaders }
    );
    const users = await refetchRes.json();
    userId = users[0].id;
    console.log(`[keycloak] testuser created (id: ${userId})`);
  }

  // Ensure the participant role exists, creating it if necessary
  let roleRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/participant`,
    { headers: authHeaders }
  );
  if (roleRes.status === 404) {
    const createRoleRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: 'participant', description: 'Study participant' }),
      }
    );
    if (!createRoleRes.ok && createRoleRes.status !== 409) {
      const text = await createRoleRes.text();
      throw new Error(`Failed to create participant role: ${createRoleRes.status} ${text}`);
    }
    console.log('[keycloak] participant role created');
    roleRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/participant`,
      { headers: authHeaders }
    );
  }
  if (!roleRes.ok) {
    const text = await roleRes.text();
    throw new Error(`Failed to fetch participant role: ${roleRes.status} ${text}`);
  }
  const participantRole = await roleRes.json();

  // Check if testuser already has the participant role
  const mappingsRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
    { headers: authHeaders }
  );
  const mappings = await mappingsRes.json();
  const alreadyHasRole =
    Array.isArray(mappings) && mappings.some((r) => r.name === 'participant');

  if (alreadyHasRole) {
    console.log('[keycloak] testuser already has participant role, skipping.');
  } else {
    await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify([participantRole]),
      }
    );
    console.log('[keycloak] participant role assigned to testuser');
  }

  console.log('[keycloak] Done.');
}

// ── DFG study test seed data ──────────────────────────────────────────────

const CUE_CONFIGS = {
  c1: { cueCount: 'single', cueSource: 'low_quality',  maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c2: { cueCount: 'multi',  cueSource: 'low_quality',  maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c3: { cueCount: 'single', cueSource: 'high_quality', maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c4: { cueCount: 'multi',  cueSource: 'high_quality', maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c5: { cueCount: 'single', cueSource: 'self_selected', maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
  c6: { cueCount: 'multi',  cueSource: 'self_selected', maxHabits: 1, behaviorOptions: ['walking','light_jogging','cycling','structured_calisthenics','yoga'] },
};

const EXAMPLE_CUES = {
  low_quality_single:  [{ text: 'When I have some free time in the evening', source: 'pre_rated', cueId: null }],
  low_quality_multi:   [{ text: 'When I get home in the evening', source: 'pre_rated', cueId: null }, { text: 'and have some free time', source: 'pre_rated', cueId: null }],
  high_quality_single: [{ text: 'After dinner each evening', source: 'pre_rated', cueId: null }],
  high_quality_multi:  [{ text: 'After dinner each evening', source: 'pre_rated', cueId: null }, { text: 'at home on weekdays', source: 'pre_rated', cueId: null }],
  self_selected_single: [{ text: 'After my morning coffee', source: 'self_selected', cueId: null }],
  self_selected_multi:  [{ text: 'After my morning coffee', source: 'self_selected', cueId: null }, { text: 'on workdays at home', source: 'self_selected', cueId: null }],
};

function fakeSrhiScore(week, seed) {
  const asymptote = 3.5 + (seed % 3) * 0.5;
  const rate = 0.12;
  return Math.min(
    7,
    parseFloat(
      (asymptote * (1 - Math.exp(-rate * week)) + 1.5 + (Math.random() - 0.5) * 0.4).toFixed(2)
    )
  );
}

async function seedTestParticipant(db) {
  const { ObjectId } = appRequire('mongodb');

  const defaultStudy = await db.collection('studies').findOne({ isDefault: true });
  const defaultStudyOid = defaultStudy?._id ?? null;
  const defaultStudyIdStr = defaultStudyOid?.toString() ?? null;
  if (!defaultStudyOid) {
    console.log('  [warn] default study not found — test enrollments will have studyId: null');
  }

  // Ensure Study node exists in Neo4j before creating enrollments
  if (defaultStudyIdStr) {
    await neo4jQuery(
      `MERGE (s:Study {uuid: $uuid}) SET s.name = $name`,
      { uuid: defaultStudyIdStr, name: defaultStudy?.name ?? 'Default Study' }
    );
  }

  const conditions = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const dropDays = { c4: 30, c6: 45 };

  for (const cond of conditions) {
    const userId = `test-${cond}`;
    const cueConfig = CUE_CONFIGS[cond];
    const cueKey = `${cueConfig.cueSource}_${cueConfig.cueCount}`;
    const cues = EXAMPLE_CUES[cueKey] ?? EXAMPLE_CUES['high_quality_single'];
    const enrolledAt = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);

    // Create ENROLLED_IN relationship in Neo4j (idempotent via MERGE)
    if (defaultStudyIdStr) {
      await neo4jQuery(
        `MERGE (u:User {userID: $userId})
         MERGE (s:Study {uuid: $studyId})
         MERGE (u)-[e:ENROLLED_IN]->(s)
         ON CREATE SET e.enrolledAt = $enrolledAt,
                       e.groupId = null,
                       e.studyCodeUsed = null`,
        {
          userId,
          studyId: defaultStudyIdStr,
          enrolledAt: enrolledAt.toISOString(),
        }
      );
    }

    const intentionId = new ObjectId();
    await db.collection('implementation_intentions').updateOne(
      { userId, status: 'active' },
      {
        $setOnInsert: {
          _id: intentionId,
          userId,
          enrollmentId: null,
          groupId: null,
          behaviorKey: 'walking',
          behaviorLabel: 'Walking',
          durationMinutes: 20,
          cues,
          intentionStatement: `${cues.map((c) => c.text).join(', ')}, I will go for a 20-min walk.`,
          status: 'active',
          createdAt: enrolledAt,
          updatedAt: enrolledAt,
        },
        $set: { studyId: defaultStudyOid },
      },
      { upsert: true }
    );

    const intention = await db.collection('implementation_intentions').findOne({ userId, status: 'active' });

    const dropDay = dropDays[cond] ?? Infinity;
    for (let d = 0; d < 56; d++) {
      if (d >= dropDay) continue;
      const enacted = Math.random() < 0.8;
      const date = new Date(enrolledAt.getTime() + d * 86400000);
      const dateStr = date.toISOString().split('T')[0];
      await db.collection('daily_behavior_logs').updateOne(
        { intentionId: intention._id, date: dateStr },
        { $setOnInsert: { intentionId: intention._id, userId, date: dateStr, enacted, loggedAt: date } },
        { upsert: true }
      );
    }

    for (let w = 1; w <= 8; w++) {
      const scheduledFor = new Date(enrolledAt.getTime() + (w - 1) * 7 * 86400000);
      const missed = dropDays[cond] != null && (w - 1) * 7 >= dropDays[cond];
      const score = missed ? null : fakeSrhiScore(w, conditions.indexOf(cond));
      const items = missed
        ? null
        : Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [
              `srhi_${i + 1}`,
              Math.min(7, Math.max(1, Math.round(score + (Math.random() - 0.5)))),
            ])
          );
      await db.collection('srhi_responses').updateOne(
        { intentionId: intention._id, weekNumber: w },
        {
          $setOnInsert: {
            intentionId: intention._id,
            userId,
            groupId: null,
            weekNumber: w,
            scheduledFor,
            submittedAt: missed ? null : new Date(scheduledFor.getTime() + 86400000),
            items,
            score,
            createdAt: scheduledFor,
          },
          $set: { studyId: defaultStudyOid },
        },
        { upsert: true }
      );
    }

    if (dropDays[cond] != null && defaultStudyIdStr) {
      const droppedAt = new Date(enrolledAt.getTime() + dropDays[cond] * 86400000);
      const lastActiveAt = new Date(enrolledAt.getTime() + (dropDays[cond] - 1) * 86400000);
      await neo4jQuery(
        `MATCH (u:User {userID: $userId})-[e:ENROLLED_IN]->(:Study {uuid: $studyId})
         SET e.droppedOutAt = $droppedAt, e.lastActiveAt = $lastActiveAt`,
        {
          userId,
          studyId: defaultStudyIdStr,
          droppedAt: droppedAt.toISOString(),
          lastActiveAt: lastActiveAt.toISOString(),
        }
      );
    }

    console.log(`  ✓ seeded test-${cond}`);
  }

  // Seed questionnaire responses (sliq + rand-36) for each test participant
  console.log('[mongo] Seeding form_responses for test participants...');
  const SLIQ_QUESTIONS = ['sliq_diet', 'sliq_physical_activity', 'sliq_smoking', 'sliq_alcohol'];
  const RAND36_QUESTIONS = Array.from({ length: 36 }, (_, i) => `rand36_q${i + 1}`);
  const baseEnrolledAt = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);

  for (let ci = 0; ci < conditions.length; ci++) {
    const userId = `test-${conditions[ci]}`;
    const responseAt = new Date(baseEnrolledAt.getTime() + 3 * 86400000);

    const sliqAnswers = Object.fromEntries(
      SLIQ_QUESTIONS.map((q, i) => [q, String((ci + i) % 4)])
    );
    const rand36Answers = Object.fromEntries(
      RAND36_QUESTIONS.map((q, i) => [q, String(((ci + i) % 5) + 1)])
    );

    await db.collection('form_responses').updateOne(
      { userId, questionnaireSlug: 'sliq' },
      { $setOnInsert: { userId, questionnaireSlug: 'sliq', answers: sliqAnswers, submittedAt: responseAt } },
      { upsert: true }
    );
    await db.collection('form_responses').updateOne(
      { userId, questionnaireSlug: 'rand-36' },
      { $setOnInsert: { userId, questionnaireSlug: 'rand-36', answers: rand36Answers, submittedAt: responseAt } },
      { upsert: true }
    );
  }
  console.log('[mongo]   form_responses seeded for test-c1 through test-c6');

  // test-public: not enrolled in a study (no Neo4j ENROLLED_IN edge needed)
  const pubId = 'test-public';
  await neo4jQuery(
    `MERGE (u:User {userID: $userId})`,
    { userId: pubId }
  );
  console.log('  ✓ seeded test-public (user node only, no study enrollment)');
}

// ── Second test study: 4 groups × 2 participants ───────────────────────────
//
// Produces a realistic "study under way" alongside the public/default study:
// 8 Keycloak participants (2 per group) who each donated 3 habits, track a
// personal habit with ~6 weeks of daily logs, and have weekly SRHI scores.

const COHORT_DONATIONS = [
  { s: 'I take the stairs instead of the lift at work.', ctx: 'When I arrive at the office', dim: 'TIME' },
  { s: 'I go for a 20-minute walk after lunch.', ctx: 'After lunch on workdays', dim: 'TIME' },
  { s: 'I stretch for five minutes when I wake up.', ctx: 'Right after waking up', dim: 'TIME' },
  { s: 'I cycle to the shops instead of driving.', ctx: 'When I run errands', dim: 'PHYSICAL_SETTING' },
  { s: 'I do ten squats while the kettle boils.', ctx: 'While the kettle boils', dim: 'PRECEDING_ACTION' },
  { s: 'I walk the dog before breakfast.', ctx: 'Before breakfast', dim: 'TIME' },
  { s: 'I get off the bus one stop early and walk.', ctx: 'On my commute home', dim: 'PHYSICAL_SETTING' },
  { s: 'I do a short yoga flow before bed.', ctx: 'In the evening before bed', dim: 'TIME' },
  { s: 'I go for a run with a friend on Saturdays.', ctx: 'On Saturday mornings', dim: 'SOCIAL_SETTING' },
  { s: 'I do push-ups after my morning shower.', ctx: 'After my morning shower', dim: 'PRECEDING_ACTION' },
  { s: 'I take a walking break every afternoon.', ctx: 'Every afternoon at work', dim: 'TIME' },
  { s: 'I park at the far end of the car park.', ctx: 'When I go shopping', dim: 'PHYSICAL_SETTING' },
  { s: 'I do calf raises while brushing my teeth.', ctx: 'While brushing my teeth', dim: 'PRECEDING_ACTION' },
  { s: 'I go swimming on Wednesday evenings.', ctx: 'On Wednesday evenings', dim: 'TIME' },
  { s: 'I do a plank hold before checking my phone in the morning.', ctx: 'Before checking my phone', dim: 'PRECEDING_ACTION' },
  { s: 'I walk during phone calls.', ctx: 'When I take a phone call', dim: 'PRECEDING_ACTION' },
  { s: 'I stretch my back every hour at my desk.', ctx: 'Every hour at my desk', dim: 'TIME' },
  { s: 'I go for a family bike ride on Sundays.', ctx: 'On Sunday afternoons', dim: 'SOCIAL_SETTING' },
  { s: 'I do a five-minute warm-up before dinner.', ctx: 'Before dinner', dim: 'TIME' },
  { s: 'I take a lunchtime walk in the park.', ctx: 'At lunchtime in the park', dim: 'PHYSICAL_SETTING' },
];

const COHORT_BEHAVIORS = [
  { key: 'walking', label: 'Walking' },
  { key: 'light_jogging', label: 'Light jogging' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'structured_calisthenics', label: 'Structured calisthenics' },
  { key: 'yoga', label: 'Yoga' },
];

async function kcEnsureParticipantRole(authHeaders) {
  let roleRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/participant`,
    { headers: authHeaders }
  );
  if (roleRes.status === 404) {
    await fetch(`${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'participant', description: 'Study participant' }),
    });
    roleRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/participant`,
      { headers: authHeaders }
    );
  }
  if (!roleRes.ok) {
    throw new Error(`Failed to fetch participant role: ${roleRes.status}`);
  }
  return roleRes.json();
}

/** Create (or find) a Keycloak user and return its id (the JWT `sub`). */
async function kcEnsureUser(authHeaders, { username, password, group, role }) {
  const q = `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${encodeURIComponent(username)}&exact=true`;
  const searchRes = await fetch(q, { headers: authHeaders });
  const existing = searchRes.ok ? await searchRes.json() : [];
  let id = Array.isArray(existing) && existing.length > 0 ? existing[0].id : null;

  if (!id) {
    const createRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          username,
          enabled: true,
          credentials: [{ type: 'password', value: password, temporary: false }],
          attributes: { group: [group] },
        }),
      }
    );
    if (!createRes.ok && createRes.status !== 409) {
      const t = await createRes.text();
      throw new Error(`Failed to create ${username}: ${createRes.status} ${t}`);
    }
    const refetch = await fetch(q, { headers: authHeaders });
    const users = await refetch.json();
    id = users[0].id;
  }

  // Assign the participant realm role (idempotent).
  const mapUrl = `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${id}/role-mappings/realm`;
  const mappingsRes = await fetch(mapUrl, { headers: authHeaders });
  const mappings = mappingsRes.ok ? await mappingsRes.json() : [];
  const hasRole =
    Array.isArray(mappings) && mappings.some((r) => r.name === role.name);
  if (!hasRole) {
    await fetch(mapUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify([role]),
    });
  }
  return id;
}

async function seedTestStudyCohort(db) {
  console.log('\n[cohort] Seeding second test study (4 groups × 2 participants)...');
  const { ObjectId } = appRequire('mongodb');
  const studies = db.collection('studies');
  const STUDY_NAME = 'Movement Habits Study (Test)';

  const existingStudy = await studies.findOne({ name: STUDY_NAME });
  if (existingStudy) {
    console.log('[cohort] study already exists, skipping.');
    return;
  }

  const sliq = await db.collection('questionnaires').findOne({ slug: 'sliq' });
  const rand36 = await db.collection('questionnaires').findOne({ slug: 'rand-36' });
  const qIds = [sliq?._id, rand36?._id].filter(Boolean);

  const now = new Date();
  const groups = [1, 2, 3, 4].map((i) => ({
    id: new ObjectId(),
    label: `Group ${i}`,
    index: i,
    cueConfig: null,
    activityTypeConfig: null,
    reminderConfig: { enabled: true, fixedTime: null },
    autoDonate: false,
    onboardingEnabled: null,
    selfHabitCreationEnabled: null,
  }));
  const studyDoc = {
    name: STUDY_NAME,
    description:
      'Simulated test study: 4 groups × 2 participants, each with donated habits, a tracked personal habit, daily logs and weekly SRHI.',
    isDefault: false,
    isActive: true,
    recommenderEnabled: true,
    onboardingEnabled: true,
    selfHabitCreationEnabled: true,
    groups,
    questionnaires: qIds,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId: studyOid } = await studies.insertOne(studyDoc);
  const studyIdStr = studyOid.toString();
  await neo4jQuery(`MERGE (s:Study {uuid: $uuid}) SET s.name = $name`, {
    uuid: studyIdStr,
    name: STUDY_NAME,
  });
  console.log(`[cohort]   study "${STUDY_NAME}" created (${studyIdStr})`);

  const kcToken = await getKeycloakAdminToken();
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${kcToken}`,
  };
  const participantRole = await kcEnsureParticipantRole(authHeaders);

  const enrolledAt = new Date(Date.now() - 49 * 24 * 60 * 60 * 1000); // ~7 weeks ago
  let seed = 0;
  const cohortUsers = [];

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const groupShort = `G${g + 1}`;
    for (let u = 1; u <= 2; u++) {
      seed++;
      // Phrase-compatible credentials: a UUID username + 16-byte hex password
      // (like the self-onboarding flow) so a real, restorable recovery phrase
      // can be derived. 16 bytes is required — see onboardRouter.js.
      const username = randomUUID();
      const password = randomBytes(16).toString('hex');
      const userId = await kcEnsureUser(authHeaders, {
        username,
        password,
        group: groupShort,
        role: participantRole,
      });
      // Token card is always generated; the recovery phrase is only stored
      // when EXPOSE_RECOVERY_PHRASES=true (see app/utils/recoveryPhrase.js).
      const recoveryPhrase = recoveryPhrasesEnabled()
        ? recoveryPhraseFromCredentials(username, password)
        : null;
      const tokenCardPdf = await generateTokenCard(userId, username, password, 'both');

      // Admin participants list (MongoDB `participants`) — with token card + phrase.
      await db.collection('participants').updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            username,
            group: groupShort,
            enrolledAt,
            surveyCompletionPct: 1,
            source: 'seed',
            label: `${groupShort} · User ${u}`,
            recoveryPhrase,
            tokenCardPdf,
          },
          $set: { lastActive: now },
        },
        { upsert: true }
      );

      // Study membership (MongoDB `enrollments`) — drives study participant counts.
      await db.collection('enrollments').updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            studyId: studyOid,
            groupId: group.id,
            studyCodeUsed: null,
            enrolledAt,
          },
          $set: { lastActiveAt: now },
        },
        { upsert: true }
      );

      // Graph enrollment (Neo4j).
      await neo4jQuery(
        `MERGE (usr:User {userID: $userId})
         MERGE (st:Study {uuid: $studyId})
         MERGE (usr)-[e:ENROLLED_IN]->(st)
           ON CREATE SET e.enrolledAt = $enrolledAt, e.groupId = $groupId,
                         e.studyCodeUsed = null, e.lastActiveAt = $lastActiveAt`,
        {
          userId,
          studyId: studyIdStr,
          groupId: group.id.toString(),
          enrolledAt: enrolledAt.toISOString(),
          lastActiveAt: now.toISOString(),
        }
      );

      // Baseline questionnaire responses (so the participant reads as complete).
      const responseAt = new Date(enrolledAt.getTime() + 2 * 86400000);
      await db.collection('form_responses').updateOne(
        { userId, questionnaireSlug: 'sliq' },
        {
          $setOnInsert: {
            userId,
            questionnaireSlug: 'sliq',
            answers: Object.fromEntries(
              ['sliq_diet', 'sliq_physical_activity', 'sliq_smoking', 'sliq_alcohol'].map(
                (k, i) => [k, String((seed + i) % 4)]
              )
            ),
            submittedAt: responseAt,
          },
        },
        { upsert: true }
      );
      await db.collection('form_responses').updateOne(
        { userId, questionnaireSlug: 'rand-36' },
        {
          $setOnInsert: {
            userId,
            questionnaireSlug: 'rand-36',
            answers: Object.fromEntries(
              Array.from({ length: 36 }, (_, i) => [`rand36_q${i + 1}`, String(((seed + i) % 5) + 1)])
            ),
            submittedAt: responseAt,
          },
        },
        { upsert: true }
      );

      // ── Personal habit to track (implementation intention) ──────────────
      const behavior = COHORT_BEHAVIORS[seed % COHORT_BEHAVIORS.length];
      const cueText = 'After my morning coffee';
      const intentionId = new ObjectId();
      await db.collection('implementation_intentions').updateOne(
        { userId, status: 'active' },
        {
          $setOnInsert: {
            _id: intentionId,
            userId,
            enrollmentId: null,
            groupId: group.id,
            behaviorKey: behavior.key,
            behaviorLabel: behavior.label,
            durationMinutes: 20,
            cues: [{ text: cueText, source: 'self_selected', cueId: null }],
            intentionStatement: `${cueText}, I will ${behavior.label.toLowerCase()} for 20 minutes.`,
            status: 'active',
            createdAt: enrolledAt,
            updatedAt: enrolledAt,
          },
          $set: { studyId: studyOid },
        },
        { upsert: true }
      );
      const intention = await db
        .collection('implementation_intentions')
        .findOne({ userId, status: 'active' });

      // Daily logs — 42 days, ~75% enacted.
      for (let d = 0; d < 42; d++) {
        const enacted = Math.random() < 0.75;
        const date = new Date(enrolledAt.getTime() + d * 86400000);
        const dateStr = date.toISOString().split('T')[0];
        await db.collection('daily_behavior_logs').updateOne(
          { intentionId: intention._id, date: dateStr },
          {
            $setOnInsert: { intentionId: intention._id, userId, date: dateStr, enacted },
            $set: { loggedAt: date },
          },
          { upsert: true }
        );
      }

      // Weekly SRHI — 7 weeks, rising habit strength.
      for (let w = 1; w <= 7; w++) {
        const scheduledFor = new Date(enrolledAt.getTime() + (w - 1) * 7 * 86400000);
        const score = fakeSrhiScore(w, seed);
        const items = Object.fromEntries(
          Array.from({ length: 12 }, (_, i) => [
            `srhi_${i + 1}`,
            Math.min(7, Math.max(1, Math.round(score + (Math.random() - 0.5)))),
          ])
        );
        await db.collection('srhi_responses').updateOne(
          { intentionId: intention._id, weekNumber: w },
          {
            $setOnInsert: {
              intentionId: intention._id,
              userId,
              groupId: group.id,
              weekNumber: w,
              scheduledFor,
              submittedAt: new Date(scheduledFor.getTime() + 86400000),
              items,
              score,
              createdAt: scheduledFor,
            },
            $set: { studyId: studyOid },
          },
          { upsert: true }
        );
      }

      // ── 3 donated habits (Neo4j) with DONATED / DONATED_IN + a Context ──
      for (let hI = 0; hI < 3; hI++) {
        const donation = COHORT_DONATIONS[(seed * 3 + hI) % COHORT_DONATIONS.length];
        const habitUuid = `seed-study-${userId}-${hI}`;
        const donatedAt = new Date(
          enrolledAt.getTime() + (hI + 1) * 3 * 86400000
        ).toISOString();
        await neo4jQuery(
          `MERGE (h:Habit {uuid: $uuid})
             ON CREATE SET h.sentence = $sentence, h.language = 'en',
               h.is_habit = true, h.habit_confidence = 0.9,
               h.userID = $userId, h.studyId = $studyId, h.created_at = $donatedAt,
               h.translationEN = $sentence, h.translationDE = null
           MERGE (u:User {userID: $userId})
           MERGE (u)-[d:DONATED]->(h) ON CREATE SET d.at = $donatedAt
           MERGE (s:Study {uuid: $studyId})
           MERGE (h)-[:DONATED_IN]->(s)
           MERGE (c:Context {text: $ctx, dimension: $dim})
           MERGE (h)-[:HAS_CONTEXT {dimension: $dim}]->(c)`,
          {
            uuid: habitUuid,
            sentence: donation.s,
            userId,
            studyId: studyIdStr,
            donatedAt,
            ctx: donation.ctx,
            dim: donation.dim,
          }
        );
      }

      cohortUsers.push({ userId, groupId: group.id });

      console.log(
        `[cohort]   ✓ ${groupShort} · User ${u} (${username}) — token card, recovery phrase, 3 donations, 1 tracked habit`
      );
    }
  }

  // ── Questionnaire assignments + scheduled windows + completion ──────────
  // SLIQ at fixed study weeks (baseline, week 4, week 8); RAND-36 recurring
  // every 14 days ×3. Both study-wide (all groups).
  const assignmentDefs = [
    sliq && {
      questionnaireId: sliq._id,
      questionnaireSlug: sliq.slug,
      questionnaireTitle: sliq.title ?? sliq.slug,
      cadence: { mode: 'fixed', weeks: [0, 4, 8] },
    },
    rand36 && {
      questionnaireId: rand36._id,
      questionnaireSlug: rand36.slug,
      questionnaireTitle: rand36.title ?? rand36.slug,
      cadence: { mode: 'interval', startOffsetDays: 0, intervalDays: 14, occurrences: 3 },
    },
  ].filter(Boolean);

  for (const def of assignmentDefs) {
    await db.collection('questionnaire_assignments').updateOne(
      { studyId: studyOid, groupId: null, questionnaireId: def.questionnaireId },
      {
        $setOnInsert: {
          studyId: studyOid,
          groupId: null,
          questionnaireId: def.questionnaireId,
          questionnaireSlug: def.questionnaireSlug,
          questionnaireTitle: def.questionnaireTitle,
          cadence: def.cadence,
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }

  // Generate each participant's windows, then mark the baseline response for
  // each questionnaire as completed (they already have SLIQ + RAND-36 responses).
  for (const cu of cohortUsers) {
    await generateWindowsForUser({
      db,
      userId: cu.userId,
      studyId: studyOid,
      groupId: cu.groupId,
      enrolledAt,
    });
    for (const slug of ['sliq', 'rand-36']) {
      const resp = await db
        .collection('form_responses')
        .findOne({ userId: cu.userId, questionnaireSlug: slug });
      if (resp) {
        await markWindowSubmitted({
          db,
          userId: cu.userId,
          questionnaireSlug: slug,
          responseId: resp._id,
          submittedAt: resp.submittedAt ?? now,
        });
      }
    }
  }

  console.log(
    '[cohort] Done — 8 participants, 24 donated habits, 8 tracked habits, ' +
      `${assignmentDefs.length} questionnaire assignments + scheduled windows.`
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Health Habit Hub — Local Seed Script ===');
  try {
    await seedMongo();
    await seedSurveys();
    await seedDefaultStudy();
    // Neo4j must be seeded (and awaited via waitForNeo4j) before the test
    // participants step, which issues neo4jQuery calls of its own.
    await seedNeo4j();
    {
      const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
      const client = new MongoClient(mongoUrl, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 10000,
      });
      try {
        await client.connect();
        const db = client.db(MONGO_DB);
        console.log('\n[mongo] Seeding DFG test participants...');
        await seedTestParticipant(db);
      } finally {
        await client.close();
      }
    }
    await seedKeycloak();
    {
      const mongoUrl = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
      const client = new MongoClient(mongoUrl, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 10000,
      });
      try {
        await client.connect();
        await seedTestStudyCohort(client.db(MONGO_DB));
      } finally {
        await client.close();
      }
    }
    console.log('\n✓ All seed steps completed successfully.');
  } catch (err) {
    console.error('\n✗ Seed failed:', err.message);
    process.exit(1);
  }
}

main();

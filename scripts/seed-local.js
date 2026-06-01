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
        { id: new ObjectId(), label: 'Group 1', index: 1 },
        { id: new ObjectId(), label: 'Group 2', index: 2 },
        { id: new ObjectId(), label: 'Group 3', index: 3 },
        { id: new ObjectId(), label: 'Group 4', index: 4 },
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

  // Seed 4 ExperimentalSetting Group nodes (idempotent via MERGE on uri)
  console.log('[neo4j] Seeding Group nodes...');
  const groups = [
    {
      label: 'hhh__Group1',
      uri: 'hhh:Group1',
      name: 'Closed Task, Open Description',
    },
    {
      label: 'hhh__Group2',
      uri: 'hhh:Group2',
      name: 'Closed Task, Closed Description',
    },
    {
      label: 'hhh__Group3',
      uri: 'hhh:Group3',
      name: 'Full+Free-text (Open Task, Closed Description)',
    },
    {
      label: 'hhh__Group4',
      uri: 'hhh:Group4',
      name: 'Minimal+Free-text (Open Task, Open Description)',
    },
  ];
  // Each group needs both hhh__ExperimentalSetting and its group-specific label.
  // Labels must be literal in Cypher — run one statement per group.
  const groupCyphers = [
    `MERGE (g:hhh__ExperimentalSetting:hhh__Group1 {uri: $uri})
     ON CREATE SET g.name = $name, g.seeded = true`,
    `MERGE (g:hhh__ExperimentalSetting:hhh__Group2 {uri: $uri})
     ON CREATE SET g.name = $name, g.seeded = true`,
    `MERGE (g:hhh__ExperimentalSetting:hhh__Group3 {uri: $uri})
     ON CREATE SET g.name = $name, g.seeded = true`,
    `MERGE (g:hhh__ExperimentalSetting:hhh__Group4 {uri: $uri})
     ON CREATE SET g.name = $name, g.seeded = true`,
  ];
  for (let i = 0; i < groups.length; i++) {
    await neo4jQuery(groupCyphers[i], {
      uri: groups[i].uri,
      name: groups[i].name,
    });
    console.log(`[neo4j]   Group "${groups[i].label}" seeded`);
  }

  // Seed 1 test Donor (idempotent via MERGE on hhh__userId)
  console.log('[neo4j] Seeding test Donor...');
  await neo4jQuery(
    `MERGE (d:hhh__Donor {hhh__userId: $userId})
     ON CREATE SET d.hhh__created = $now, d.seeded = true`,
    { userId: 'dev-user-1', now: new Date().toISOString() }
  );
  console.log('[neo4j]   Donor "dev-user-1" seeded');

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
            { type: 'password', value: 'testpass123', temporary: false },
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

  // Fetch the participant role definition
  const roleRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/participant`,
    { headers: authHeaders }
  );
  if (!roleRes.ok) {
    const text = await roleRes.text();
    throw new Error(
      `Failed to fetch participant role: ${roleRes.status} ${text}`
    );
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
  const conditions = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const dropDays = { c4: 30, c6: 45 };

  for (const cond of conditions) {
    const userId = `test-${cond}`;
    const cueConfig = CUE_CONFIGS[cond];
    const cueKey = `${cueConfig.cueSource}_${cueConfig.cueCount}`;
    const cues = EXAMPLE_CUES[cueKey] ?? EXAMPLE_CUES['high_quality_single'];
    const enrolledAt = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);

    await db.collection('enrollments').updateOne(
      { userId },
      { $setOnInsert: { userId, studyId: null, groupId: null, studyCodeUsed: null, enrolledAt, cueConfig } },
      { upsert: true }
    );

    const intentionId = new ObjectId();
    await db.collection('implementation_intentions').updateOne(
      { userId, status: 'active' },
      {
        $setOnInsert: {
          _id: intentionId,
          userId,
          enrollmentId: null,
          studyId: null,
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
            studyId: null,
            groupId: null,
            weekNumber: w,
            scheduledFor,
            submittedAt: missed ? null : new Date(scheduledFor.getTime() + 86400000),
            items,
            score,
            createdAt: scheduledFor,
          },
        },
        { upsert: true }
      );
    }

    if (dropDays[cond] != null) {
      await db.collection('enrollments').updateOne(
        { userId },
        {
          $set: {
            droppedOutAt: new Date(enrolledAt.getTime() + dropDays[cond] * 86400000),
            lastActiveAt: new Date(enrolledAt.getTime() + (dropDays[cond] - 1) * 86400000),
          },
        }
      );
    }

    console.log(`  ✓ seeded test-${cond}`);
  }

  const pubId = 'test-public';
  await db.collection('enrollments').updateOne(
    { userId: pubId },
    { $setOnInsert: { userId: pubId, studyId: null, groupId: null, studyCodeUsed: null, enrolledAt: new Date(), cueConfig: null } },
    { upsert: true }
  );
  console.log('  ✓ seeded test-public');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Health Habit Hub — Local Seed Script ===');
  try {
    await seedMongo();
    await seedSurveys();
    await seedDefaultStudy();
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
    await seedNeo4j();
    await seedKeycloak();
    console.log('\n✓ All seed steps completed successfully.');
  } catch (err) {
    console.error('\n✗ Seed failed:', err.message);
    process.exit(1);
  }
}

main();

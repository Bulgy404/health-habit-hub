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

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Health Habit Hub — Local Seed Script ===');
  try {
    await seedMongo();
    await seedNeo4j();
    await seedKeycloak();
    console.log('\n✓ All seed steps completed successfully.');
  } catch (err) {
    console.error('\n✗ Seed failed:', err.message);
    process.exit(1);
  }
}

main();

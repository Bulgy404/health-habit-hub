#!/usr/bin/env node
/**
 * seed-test-user.js
 *
 * Creates (or re-seeds) ONE fixed-passphrase test participant with a rich,
 * gradually-built six-week history for manual QA: a habit that reaches full
 * automaticity and graduates for real (not flipped on by a flag), habits at
 * several different reminder-fading stages, a brand-new habit, a habit
 * stacked onto another, a donated habit, and comments/likes on other
 * people's habits. Enrolled in the default study.
 *
 * The whole persona reads as one continuous story: the user started their
 * first habit six weeks ago with mediocre adherence, gradually got more
 * consistent, added more habits as confidence grew, and one habit has since
 * become fully automatic — visible as an upward trend in the contribution
 * graph, SRHI trajectory, and automaticity chart, not a step-function.
 *
 * The account is deterministic: the same username+password always derive
 * the same 24-word recovery phrase (see app/utils/recoveryPhrase.js), and
 * Keycloak lookup-by-username makes re-running this script idempotent — it
 * reuses the existing account instead of creating a new one every time. Only
 * the *habit data* is wiped and rebuilt on each run (dates are always
 * relative to "now", so the persona's six weeks of history stays fresh).
 *
 * Usage (from repo root, with the local docker stack running):
 *   make seed-user
 * or directly:
 *   node --env-file=.env scripts/seed-test-user.js
 *
 * Needs (from .env / environment): MONGO_USER, MONGO_PASSWORD, MONGO_DB,
 * NEO4J_USER, NEO4J_PASSWORD, KEYCLOAK_ADMIN_CLIENT_SECRET. Optionally
 * TEST_USER_PHRASE (the 24-word recovery phrase to seed under — falls back
 * to a built-in default if unset). Also honours MONGO_HOST/PORT, NEO4J_HTTP,
 * KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_CLIENT_ID for host-side
 * overrides (the .env values point at Docker-internal hostnames; this
 * script defaults those three to localhost since it's meant to run on the
 * host, same convention as seed-local.js).
 *
 * Skips the recommender/translate pipeline for donated habits (no LLM
 * classification or multi-language translation) so this works offline and
 * fast — donated habits are written straight to Neo4j in English only, with
 * a single Context node so they still appear correctly bucketed in the
 * Explore > Graph tab.
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createKeycloakAdminClient } from '../app/services/keycloakAdminClient.js';
import {
  recoveryPhraseFromCredentials,
  credentialsFromRecoveryPhrase,
} from '../app/utils/recoveryPhrase.js';
import { ROLES } from '../app/middleware/auth.js';
import { submitSrhi } from '../app/services/srhiService.js';
import { SRHI_ITEM_IDS } from '../app/utils/srhi.js';
import { createEnrollment } from '../app/services/enrollmentNeo4j.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRequire = createRequire(resolve(__dirname, '../app/package.json'));
const { MongoClient, ObjectId } = appRequire('mongodb');

// ── Fixed identity ───────────────────────────────────────────────────────
// TEST_USER_PHRASE (see .env) is the source of truth when set; falls back to
// this default phrase's derived credentials otherwise. Either way the same
// phrase always restores the same account (Keycloak lookup-by-username below
// makes account creation idempotent too).
const DEFAULT_USERNAME = 'deadbeef-dead-4eef-8eef-deadbeefdead';
const DEFAULT_PASSWORD = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const { username: FIXED_USERNAME, password: FIXED_PASSWORD } = (() => {
  const envPhrase = process.env.TEST_USER_PHRASE?.trim();
  const decoded = envPhrase ? credentialsFromRecoveryPhrase(envPhrase) : null;
  if (envPhrase && !decoded) {
    throw new Error(
      'TEST_USER_PHRASE is set but is not a valid 24-word recovery phrase.'
    );
  }
  return decoded ?? { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };
})();

// A synthetic "other participant" who donated a couple of community habits,
// so the seeded user has something of someone else's to comment on/like.
const COMMUNITY_DONOR_ID = 'seed-community-donor-0001';

// ── Environment ──────────────────────────────────────────────────────────
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
const MONGO_USER = process.env.MONGO_USER || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'password';
const MONGO_DB = process.env.MONGO_DB || 'surveyjs';
const MONGO_AUTH_SOURCE = process.env.MONGO_AUTH_SOURCE || 'admin';

const NEO4J_HTTP = process.env.NEO4J_HTTP || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// The container's own KEYCLOAK_URL (from .env) points at the Docker-internal
// hostname `keycloak`; this script runs on the host, so default to the
// published port instead unless the caller overrides it.
const KEYCLOAK_URL = process.env.KEYCLOAK_URL?.includes('://keycloak')
  ? 'http://localhost:8080'
  : process.env.KEYCLOAK_URL || 'http://localhost:8080';

// ── Neo4j helper (HTTP transactional endpoint, matching seed-local.js) ───
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
    throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (data.errors?.length > 0) {
    throw new Error(`Neo4j error: ${data.errors[0].message}`);
  }
  // Reshape into plain row objects (same shape the app's bolt-based
  // queryNeo4j returns), since seed script consumers just need e.g. row.id.
  const result = data.results[0];
  if (!result) return [];
  return result.data.map((d) =>
    Object.fromEntries(result.columns.map((col, i) => [col, d.row[i]]))
  );
}

// ── Date helpers ─────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const ymd = (date) => date.toISOString().slice(0, 10);

/**
 * Enacted logs for [intentionId] over the [fromDaysAgo]..[toDaysAgo] window
 * (inclusive, fromDaysAgo further in the past than toDaysAgo), with the
 * per-day probability of logging ramping linearly from [startAdherence] at
 * the oldest day to [endAdherence] at the most recent day — a gradual
 * build-up rather than a flat/noisy rate, so the contribution graph and SRHI
 * trend visibly trend upward over the habit's life instead of looking
 * random.
 */
function buildRampedLogs(
  intentionId,
  userId,
  fromDaysAgo,
  toDaysAgo,
  startAdherence,
  endAdherence
) {
  const logs = [];
  const span = fromDaysAgo - toDaysAgo;
  for (let d = fromDaysAgo; d >= toDaysAgo; d--) {
    const t = span === 0 ? 1 : (fromDaysAgo - d) / span;
    const adherence = startAdherence + (endAdherence - startAdherence) * t;
    if (Math.random() <= adherence) {
      logs.push({
        intentionId,
        userId,
        date: ymd(daysAgo(d)),
        enacted: true,
        loggedAt: daysAgo(d),
      });
    }
  }
  return logs;
}

/**
 * Weekly SRHI responses, scores trending from [startScore] toward
 * [endScore] over [weeks] weeks, the first one scheduled [startDaysAgo] in
 * the past and each subsequent one 7 days later (so weekNumber increases
 * toward the present, same as a real weekly cadence).
 */
function buildSrhiHistory(
  intentionId,
  userId,
  weeks,
  startDaysAgo,
  startScore,
  endScore
) {
  const docs = [];
  for (let w = 1; w <= weeks; w++) {
    const scheduledFor = daysAgo(startDaysAgo - (w - 1) * 7);
    const t = weeks === 1 ? 1 : (w - 1) / (weeks - 1);
    const score = Math.round((startScore + (endScore - startScore) * t) * 10) / 10;
    docs.push({
      intentionId,
      userId,
      studyId: null,
      groupId: null,
      weekNumber: w,
      scheduledFor,
      submittedAt: scheduledFor,
      items: Object.fromEntries(SRHI_ITEM_IDS.map((id) => [id, Math.round(score)])),
      score,
      createdAt: scheduledFor,
    });
  }
  return docs;
}

function newIntentionBase({ userId, behaviorKey, behaviorLabel, cueText, habitType, createdAt }) {
  return {
    userId,
    enrollmentId: null,
    studyId: null,
    groupId: null,
    behaviorKey,
    behaviorLabel,
    durationMinutes: 5,
    cues: [{ text: cueText, source: 'self_selected' }],
    intentionStatement: `When ${cueText.charAt(0).toLowerCase()}${cueText.slice(1)}, I will ${behaviorLabel.toLowerCase()}.`,
    habitType,
    stackedOn: null,
    creationMode: 'standalone',
    earnedBadges: [],
    reminderTime: null,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('[1/6] Resolving Keycloak account...');
  const kcAdmin = createKeycloakAdminClient({ base: KEYCLOAK_URL });

  let userId;
  const existing = await kcAdmin.searchUsers(FIXED_USERNAME);
  const match = existing.find((u) => u.username === FIXED_USERNAME);
  if (match) {
    userId = match.id;
    await kcAdmin.resetPassword(userId, FIXED_PASSWORD);
    console.log(`  Reusing existing account, userId=${userId}`);
  } else {
    userId = await kcAdmin.createUser({
      userId: randomUUID(),
      username: FIXED_USERNAME,
      password: FIXED_PASSWORD,
    });
    await kcAdmin.assignRole(userId, ROLES.USER);
    console.log(`  Created new account, userId=${userId}`);
  }
  const phrase = recoveryPhraseFromCredentials(FIXED_USERNAME, FIXED_PASSWORD);

  console.log('[2/6] Connecting to MongoDB...');
  const mongoUri = `mongodb://${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(
    MONGO_PASSWORD
  )}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(MONGO_DB);

  console.log('[3/6] Clearing previous seed data for this user...');
  await Promise.all([
    db.collection('implementation_intentions').deleteMany({ userId }),
    db.collection('daily_behavior_logs').deleteMany({ userId }),
    db.collection('srhi_responses').deleteMany({ userId }),
    db.collection('habit_annotations').deleteMany({ userId }),
    db.collection('habit_comments').deleteMany({ userId }),
  ]);
  await neo4jQuery(
    `MATCH (h:Habit) WHERE h.userID IN [$userId, $donorId] DETACH DELETE h`,
    { userId, donorId: COMMUNITY_DONOR_ID }
  );
  await neo4jQuery(`MATCH (u:User {userID: $userId}) DETACH DELETE u`, { userId });

  console.log('[4/6] Enrolling in the default study...');
  const studies = db.collection('studies');
  let defaultStudy = await studies.findOne({ isDefault: true });
  if (!defaultStudy) {
    // Defensive fallback if `make seed`/seed-local.js hasn't run yet — mirrors
    // defaultStudySeedService.seedDefaultStudy() exactly.
    const now = new Date();
    const group = { id: new ObjectId(), label: 'Group 1', index: 1, cueConfig: null, activityTypeConfig: null, reminderConfig: { enabled: true, fixedTime: null }, autoDonate: false };
    const { insertedId } = await studies.insertOne({
      name: 'Default Study',
      description: 'Pre-configured default study. Participants without a study code are enrolled here.',
      isDefault: true,
      isActive: true,
      groups: [group],
      questionnaires: [],
      createdAt: now,
      updatedAt: now,
    });
    defaultStudy = { _id: insertedId, groups: [group] };
    console.log('  Default study did not exist — created it.');
  }
  const defaultGroup = defaultStudy.groups?.[0] ?? null;
  const enrolledAt = daysAgo(42);
  const enrollResult = await createEnrollment(neo4jQuery, {
    userId,
    studyId: defaultStudy._id.toString(),
    groupId: defaultGroup?.id?.toString() ?? null,
    studyCodeUsed: null,
    enrolledAt,
  });
  if (defaultGroup) {
    await db.collection('enrollments').updateOne(
      { userId: String(userId) },
      {
        $set: {
          userId: String(userId),
          studyId: defaultStudy._id,
          groupId: defaultGroup.id,
          studyCodeUsed: null,
          enrolledAt,
          droppedOutAt: null,
          cueConfig: null,
        },
      },
      { upsert: true }
    );
  }
  console.log(
    `  ${enrollResult.alreadyEnrolled ? 'Already enrolled' : 'Enrolled'} in "${defaultStudy.name ?? 'Default Study'}"`
  );

  console.log('[5/6] Writing habits, logs, and SRHI history (6-week gradual build-up)...');
  const intentions = db.collection('implementation_intentions');
  const logs = db.collection('daily_behavior_logs');
  const srhi = db.collection('srhi_responses');

  // Habit A — the first habit, started six weeks ago. Adherence ramps up
  // over five weeks (0.35 -> 0.92) as the habit takes hold, then eight days
  // of real silence (no logs at all) before the final SRHI check-in — which
  // runs through the actual graduation logic in srhiService.js rather than
  // being flagged automatic — confirms it and graduates the habit for real.
  const habitA = newIntentionBase({
    userId,
    behaviorKey: 'drink_water_morning',
    behaviorLabel: 'Drink a full glass of water',
    cueText: 'I get out of bed in the morning',
    habitType: 'build',
    createdAt: daysAgo(42),
  });
  habitA.reachedAutomaticityAt = daysAgo(8);
  const habitAId = (await intentions.insertOne(habitA)).insertedId;
  await logs.insertMany(buildRampedLogs(habitAId, userId, 41, 8, 0.35, 0.92));
  const habitASrhi = buildSrhiHistory(habitAId, userId, 5, 39, 2.5, 6.0);
  await srhi.insertMany(habitASrhi);
  await srhi.insertOne({
    intentionId: habitAId,
    userId,
    studyId: null,
    groupId: null,
    weekNumber: 6,
    scheduledFor: daysAgo(2),
    submittedAt: null,
    items: null,
    score: null,
    createdAt: daysAgo(2),
  });
  const graduationResult = await submitSrhi({
    db,
    intentionId: String(habitAId),
    userId,
    weekNumber: 6,
    items: Object.fromEntries(SRHI_ITEM_IDS.map((id) => [id, 7])),
    neo4jRun: neo4jQuery,
  });
  console.log(
    `  Habit A "${habitA.behaviorLabel}": ${
      graduationResult.graduation?.graduated ? 'graduated to full automaticity ✓' : 'NOT graduated (check config thresholds)'
    }`
  );

  // Habit B — added two weeks in, once habit A was showing early promise.
  // Still active today; adherence ramps 0.30 -> 0.75.
  const habitB = newIntentionBase({
    userId,
    behaviorKey: 'no_snooze',
    behaviorLabel: 'Get up on the first alarm',
    cueText: 'my alarm goes off',
    habitType: 'quit',
    createdAt: daysAgo(28),
  });
  const habitBId = (await intentions.insertOne(habitB)).insertedId;
  await logs.insertMany(buildRampedLogs(habitBId, userId, 27, 0, 0.3, 0.75));
  await srhi.insertMany(buildSrhiHistory(habitBId, userId, 4, 21, 2.8, 4.8));

  // Habit C — added another two weeks later, growing confidence. Adherence
  // ramps 0.35 -> 0.65, still finding its rhythm.
  const habitC = newIntentionBase({
    userId,
    behaviorKey: 'read_before_bed',
    behaviorLabel: 'Read a book for ten minutes',
    cueText: 'I get into bed',
    habitType: 'build',
    createdAt: daysAgo(14),
  });
  const habitCId = (await intentions.insertOne(habitC)).insertedId;
  await logs.insertMany(buildRampedLogs(habitCId, userId, 13, 0, 0.35, 0.65));
  await srhi.insertMany(buildSrhiHistory(habitCId, userId, 2, 7, 3.0, 4.2));

  // Habit D — stacked onto habit C a few days ago, just getting started.
  const habitD = newIntentionBase({
    userId,
    behaviorKey: 'gratitude_note',
    behaviorLabel: 'Write down one thing I am grateful for',
    cueText: 'I finish reading before bed',
    habitType: 'build',
    createdAt: daysAgo(4),
  });
  habitD.stackedOn = habitCId;
  habitD.creationMode = 'stacked';
  const habitDId = (await intentions.insertOne(habitD)).insertedId;
  await logs.insertMany(buildRampedLogs(habitDId, userId, 3, 0, 0.4, 0.7));

  // Habit E — created today. No logs, no SRHI — the freshest possible state.
  const habitE = newIntentionBase({
    userId,
    behaviorKey: 'check_phone_wakeup',
    behaviorLabel: 'Leave my phone in another room while I get ready',
    cueText: 'I wake up',
    habitType: 'quit',
    createdAt: new Date(),
  });
  await intentions.insertOne(habitE);

  console.log('[6/6] Writing donated habit, community habits, comments, and likes...');

  // The seeded user's own donated habit, from partway through their journey
  // (day 10) — minimal Neo4j write (no LLM classification/translation),
  // tagged with one Context node so it's bucketed correctly in the
  // Explore > Graph tab.
  const donatedUuid = randomUUID();
  await neo4jQuery(
    `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: 'en',
       is_habit: true, habit_confidence: 0.97, userID: $userId,
       studyId: $studyId, created_at: $createdAt,
       translationEN: null, translationDE: null, translationJA: null,
       translationFR: null, translationNL: null,
       frequency: 2, duration: 2, health_benefit: 4, wellbeing_impact: 5,
       habit_type: 'build', creation_mode: 'standalone',
       annotations_helpful: 0, annotations_iDoThis: 0, annotations_like: 0})
     WITH h
     CREATE (c:Context {text: 'before bed', dimension: 'TIME'})
     CREATE (h)-[:HAS_CONTEXT {dimension: 'TIME'}]->(c)
     WITH h
     MERGE (u:User {userID: $userId})
     MERGE (u)-[d:DONATED]->(h)
       ON CREATE SET d.at = $createdAt`,
    {
      uuid: donatedUuid,
      sentence: 'I stretch for five minutes before bed to sleep better.',
      userId,
      studyId: defaultStudy._id.toString(),
      createdAt: daysAgo(10).toISOString(),
    }
  );

  // Two community habits from a synthetic other donor, pre-dating the
  // seeded user's own history, so there is something of someone else's to
  // comment on and like.
  const communityHabits = [
    {
      uuid: randomUUID(),
      sentence: 'I write down three things I am grateful for every evening.',
      dimension: 'INTERNAL_STATE',
      contextText: 'feeling stressed',
    },
    {
      uuid: randomUUID(),
      sentence: 'I take a short walk after lunch every day.',
      dimension: 'PRIOR_BEHAVIOR',
      contextText: 'after eating',
    },
  ];
  for (const habit of communityHabits) {
    await neo4jQuery(
      `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: 'en',
         is_habit: true, habit_confidence: 0.95, userID: $donorId,
         studyId: null, created_at: $createdAt,
         translationEN: null, translationDE: null, translationJA: null,
         translationFR: null, translationNL: null,
         frequency: 3, duration: 1, health_benefit: 4, wellbeing_impact: 4,
         habit_type: 'build', creation_mode: 'standalone',
         annotations_helpful: 0, annotations_iDoThis: 0, annotations_like: 0})
       WITH h
       CREATE (c:Context {text: $contextText, dimension: $dimension})
       CREATE (h)-[:HAS_CONTEXT {dimension: $dimension}]->(c)
       WITH h
       MERGE (u:User {userID: $donorId})
       MERGE (u)-[d:DONATED]->(h)
         ON CREATE SET d.at = $createdAt`,
      {
        uuid: habit.uuid,
        sentence: habit.sentence,
        dimension: habit.dimension,
        contextText: habit.contextText,
        donorId: COMMUNITY_DONOR_ID,
        createdAt: daysAgo(50).toISOString(),
      }
    );
  }

  // "I do this too" on the first community habit, "helpful" on the second.
  await db.collection('habit_annotations').insertMany([
    {
      habitId: communityHabits[0].uuid,
      type: 'iDoThis',
      userId,
      createdAt: daysAgo(20),
    },
    {
      habitId: communityHabits[1].uuid,
      type: 'helpful',
      userId,
      createdAt: daysAgo(15),
    },
  ]);
  await neo4jQuery(
    `MATCH (h:Habit {uuid: $uuid})
     SET h.annotations_iDoThis = coalesce(h.annotations_iDoThis, 0) + 1`,
    { uuid: communityHabits[0].uuid }
  );
  await neo4jQuery(
    `MATCH (h:Habit {uuid: $uuid})
     SET h.annotations_helpful = coalesce(h.annotations_helpful, 0) + 1`,
    { uuid: communityHabits[1].uuid }
  );

  // A comment on the first community habit (anonymous in Neo4j; ownership
  // recorded in Mongo, matching POST /habits/:id/comments exactly).
  const commentId = randomUUID();
  await neo4jQuery(
    `MATCH (h:Habit {uuid: $habitId})
     CREATE (c:Comment {id: $id, text: $text, createdAt: $createdAt,
       flagged: false, approved: true, flagReason: null})-[:COMMENT_ON]->(h)`,
    {
      habitId: communityHabits[0].uuid,
      id: commentId,
      text: 'This really helped me wind down at the end of the day, thanks for sharing!',
      createdAt: daysAgo(20).toISOString(),
    }
  );
  await db.collection('habit_comments').insertOne({
    commentId,
    habitId: communityHabits[0].uuid,
    userId,
    createdAt: daysAgo(20),
  });

  // Participant record, mirroring what /onboard writes, so the account
  // shows up in the admin portal too.
  await db.collection('participants').updateOne(
    { userId },
    {
      $set: {
        userId,
        username: FIXED_USERNAME,
        group: defaultGroup?.label ?? null,
        surveyCompletionPct: 0,
        source: 'qa-seed',
        recoveryPhrase: phrase,
      },
      $setOnInsert: { enrolledAt },
    },
    { upsert: true }
  );

  await client.close();

  console.log('\n=== Done ===');
  console.log(`userId (sub): ${userId}`);
  console.log(`username:     ${FIXED_USERNAME}`);
  console.log(`password:     ${FIXED_PASSWORD}`);
  console.log('\nRecovery phrase (enter this in the app\'s "Restore account" flow):');
  console.log(`  ${phrase}`);
  console.log('\nSeeded (six weeks of gradually-built history, enrolled in the default study):');
  console.log('  - Habit A "Drink a full glass of water" — started 6 weeks ago, ramped up, now graduated/automatic');
  console.log('  - Habit B "Get up on the first alarm" — added 4 weeks ago, steadily improving, still active');
  console.log('  - Habit C "Read a book for ten minutes" — added 2 weeks ago, still finding its rhythm');
  console.log('  - Habit D "Write down one thing I am grateful for" — stacked onto habit C 4 days ago');
  console.log('  - Habit E "Leave my phone in another room" — created today, no logs yet');
  console.log('  - 1 habit donated to the community graph');
  console.log('  - 2 community habits from another donor, with 1 like, 1 "I do this too", and 1 comment from this user');
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * seed-test-user.js
 *
 * Creates (or re-seeds) fixed-passphrase test participants with rich,
 * gradually-built history for manual QA. Five personas are defined, each
 * with a different adherence pattern/story (see PERSONAS below); by default
 * only the first ("steady") is seeded, preserving the original single-user
 * behavior. Set COUNT to seed more:
 *
 *   make seed-user            # just "steady" (default, unchanged from before)
 *   make seed-user COUNT=5    # all five personas
 *
 * Each persona's account is deterministic: the same username+password always
 * derive the same 24-word recovery phrase (see app/utils/recoveryPhrase.js),
 * and Keycloak lookup-by-username makes re-running this script idempotent —
 * it reuses each existing account instead of creating a new one every time.
 * Only the *habit data* is wiped and rebuilt on each run (dates are always
 * relative to "now", so every persona's history stays fresh).
 *
 * Usage (from repo root, with the local docker stack running):
 *   make seed-user
 *   make seed-user COUNT=5
 * or directly:
 *   node --env-file=.env scripts/seed-test-user.js
 *   COUNT=5 node --env-file=.env scripts/seed-test-user.js
 *
 * Needs (from .env / environment): MONGO_USER, MONGO_PASSWORD, MONGO_DB,
 * NEO4J_USER, NEO4J_PASSWORD, KEYCLOAK_ADMIN_CLIENT_SECRET. Optionally
 * TEST_USER_PHRASE (the 24-word recovery phrase to seed the "steady" persona
 * under — falls back to a built-in default if unset; the other four personas
 * always use their own fixed, derived identities, unaffected by this var).
 * Also honours MONGO_HOST/PORT, NEO4J_HTTP, KEYCLOAK_URL, KEYCLOAK_REALM,
 * KEYCLOAK_ADMIN_CLIENT_ID for host-side overrides (the .env values point at
 * Docker-internal hostnames; this script defaults those three to localhost
 * since it's meant to run on the host, same convention as seed-local.js).
 *
 * Skips the recommender/translate pipeline for donated habits (no LLM
 * classification or multi-language translation) so this works offline and
 * fast — donated habits are written straight to Neo4j in English only, with
 * a single Context node so they still appear correctly bucketed in the
 * Explore > Graph tab.
 */

import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
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

// ── Credentials ──────────────────────────────────────────────────────────
// TEST_USER_PHRASE (see .env) is the source of truth for the "steady"
// persona when set; falls back to this default phrase's derived credentials
// otherwise. Either way the same phrase always restores the same account.
const DEFAULT_USERNAME = 'deadbeef-dead-4eef-8eef-deadbeefdead';
const DEFAULT_PASSWORD = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const { username: STEADY_USERNAME, password: STEADY_PASSWORD } = (() => {
  const envPhrase = process.env.TEST_USER_PHRASE?.trim();
  const decoded = envPhrase ? credentialsFromRecoveryPhrase(envPhrase) : null;
  if (envPhrase && !decoded) {
    throw new Error(
      'TEST_USER_PHRASE is set but is not a valid 24-word recovery phrase.'
    );
  }
  return decoded ?? { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };
})();

/**
 * Deterministically derives a valid {username, password} pair (UUID-format
 * username, 32-hex-char password — the shape recoveryPhraseFromCredentials
 * requires) from a fixed label, so personas 2-5 get stable, reproducible
 * identities without hand-picking hex strings. Not cryptographically
 * meaningful — just a stable way to turn "seed-persona-beginner" into
 * something that looks like a real account.
 */
function deriveCredentials(label) {
  const hash = createHash('sha256').update(label).digest('hex'); // 64 hex chars
  const uuidHex = hash.slice(0, 32);
  const username = [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join('-');
  const password = hash.slice(32, 64);
  return { username, password };
}

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
 * the oldest day to [endAdherence] at the most recent day. Works for both
 * rising (habit taking hold) and falling (adherence declining) trends —
 * just pass startAdherence > endAdherence for a decline. Call it multiple
 * times over disjoint day ranges (skipping a middle range entirely) to model
 * a habit that went quiet for a while and then resumed.
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
 * toward the present, same as a real weekly cadence). Works for declining
 * trends too (startScore > endScore).
 */
function buildSrhiHistory(
  intentionId,
  userId,
  weeks,
  startDaysAgo,
  startScore,
  endScore,
  startWeekNumber = 1
) {
  const docs = [];
  for (let w = 0; w < weeks; w++) {
    const scheduledFor = daysAgo(startDaysAgo - w * 7);
    const t = weeks === 1 ? 1 : w / (weeks - 1);
    const score = Math.round((startScore + (endScore - startScore) * t) * 10) / 10;
    docs.push({
      intentionId,
      userId,
      studyId: null,
      groupId: null,
      weekNumber: startWeekNumber + w,
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

/**
 * Runs a habit through the real graduation flow: schedules a final SRHI
 * week with no response yet, then submits high scores through the actual
 * srhiService.submitSrhi() so graduation is earned for real (not flagged by
 * a boolean) — same pattern the original single-persona script used.
 */
async function runGraduationFlow({ db, intentionId, userId, weekNumber, scheduledForDaysAgo }) {
  const srhi = db.collection('srhi_responses');
  await srhi.insertOne({
    intentionId,
    userId,
    studyId: null,
    groupId: null,
    weekNumber,
    scheduledFor: daysAgo(scheduledForDaysAgo),
    submittedAt: null,
    items: null,
    score: null,
    createdAt: daysAgo(scheduledForDaysAgo),
  });
  return submitSrhi({
    db,
    intentionId: String(intentionId),
    userId,
    weekNumber,
    items: Object.fromEntries(SRHI_ITEM_IDS.map((id) => [id, 7])),
    neo4jRun: neo4jQuery,
  });
}

/**
 * Minimal Neo4j write for a donated habit — mirrors the real donation
 * pipeline's Habit node shape but skips the LLM classification/translation
 * pipeline (see module doc comment), same simplification already used
 * elsewhere in this script. Always attaches one Context node so the habit
 * is correctly bucketed in the Explore > Graph tab.
 */
async function donateHabit({
  uuid,
  sentence,
  donorId,
  studyId,
  createdAt,
  frequency = 2,
  duration = 2,
  healthBenefit = 4,
  wellbeingImpact = 4,
  habitType = 'build',
  creationMode = 'standalone',
  contextText,
  contextDimension,
}) {
  await neo4jQuery(
    `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: 'en',
       is_habit: true, habit_confidence: 0.96, userID: $donorId,
       studyId: $studyId, created_at: $createdAt,
       translationEN: null, translationDE: null, translationJA: null,
       translationFR: null, translationNL: null,
       frequency: $frequency, duration: $duration,
       health_benefit: $healthBenefit, wellbeing_impact: $wellbeingImpact,
       habit_type: $habitType, creation_mode: $creationMode,
       annotations_helpful: 0, annotations_iDoThis: 0, annotations_like: 0})
     WITH h
     CREATE (c:Context {text: $contextText, dimension: $contextDimension})
     CREATE (h)-[:HAS_CONTEXT {dimension: $contextDimension}]->(c)
     WITH h
     MERGE (u:User {userID: $donorId})
     MERGE (u)-[d:DONATED]->(h)
       ON CREATE SET d.at = $createdAt`,
    {
      uuid,
      sentence,
      donorId,
      studyId,
      createdAt,
      frequency,
      duration,
      healthBenefit,
      wellbeingImpact,
      habitType,
      creationMode,
      contextText,
      contextDimension,
    }
  );
}

/**
 * §7.1 Habit Stacking — links two already-donated Habit nodes as
 * (:Habit {anchor})-[:STACKED_WITH]->(:Habit {stacked}), the same edge the
 * real donation pipeline creates when `stackedOnUuid` is passed (see
 * `_writeHabitNode` in `app/services/habitDonationService.js`).
 */
async function linkStackedWith(anchorUuid, stackedUuid, createdAt) {
  await neo4jQuery(
    `MATCH (anchor:Habit {uuid: $anchorUuid})
     MATCH (h:Habit {uuid: $stackedUuid})
     MERGE (anchor)-[r:STACKED_WITH]->(h)
       ON CREATE SET r.at = $createdAt`,
    { anchorUuid, stackedUuid, createdAt }
  );
}

async function annotateAndComment({ db, communityHabits, userId, annotations, comment }) {
  if (annotations.length > 0) {
    await db.collection('habit_annotations').insertMany(
      annotations.map(({ habitIndex, type, createdAtDaysAgo }) => ({
        habitId: communityHabits[habitIndex].uuid,
        type,
        userId,
        createdAt: daysAgo(createdAtDaysAgo),
      }))
    );
    for (const { habitIndex, type } of annotations) {
      const field = type === 'iDoThis' ? 'annotations_iDoThis' : 'annotations_helpful';
      await neo4jQuery(
        `MATCH (h:Habit {uuid: $uuid}) SET h.${field} = coalesce(h.${field}, 0) + 1`,
        { uuid: communityHabits[habitIndex].uuid }
      );
    }
  }
  if (comment) {
    const commentId = randomUUID();
    await neo4jQuery(
      `MATCH (h:Habit {uuid: $habitId})
       CREATE (c:Comment {id: $id, text: $text, createdAt: $createdAt,
         flagged: false, approved: true, flagReason: null})-[:COMMENT_ON]->(h)`,
      {
        habitId: communityHabits[comment.habitIndex].uuid,
        id: commentId,
        text: comment.text,
        createdAt: daysAgo(comment.createdAtDaysAgo).toISOString(),
      }
    );
    await db.collection('habit_comments').insertOne({
      commentId,
      habitId: communityHabits[comment.habitIndex].uuid,
      userId,
      createdAt: daysAgo(comment.createdAtDaysAgo),
    });
  }
}

// ── Persona stories ──────────────────────────────────────────────────────
// Each function does the [habits/logs/SRHI/donations] writes for one
// persona and returns an array of human-readable summary lines for the
// final console printout. `ctx` = { db, userId, studyId }.

/** The original single persona: one habit graduates to full automaticity
 * for real, others at various earlier stages, several donations, and some
 * community interaction. Unchanged from before multi-persona support. */
async function buildSteadyStory(ctx) {
  const { db, userId, studyId } = ctx;
  const intentions = db.collection('implementation_intentions');
  const logs = db.collection('daily_behavior_logs');
  const srhi = db.collection('srhi_responses');
  const lines = [];

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
  await srhi.insertMany(buildSrhiHistory(habitAId, userId, 5, 39, 2.5, 6.0));
  const graduation = await runGraduationFlow({
    db,
    intentionId: habitAId,
    userId,
    weekNumber: 6,
    scheduledForDaysAgo: 2,
  });
  lines.push(
    `Habit A "${habitA.behaviorLabel}" — 6wk build-up, ${
      graduation.graduation?.graduated ? 'graduated to full automaticity ✓' : 'NOT graduated (check config thresholds)'
    }`
  );

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
  lines.push(`Habit B "${habitB.behaviorLabel}" — added 4 weeks ago, steadily improving, still active`);

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
  lines.push(`Habit C "${habitC.behaviorLabel}" — added 2 weeks ago, still finding its rhythm`);

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
  lines.push(`Habit D "${habitD.behaviorLabel}" — stacked onto habit C 4 days ago`);

  const habitE = newIntentionBase({
    userId,
    behaviorKey: 'check_phone_wakeup',
    behaviorLabel: 'Leave my phone in another room while I get ready',
    cueText: 'I wake up',
    habitType: 'quit',
    createdAt: new Date(),
  });
  await intentions.insertOne(habitE);
  lines.push(`Habit E "${habitE.behaviorLabel}" — created today, no logs yet`);

  const donatedUuid = randomUUID();
  await donateHabit({
    uuid: donatedUuid,
    sentence: 'I stretch for five minutes before bed to sleep better.',
    donorId: userId,
    studyId,
    createdAt: daysAgo(10).toISOString(),
    wellbeingImpact: 5,
    contextText: 'before bed',
    contextDimension: 'TIME',
  });

  const donatedHabitCUuid = randomUUID();
  const donatedHabitDUuid = randomUUID();
  await donateHabit({
    uuid: donatedHabitCUuid,
    sentence: 'I read a book for ten minutes before I go to sleep.',
    donorId: userId,
    studyId,
    createdAt: daysAgo(14).toISOString(),
    healthBenefit: 3,
    contextText: 'before I go to sleep',
    contextDimension: 'TIME',
  });
  await donateHabit({
    uuid: donatedHabitDUuid,
    sentence:
      'After I finish reading before bed, I write down one thing I am grateful for.',
    donorId: userId,
    studyId,
    createdAt: daysAgo(4).toISOString(),
    healthBenefit: 3,
    creationMode: 'stacked',
    contextText: 'After I finish reading before bed',
    contextDimension: 'PRIOR_BEHAVIOR',
  });
  await linkStackedWith(donatedHabitCUuid, donatedHabitDUuid, daysAgo(4).toISOString());

  const donatedAnchorUuid = randomUUID();
  const donatedStackedUuid = randomUUID();
  await donateHabit({
    uuid: donatedAnchorUuid,
    sentence: 'I do ten push-ups right after I get out of the shower.',
    donorId: userId,
    studyId,
    createdAt: daysAgo(18).toISOString(),
    wellbeingImpact: 3,
    contextText: 'right after I get out of the shower',
    contextDimension: 'PRIOR_BEHAVIOR',
  });
  await donateHabit({
    uuid: donatedStackedUuid,
    sentence: 'After my push-ups, I drink a full glass of water.',
    donorId: userId,
    studyId,
    createdAt: daysAgo(18).toISOString(),
    healthBenefit: 3,
    wellbeingImpact: 3,
    creationMode: 'stacked',
    contextText: 'After my push-ups',
    contextDimension: 'PRIOR_BEHAVIOR',
  });
  await linkStackedWith(donatedAnchorUuid, donatedStackedUuid, daysAgo(18).toISOString());
  lines.push('5 habits donated to the community graph, including 2 STACKED_WITH pairs');

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
    await donateHabit({
      uuid: habit.uuid,
      sentence: habit.sentence,
      donorId: ctx.communityDonorId,
      studyId: null,
      createdAt: daysAgo(50).toISOString(),
      frequency: 3,
      duration: 1,
      contextText: habit.contextText,
      contextDimension: habit.dimension,
    });
  }
  await annotateAndComment({
    db,
    communityHabits,
    userId,
    annotations: [
      { habitIndex: 0, type: 'iDoThis', createdAtDaysAgo: 20 },
      { habitIndex: 1, type: 'helpful', createdAtDaysAgo: 15 },
    ],
    comment: {
      habitIndex: 0,
      text: 'This really helped me wind down at the end of the day, thanks for sharing!',
      createdAtDaysAgo: 20,
    },
  });
  lines.push('2 community habits from another donor, with 1 like, 1 "I do this too", and 1 comment from this user');

  return lines;
}

/** Just downloaded the app a few days ago — one tentative habit, one brand
 * new, minimal history, no donations or community activity yet. */
async function buildBeginnerStory(ctx) {
  const { db, userId } = ctx;
  const intentions = db.collection('implementation_intentions');
  const logs = db.collection('daily_behavior_logs');
  const srhi = db.collection('srhi_responses');
  const lines = [];

  const habitA = newIntentionBase({
    userId,
    behaviorKey: 'walk_after_work',
    behaviorLabel: 'Take a short walk',
    cueText: 'I get home from work',
    habitType: 'build',
    createdAt: daysAgo(3),
  });
  const habitAId = (await intentions.insertOne(habitA)).insertedId;
  await logs.insertMany(buildRampedLogs(habitAId, userId, 2, 0, 0.4, 0.6));
  await srhi.insertMany(buildSrhiHistory(habitAId, userId, 1, 1, 2.5, 2.5));
  lines.push(`Habit A "${habitA.behaviorLabel}" — started 3 days ago, still tentative`);

  const habitB = newIntentionBase({
    userId,
    behaviorKey: 'water_before_coffee',
    behaviorLabel: 'Drink a glass of water before coffee',
    cueText: 'I wake up',
    habitType: 'build',
    createdAt: new Date(),
  });
  await intentions.insertOne(habitB);
  lines.push(`Habit B "${habitB.behaviorLabel}" — created today, no logs yet`);
  lines.push('No donations, no community activity — brand-new account');

  return lines;
}

/** Was doing okay, momentum fading — declining adherence across the board,
 * one habit abandoned outright, nothing graduated. */
async function buildStrugglerStory(ctx) {
  const { db, userId, studyId } = ctx;
  const intentions = db.collection('implementation_intentions');
  const logs = db.collection('daily_behavior_logs');
  const srhi = db.collection('srhi_responses');
  const lines = [];

  const habitA = newIntentionBase({
    userId,
    behaviorKey: 'gym_mwf',
    behaviorLabel: 'Go to the gym',
    cueText: "it's a gym day",
    habitType: 'build',
    createdAt: daysAgo(35),
  });
  const habitAId = (await intentions.insertOne(habitA)).insertedId;
  await logs.insertMany(buildRampedLogs(habitAId, userId, 34, 0, 0.8, 0.25));
  await srhi.insertMany(buildSrhiHistory(habitAId, userId, 5, 32, 5.5, 2.8));
  lines.push(`Habit A "${habitA.behaviorLabel}" — started strong 5 weeks ago, adherence declining`);

  const habitB = newIntentionBase({
    userId,
    behaviorKey: 'no_late_social_media',
    behaviorLabel: 'Stay off social media',
    cueText: "it's 9pm",
    habitType: 'quit',
    createdAt: daysAgo(21),
  });
  const habitBId = (await intentions.insertOne(habitB)).insertedId;
  await logs.insertMany(buildRampedLogs(habitBId, userId, 20, 0, 0.6, 0.3));
  await srhi.insertMany(buildSrhiHistory(habitBId, userId, 3, 14, 4.0, 3.0));
  lines.push(`Habit B "${habitB.behaviorLabel}" — added 3 weeks ago, also slipping`);

  const habitC = newIntentionBase({
    userId,
    behaviorKey: 'sunday_meal_prep',
    behaviorLabel: 'Meal prep for the week',
    cueText: "it's Sunday afternoon",
    habitType: 'build',
    createdAt: daysAgo(14),
  });
  const habitCId = (await intentions.insertOne(habitC)).insertedId;
  // Logged consistently for the first week, then nothing for the last
  // week — abandoned, not a gradual decline like A/B.
  await logs.insertMany(buildRampedLogs(habitCId, userId, 13, 7, 0.75, 0.75));
  lines.push(`Habit C "${habitC.behaviorLabel}" — logged for a week, then stopped entirely (abandoned)`);

  const donatedUuid = randomUUID();
  await donateHabit({
    uuid: donatedUuid,
    sentence: 'I do a 10-minute stretch right after my gym workout.',
    donorId: userId,
    studyId,
    createdAt: daysAgo(30).toISOString(),
    wellbeingImpact: 4,
    contextText: 'right after my gym workout',
    contextDimension: 'PRIOR_BEHAVIOR',
  });
  lines.push('1 habit donated early on, before things slipped — no further community activity');

  return lines;
}

/** The most engaged user — many habits, two genuinely graduated, heavy
 * donation and community activity. */
async function buildPowerUserStory(ctx) {
  const { db, userId, studyId } = ctx;
  const intentions = db.collection('implementation_intentions');
  const logs = db.collection('daily_behavior_logs');
  const srhi = db.collection('srhi_responses');
  const lines = [];

  const habitH1 = newIntentionBase({
    userId,
    behaviorKey: 'water_on_waking',
    behaviorLabel: 'Drink water on waking',
    cueText: 'I wake up',
    habitType: 'build',
    createdAt: daysAgo(70),
  });
  habitH1.reachedAutomaticityAt = daysAgo(15);
  const habitH1Id = (await intentions.insertOne(habitH1)).insertedId;
  await logs.insertMany(buildRampedLogs(habitH1Id, userId, 69, 15, 0.5, 0.9));
  await srhi.insertMany(buildSrhiHistory(habitH1Id, userId, 6, 67, 3.0, 6.5));
  const grad1 = await runGraduationFlow({
    db,
    intentionId: habitH1Id,
    userId,
    weekNumber: 7,
    scheduledForDaysAgo: 8,
  });
  lines.push(
    `Habit H1 "${habitH1.behaviorLabel}" — ${grad1.graduation?.graduated ? 'graduated to full automaticity ✓' : 'not graduated'}`
  );

  const habitH2 = newIntentionBase({
    userId,
    behaviorKey: 'evening_walk',
    behaviorLabel: 'Take an evening walk',
    cueText: 'I finish dinner',
    habitType: 'build',
    createdAt: daysAgo(56),
  });
  habitH2.reachedAutomaticityAt = daysAgo(10);
  const habitH2Id = (await intentions.insertOne(habitH2)).insertedId;
  await logs.insertMany(buildRampedLogs(habitH2Id, userId, 55, 10, 0.55, 0.88));
  await srhi.insertMany(buildSrhiHistory(habitH2Id, userId, 5, 52, 3.2, 6.2));
  const grad2 = await runGraduationFlow({
    db,
    intentionId: habitH2Id,
    userId,
    weekNumber: 6,
    scheduledForDaysAgo: 3,
  });
  lines.push(
    `Habit H2 "${habitH2.behaviorLabel}" — ${grad2.graduation?.graduated ? 'graduated to full automaticity ✓' : 'not graduated'}`
  );

  const habitH3 = newIntentionBase({
    userId,
    behaviorKey: 'no_phone_in_bed',
    behaviorLabel: 'Keep my phone out of bed',
    cueText: 'I get into bed',
    habitType: 'quit',
    createdAt: daysAgo(42),
  });
  const habitH3Id = (await intentions.insertOne(habitH3)).insertedId;
  await logs.insertMany(buildRampedLogs(habitH3Id, userId, 41, 0, 0.5, 0.85));
  await srhi.insertMany(buildSrhiHistory(habitH3Id, userId, 6, 35, 3.5, 5.8));
  lines.push(`Habit H3 "${habitH3.behaviorLabel}" — active, high adherence, not graduated yet`);

  const habitH4 = newIntentionBase({
    userId,
    behaviorKey: 'evening_journal',
    behaviorLabel: 'Journal for five minutes',
    cueText: 'I finish my evening walk',
    habitType: 'build',
    createdAt: daysAgo(28),
  });
  habitH4.stackedOn = habitH2Id;
  habitH4.creationMode = 'stacked';
  const habitH4Id = (await intentions.insertOne(habitH4)).insertedId;
  await logs.insertMany(buildRampedLogs(habitH4Id, userId, 27, 0, 0.5, 0.8));
  lines.push(`Habit H4 "${habitH4.behaviorLabel}" — stacked onto H2, 4 weeks ago`);

  const habitH5 = newIntentionBase({
    userId,
    behaviorKey: 'cold_shower_finish',
    behaviorLabel: 'End my shower with 30 seconds cold',
    cueText: 'I finish my regular shower',
    habitType: 'build',
    createdAt: daysAgo(14),
  });
  const habitH5Id = (await intentions.insertOne(habitH5)).insertedId;
  await logs.insertMany(buildRampedLogs(habitH5Id, userId, 13, 0, 0.4, 0.7));
  lines.push(`Habit H5 "${habitH5.behaviorLabel}" — added 2 weeks ago`);

  const habitH6 = newIntentionBase({
    userId,
    behaviorKey: 'read_pages',
    behaviorLabel: 'Read ten pages',
    cueText: 'I finish journaling',
    habitType: 'build',
    createdAt: daysAgo(5),
  });
  const habitH6Id = (await intentions.insertOne(habitH6)).insertedId;
  await logs.insertMany(buildRampedLogs(habitH6Id, userId, 4, 0, 0.5, 0.75));
  lines.push(`Habit H6 "${habitH6.behaviorLabel}" — newest habit, added 5 days ago`);

  // Donate all six, and mirror the H2/H4 stack in the community graph too.
  const habitsToDonate = [
    { id: habitH1Id, sentence: 'I drink a full glass of water the moment I wake up.', h: habitH1, ctxText: 'the moment I wake up', dim: 'TIME' },
    { id: habitH2Id, sentence: 'I take a walk right after I finish dinner.', h: habitH2, ctxText: 'right after I finish dinner', dim: 'TIME' },
    { id: habitH3Id, sentence: 'I keep my phone out of the bedroom.', h: habitH3, ctxText: 'I get into bed', dim: 'TIME' },
    { id: habitH5Id, sentence: 'I end my shower with 30 seconds of cold water.', h: habitH5, ctxText: 'I finish my regular shower', dim: 'PRIOR_BEHAVIOR' },
    { id: habitH6Id, sentence: 'I read ten pages before turning off the light.', h: habitH6, ctxText: 'before turning off the light', dim: 'TIME' },
  ];
  for (const d of habitsToDonate) {
    await donateHabit({
      uuid: randomUUID(),
      sentence: d.sentence,
      donorId: userId,
      studyId,
      createdAt: d.h.createdAt.toISOString(),
      contextText: d.ctxText,
      contextDimension: d.dim,
    });
  }
  const donatedH2Uuid = randomUUID();
  const donatedH4Uuid = randomUUID();
  await donateHabit({
    uuid: donatedH2Uuid,
    sentence: 'I take a walk right after I finish dinner.',
    donorId: userId,
    studyId,
    createdAt: habitH2.createdAt.toISOString(),
    contextText: 'right after I finish dinner',
    contextDimension: 'TIME',
  });
  await donateHabit({
    uuid: donatedH4Uuid,
    sentence: 'After my evening walk, I journal for five minutes.',
    donorId: userId,
    studyId,
    createdAt: habitH4.createdAt.toISOString(),
    creationMode: 'stacked',
    contextText: 'After my evening walk',
    contextDimension: 'PRIOR_BEHAVIOR',
  });
  await linkStackedWith(donatedH2Uuid, donatedH4Uuid, habitH4.createdAt.toISOString());
  lines.push('7 habits donated to the community graph (all 6 tracked habits + the H2/H4 stack)');

  const communityHabits = [
    { uuid: randomUUID(), sentence: 'I do a 5-minute breathing exercise before checking my phone.', dimension: 'TIME', contextText: 'before checking my phone' },
    { uuid: randomUUID(), sentence: 'I prep my clothes for tomorrow before bed.', dimension: 'TIME', contextText: 'before bed' },
    { uuid: randomUUID(), sentence: 'I write my top 3 priorities each morning.', dimension: 'TIME', contextText: 'each morning' },
  ];
  for (const habit of communityHabits) {
    await donateHabit({
      uuid: habit.uuid,
      sentence: habit.sentence,
      donorId: ctx.communityDonorId,
      studyId: null,
      createdAt: daysAgo(60).toISOString(),
      frequency: 4,
      duration: 1,
      contextText: habit.contextText,
      contextDimension: habit.dimension,
    });
  }
  await annotateAndComment({
    db,
    communityHabits,
    userId,
    annotations: [
      { habitIndex: 0, type: 'iDoThis', createdAtDaysAgo: 40 },
      { habitIndex: 1, type: 'helpful', createdAtDaysAgo: 35 },
      { habitIndex: 2, type: 'iDoThis', createdAtDaysAgo: 30 },
    ],
    comment: {
      habitIndex: 1,
      text: 'Doing this every night has made mornings so much less chaotic.',
      createdAtDaysAgo: 35,
    },
  });
  lines.push('3 community habits from another donor, with 2 "I do this too", 1 "helpful", and 1 comment from this user');

  return lines;
}

/** Strong start, then three weeks of total silence, then resuming at a more
 * modest pace — tests how the app handles a real gap in the data. */
async function buildReturningStory(ctx) {
  const { db, userId } = ctx;
  const intentions = db.collection('implementation_intentions');
  const logs = db.collection('daily_behavior_logs');
  const srhi = db.collection('srhi_responses');
  const lines = [];

  const habitA = newIntentionBase({
    userId,
    behaviorKey: 'practice_guitar',
    behaviorLabel: 'Practice guitar for ten minutes',
    cueText: 'I get home from work',
    habitType: 'build',
    createdAt: daysAgo(56),
  });
  const habitAId = (await intentions.insertOne(habitA)).insertedId;
  // Strong start (weeks 1-3), then a 3-week silent gap (no logs generated at
  // all for days 34-14), then resuming at a more tentative pace.
  await logs.insertMany(buildRampedLogs(habitAId, userId, 55, 35, 0.5, 0.85));
  await logs.insertMany(buildRampedLogs(habitAId, userId, 13, 0, 0.3, 0.6));
  await srhi.insertMany(buildSrhiHistory(habitAId, userId, 3, 53, 3.5, 5.5));
  // One more check-in after resuming, showing the dip from starting over.
  await srhi.insertMany(buildSrhiHistory(habitAId, userId, 1, 10, 3.0, 3.0, 4));
  lines.push(
    `Habit A "${habitA.behaviorLabel}" — strong for 3 weeks, 3 weeks of total silence, now rebuilding`
  );
  lines.push('No donations, no community activity — quiet, personal-use account');

  return lines;
}

// ── Persona registry ─────────────────────────────────────────────────────
const PERSONAS = [
  {
    key: 'steady',
    title: 'Steady achiever',
    description: 'One habit already graduated to full automaticity; several others at earlier stages.',
    useFixedCredentials: true, // honors TEST_USER_PHRASE
    enrolledDaysAgo: 42,
    communityDonorId: 'seed-community-donor-steady',
    build: buildSteadyStory,
  },
  {
    key: 'beginner',
    title: 'Brand-new user',
    description: 'Just started a few days ago, minimal history, nothing donated yet.',
    enrolledDaysAgo: 3,
    build: buildBeginnerStory,
  },
  {
    key: 'struggler',
    title: 'Losing momentum',
    description: 'Adherence declining across the board; one habit abandoned outright.',
    enrolledDaysAgo: 35,
    build: buildStrugglerStory,
  },
  {
    key: 'power_user',
    title: 'Power user',
    description: 'Six habits, two genuinely graduated, heavy donation and community activity.',
    enrolledDaysAgo: 70,
    communityDonorId: 'seed-community-donor-power',
    build: buildPowerUserStory,
  },
  {
    key: 'returning',
    title: 'Returning after a gap',
    description: 'Strong start, three weeks of total silence, now rebuilding.',
    enrolledDaysAgo: 56,
    build: buildReturningStory,
  },
];

// ── Per-persona orchestration ────────────────────────────────────────────
async function seedOnePersona(kcAdmin, db, persona) {
  const { username, password } = persona.useFixedCredentials
    ? { username: STEADY_USERNAME, password: STEADY_PASSWORD }
    : deriveCredentials(`hhh-seed-persona-${persona.key}`);

  console.log(`\n=== Persona: ${persona.key} (${persona.title}) ===`);

  console.log('  Resolving Keycloak account...');
  let userId;
  const existing = await kcAdmin.searchUsers(username);
  const match = existing.find((u) => u.username === username);
  if (match) {
    userId = match.id;
    await kcAdmin.resetPassword(userId, password);
    console.log(`  Reusing existing account, userId=${userId}`);
  } else {
    userId = await kcAdmin.createUser({ userId: randomUUID(), username, password });
    await kcAdmin.assignRole(userId, ROLES.USER);
    console.log(`  Created new account, userId=${userId}`);
  }
  const phrase = recoveryPhraseFromCredentials(username, password);

  console.log('  Clearing previous seed data for this user...');
  await Promise.all([
    db.collection('implementation_intentions').deleteMany({ userId }),
    db.collection('daily_behavior_logs').deleteMany({ userId }),
    db.collection('srhi_responses').deleteMany({ userId }),
    db.collection('habit_annotations').deleteMany({ userId }),
    db.collection('habit_comments').deleteMany({ userId }),
  ]);
  const donorId = persona.communityDonorId ?? null;
  await neo4jQuery(
    donorId
      ? `MATCH (h:Habit) WHERE h.userID IN [$userId, $donorId] DETACH DELETE h`
      : `MATCH (h:Habit) WHERE h.userID = $userId DETACH DELETE h`,
    { userId, donorId }
  );
  await neo4jQuery(`MATCH (u:User {userID: $userId}) DETACH DELETE u`, { userId });

  console.log('  Enrolling in the default study...');
  const studies = db.collection('studies');
  let defaultStudy = await studies.findOne({ isDefault: true });
  if (!defaultStudy) {
    // Defensive fallback if the backend hasn't booted yet (it self-seeds the
    // default study on every startup — see adminRouter.js) and `make
    // seed`/seed-local.js hasn't run either.
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
  const enrolledAt = daysAgo(persona.enrolledDaysAgo);
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

  console.log('  Writing habits, logs, SRHI history, and donations...');
  const summaryLines = await persona.build({
    db,
    userId,
    studyId: defaultStudy._id.toString(),
    communityDonorId: donorId,
  });

  await db.collection('participants').updateOne(
    { userId },
    {
      $set: {
        userId,
        username,
        group: defaultGroup?.label ?? null,
        surveyCompletionPct: 0,
        source: 'qa-seed',
        recoveryPhrase: phrase,
      },
      $setOnInsert: { enrolledAt },
    },
    { upsert: true }
  );

  return { persona, userId, username, password, phrase, summaryLines };
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const requestedCount = parseInt(process.env.COUNT || '1', 10);
  const count = Number.isFinite(requestedCount)
    ? Math.min(Math.max(requestedCount, 1), PERSONAS.length)
    : 1;
  const personas = PERSONAS.slice(0, count);

  console.log('=== Health Habit Hub — Test Persona Seed ===');
  console.log(`Seeding ${count} persona(s): ${personas.map((p) => p.key).join(', ')}`);

  const kcAdmin = createKeycloakAdminClient({ base: KEYCLOAK_URL });
  const mongoUri = `mongodb://${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(
    MONGO_PASSWORD
  )}@${MONGO_HOST}:${MONGO_PORT}/?authSource=${MONGO_AUTH_SOURCE}`;
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(MONGO_DB);

  const results = [];
  try {
    for (const persona of personas) {
      results.push(await seedOnePersona(kcAdmin, db, persona));
    }
  } finally {
    await client.close();
  }

  console.log('\n=== Done ===');
  for (const r of results) {
    console.log(`\n--- ${r.persona.key} (${r.persona.title}) ---`);
    console.log(`  ${r.persona.description}`);
    console.log(`  userId (sub): ${r.userId}`);
    console.log(`  username:     ${r.username}`);
    console.log(`  password:     ${r.password}`);
    console.log(`  recovery phrase: ${r.phrase}`);
    for (const line of r.summaryLines) console.log(`  - ${line}`);
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exitCode = 1;
});

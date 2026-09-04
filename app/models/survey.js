import { MongoClient, ObjectId } from 'mongodb';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'ensureIndexes' });

const dbConfig = {
  host: process.env.MONGO_HOST || 'localhost',
  port: process.env.MONGO_PORT || 27017,
  database: process.env.MONGO_DB,
  user: process.env.MONGO_USER,
  password: process.env.MONGO_PASSWORD,
  authSource: process.env.MONGO_AUTH_SOURCE || 'admin',
};

/**
 * Build the Mongo connection URI from env-derived config. Exported so other
 * call sites (e.g. utils/healthCheck.js) share this single source of truth
 * instead of reassembling the URI independently from raw env vars.
 * @returns {string}
 */
export function buildMongoUri() {
  const { host, port, user, password, authSource } = dbConfig;
  // Omit the credentials segment entirely when unset — an explicit (even
  // empty) username in the URI makes the driver attempt authentication,
  // which fails against a mongod started with no auth backend (e.g. CI's
  // unauthenticated mongo:7 service container).
  if (!user && !password) {
    return `mongodb://${host}:${port}/`;
  }
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/?authSource=${authSource}`;
}

const url = buildMongoUri();
let db;
let client;

export async function connect() {
  if (db) {
    return db;
  }

  client = new MongoClient(url, {
    serverSelectionTimeoutMS: parseInt(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '5000',
      10
    ),
    socketTimeoutMS: parseInt(
      process.env.MONGO_SOCKET_TIMEOUT_MS || '5000',
      10
    ),
  });
  await client.connect();
  db = client.db(dbConfig.database);
  return db;
}

/**
 * Run one model's ensureIndexes in isolation.
 *
 * These used to be bare sequential awaits under a single catch in app.js, so
 * the first failure silently skipped every index after it. That matters most
 * for the unique indexes below (studies.isDefault, studyCodes.code,
 * enrollments.userId): on a deployment that predates them, pre-existing
 * duplicate data makes createIndex throw, and there is no reason that should
 * also cost us the consent or audit-log indexes.
 *
 * Failures are logged with the collection name and swallowed — index creation
 * is best-effort at boot, exactly as before, just no longer all-or-nothing.
 *
 * @param {import('mongodb').Db} database
 * @param {string} module Path to the model module, relative to this file.
 */
async function ensureFor(database, module) {
  try {
    const { ensureIndexes } = await import(module);
    await ensureIndexes(database);
  } catch (err) {
    log.error(
      { err, module },
      'Failed to ensure indexes for a collection — continuing with the rest. ' +
        'A duplicate-key error here means existing data violates a unique ' +
        'index and must be de-duplicated before that index can be created.'
    );
  }
}

/**
 * Create indexes that are required for correct behaviour (idempotent — safe to
 * call on every startup).  Must be called after connect().
 * @param {import('mongodb').Db} database
 */
export async function ensureIndexes(database) {
  // Compound index used by the annotation endpoint:
  //   deleteOne({ habitId, type, userId }) — needs all three fields
  //   find({ habitId })                    — covered by the prefix
  await database
    .collection('habit_annotations')
    .createIndex(
      { habitId: 1, type: 1, userId: 1 },
      { name: 'habitId_type_userId', background: true }
    );

  // Consent audit trail (latest-consent reads + per-user erasure)
  await ensureFor(database, './consent.js');

  // Comment ownership mapping (rate limiting + GDPR erasure)
  await ensureFor(database, './habitComment.js');

  // Questionnaire scheduling (assignments + per-participant windows)
  await ensureFor(database, './questionnaireSchedule.js');

  // Backup audit trail (admin Backups page)
  await ensureFor(database, './backupAuditLog.js');

  // General admin action audit trail (all other admin mutations)
  await ensureFor(database, './adminAuditLog.js');

  // Passphrase-based account restore attempts (security monitoring, admin panel)
  await ensureFor(database, './restoreAttempt.js');

  // Short-lived restore confirmation tokens (TTL-expired automatically)
  await ensureFor(database, './restoreConfirmationToken.js');

  // Study configuration — partial-unique index enforcing at most one default
  // study. Never bootstrapped before this chain existed, so on an existing
  // deployment it is created for the first time here.
  await ensureFor(database, './study.js');

  // Study enrollment codes (unique code lookup + per-study listing).
  await ensureFor(database, './studyCode.js');

  // Enrollments (one per user, per-study listing, dropout filtering).
  await ensureFor(database, './enrollment.js');
}

export async function disconnect() {
  try {
    if (client) await client.close();
  } finally {
    client = undefined;
    db = undefined;
  }
}

export { ObjectId };

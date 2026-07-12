import { MongoClient, ObjectId } from 'mongodb';

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
  return `mongodb://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/?authSource=${dbConfig.authSource}`;
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
  const { ensureIndexes: ensureConsentIndexes } = await import('./consent.js');
  await ensureConsentIndexes(database);

  // Comment ownership mapping (rate limiting + GDPR erasure)
  const { ensureIndexes: ensureCommentIndexes } = await import(
    './habitComment.js'
  );
  await ensureCommentIndexes(database);

  // Questionnaire scheduling (assignments + per-participant windows)
  const { ensureIndexes: ensureScheduleIndexes } = await import(
    './questionnaireSchedule.js'
  );
  await ensureScheduleIndexes(database);

  // Backup audit trail (admin Backups page)
  const { ensureIndexes: ensureBackupAuditIndexes } = await import(
    './backupAuditLog.js'
  );
  await ensureBackupAuditIndexes(database);

  // General admin action audit trail (all other admin mutations)
  const { ensureIndexes: ensureAdminAuditIndexes } = await import(
    './adminAuditLog.js'
  );
  await ensureAdminAuditIndexes(database);

  // Passphrase-based account restore attempts (security monitoring, admin panel)
  const { ensureIndexes: ensureRestoreAttemptIndexes } = await import(
    './restoreAttempt.js'
  );
  await ensureRestoreAttemptIndexes(database);

  // Short-lived restore confirmation tokens (TTL-expired automatically)
  const { ensureIndexes: ensureRestoreTokenIndexes } = await import(
    './restoreConfirmationToken.js'
  );
  await ensureRestoreTokenIndexes(database);
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

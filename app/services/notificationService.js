/**
 * Notification service — Firebase Cloud Messaging (FCM) integration.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON env var (JSON string of Firebase
 * service account credentials). If the env var is absent the service operates
 * in no-op mode: send calls succeed with { sent: 0, failed: 0 }.
 *
 * Collections:
 *   deviceTokens            – { userId, token, updatedAt }
 *   scheduledNotifications  – { studyId, groupId, title, body, data, scheduledAt, sent, createdAt }
 */

import { ObjectId } from 'mongodb';
import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { dispatchDueCampaigns } from './notificationCampaignService.js';

const log = logger.child({ module: 'notificationService' });

export const COLLECTION_DEVICE_TOKENS = 'deviceTokens';
export const COLLECTION_SCHEDULED = 'scheduledNotifications';

/** Singleton Firebase app instance (lazy-initialised). */
let _firebaseApp = null;

/**
 * Initialise firebase-admin from FIREBASE_SERVICE_ACCOUNT_JSON env var.
 * Returns the admin messaging instance or null when Firebase is unconfigured.
 */
export async function getFirebaseMessaging() {
  if (_firebaseApp) {
    return _firebaseApp.messaging();
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return null;
  }

  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(raw);
    _firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    _firebaseApp = admin.apps[0];
  }

  return _firebaseApp.messaging();
}

/**
 * Send FCM push notifications to a list of tokens.
 *
 * @param {{ messaging: object|null, tokens: string[], title: string, body: string, data?: object }} params
 * @returns {{ sent: number, failed: number, invalidTokens: string[] }}
 */
export async function sendToTokens({ messaging, tokens, title, body, data }) {
  if (!messaging || tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const messages = tokens.map((token) => ({
    token,
    notification: { title, body },
    data: data
      ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
      : {},
  }));

  const batchResponse = await messaging.sendEach(messages);

  const invalidTokens = [];
  let sent = 0;
  let failed = 0;

  batchResponse.responses.forEach((resp, i) => {
    if (resp.success) {
      sent++;
    } else {
      failed++;
      const code = resp.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(tokens[i]);
      }
    }
  });

  return { sent, failed, invalidTokens };
}

/**
 * Send a push to an explicit list of FCM tokens and prune any that Firebase
 * reports as permanently invalid. Returns the number of *successful* deliveries.
 *
 * Gracefully degrades when Firebase is not configured
 * (FIREBASE_SERVICE_ACCOUNT_JSON unset): logs a clear warning and returns 0
 * rather than throwing, so an unconfigured backend surfaces as "reached 0"
 * with an explanatory log instead of an opaque 500.
 *
 * Shared by the immediate campaign-send path (notificationCampaignRouter) and
 * the scheduled dispatcher so both behave identically.
 * @param {{ db: object, tokens: string[], title: string, body: string, data?: object }} params
 * @returns {Promise<number>} Count of successful deliveries.
 */
export async function fcmSendMulticast({ db, tokens, title, body, data }) {
  if (!tokens || tokens.length === 0) return 0;
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    log.error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not set — push notification not sent (backend Firebase unconfigured)'
    );
    return 0;
  }
  const result = await sendToTokens({ messaging, tokens, title, body, data });
  await removeInvalidTokens({ db, invalidTokens: result.invalidTokens });
  return result.sent;
}

/**
 * Remove invalid/unregistered FCM tokens from the deviceTokens collection.
 *
 * @param {{ db: object, invalidTokens: string[] }} params
 */
export async function removeInvalidTokens({ db, invalidTokens }) {
  if (invalidTokens.length === 0) return;
  await db
    .collection(COLLECTION_DEVICE_TOKENS)
    .deleteMany({ token: { $in: invalidTokens } });
}

/**
 * Send a push notification to all participants in a study (optionally filtered
 * by group).
 *
 * @param {{ db: object, messaging: object|null, studyId: string, groupId?: string, title: string, body: string, data?: object }} params
 * @returns {{ sent: number, failed: number }}
 */
export async function sendStudyNotification({
  db,
  messaging,
  studyId,
  groupId,
  title,
  body,
  data,
}) {
  const enrollmentFilter = { studyId: new ObjectId(studyId) };
  if (groupId) {
    enrollmentFilter.groupId = new ObjectId(groupId);
  }

  const enrollments = await db
    .collection('enrollments')
    .find(enrollmentFilter, { projection: { userId: 1 } })
    .toArray();

  const userIds = enrollments.map((e) => e.userId);
  if (userIds.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const tokenDocs = await db
    .collection(COLLECTION_DEVICE_TOKENS)
    .find({ userId: { $in: userIds } }, { projection: { token: 1 } })
    .toArray();

  const tokens = tokenDocs.map((d) => d.token);
  const result = await sendToTokens({ messaging, tokens, title, body, data });
  await removeInvalidTokens({ db, invalidTokens: result.invalidTokens });

  return { sent: result.sent, failed: result.failed };
}

/**
 * Dispatch all due scheduled notifications and mark them as sent.
 * Called by the cron scheduler every 60 seconds.
 *
 * @param {{ db: object }} params
 */
export async function dispatchDueNotifications({ db }) {
  const messaging = await getFirebaseMessaging();
  const now = new Date();

  const due = await db
    .collection(COLLECTION_SCHEDULED)
    .find({ sent: false, scheduledAt: { $lte: now } })
    .toArray();

  for (const notification of due) {
    let dispatched = false;
    try {
      const result = await sendStudyNotification({
        db,
        messaging,
        studyId: notification.studyId.toString(),
        groupId: notification.groupId
          ? notification.groupId.toString()
          : undefined,
        title: notification.title,
        body: notification.body,
        data: notification.data,
      });
      if (result.sent === 0 && result.failed > 0) {
        console.warn(
          '[notification] All sends failed for notification',
          notification._id.toString(),
          'failed:',
          result.failed
        );
      }
      dispatched = true;
    } catch (err) {
      console.error(
        '[notification] Error dispatching scheduled notification',
        notification._id.toString(),
        'studyId:',
        notification.studyId?.toString(),
        'scheduledAt:',
        notification.scheduledAt?.toISOString(),
        err
      );
    }

    if (dispatched) {
      await db
        .collection(COLLECTION_SCHEDULED)
        .updateOne(
          { _id: notification._id },
          { $set: { sent: true, sentAt: now } }
        );
    }
  }
}

/**
 * Attempt to acquire a Redis distributed lock for the notification scheduler tick.
 * Returns { redis, lockAcquired } — callers must release the lock when done.
 * If Redis is unavailable, returns { redis: null, lockAcquired: false } so the
 * caller proceeds without distributed locking.
 * @param {string} redisUrl
 * @param {string} lockToken - Unique token to identify ownership of the lock
 * @returns {Promise<{ redis: object|null, lockAcquired: boolean }>}
 */
async function _acquireSchedulerLock(redisUrl, lockToken) {
  if (!redisUrl) return { redis: null, lockAcquired: false };

  let redis = null;
  try {
    const { createClient } = await import('redis');
    redis = createClient({ url: redisUrl });
    redis.on('error', () => {}); // suppress unhandled error events
    await redis.connect();
    const lockSet = await redis.set('hhh:notif-lock', lockToken, {
      NX: true,
      PX: 55000,
    });
    if (!lockSet) {
      await redis.quit();
      return { redis: null, lockAcquired: false };
    }
    return { redis, lockAcquired: true };
  } catch (redisErr) {
    console.warn(
      '[notification] Redis unavailable — proceeding unlocked:',
      redisErr.message
    );
    return { redis: null, lockAcquired: false };
  }
}

/**
 * Release a Redis distributed lock using a compare-and-delete Lua script.
 * @param {object} redis - Connected Redis client
 * @param {string} lockToken - Token used when the lock was acquired
 * @returns {Promise<void>}
 */
async function _releaseSchedulerLock(redis, lockToken) {
  try {
    // Only delete if we still own the lock (compare-and-delete via Lua)
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: ['hhh:notif-lock'], arguments: [lockToken] }
    );
  } catch (_) {
    // ignore lock-release errors
  }
  await redis.quit().catch(() => {});
}

/**
 * Start the node-cron scheduler that dispatches due notifications every 60 s.
 * Returns the cron task (call task.stop() to halt it).
 *
 * Dispatches two independent stores on each tick:
 *  - legacy `scheduledNotifications` (via `dispatchDueNotifications`), and
 *  - admin-created `notification_campaigns` with a `scheduledFor` in the past
 *    (via `dispatchDueCampaigns`). Campaign recipients live in Neo4j, so a
 *    `neo4jRun` runner must be supplied for scheduled campaigns to resolve
 *    anyone; without it, this half no-ops.
 *
 * @param {{ getDb: function, redisUrl?: string, neo4jRun?: Function }} params
 * @returns {object} cron task
 */
export function startNotificationScheduler({ getDb, redisUrl, neo4jRun } = {}) {
  const task = cron.schedule('* * * * *', async () => {
    const lockToken = Math.random().toString(36).slice(2);
    const { redis, lockAcquired } = await _acquireSchedulerLock(
      redisUrl,
      lockToken
    );

    // If Redis is configured but lock was not acquired, another instance holds it.
    if (redisUrl && !lockAcquired && redis === null) {
      return; // another instance holds the lock — skip this tick
    }

    try {
      const db = await getDb();
      await dispatchDueNotifications({ db });

      // Scheduled admin campaigns (separate collection + Neo4j-resolved
      // recipients). Only runs when a Neo4j runner is available.
      if (neo4jRun) {
        const dispatched = await dispatchDueCampaigns({
          db,
          neo4jRun,
          send: (tokens, title, body) =>
            fcmSendMulticast({ db, tokens, title, body }),
        });
        for (const c of dispatched) {
          log.info(
            {
              campaignId: c.id,
              recipientCount: c.recipientCount,
              resolvedUserCount: c.resolvedUserCount,
              tokenCount: c.tokenCount,
            },
            '[notification] dispatched scheduled campaign'
          );
        }
      }
    } catch (err) {
      log.error({ err: err }, '[notification] error');
    } finally {
      if (redis && lockAcquired) {
        await _releaseSchedulerLock(redis, lockToken);
      }
    }
  });
  return task;
}

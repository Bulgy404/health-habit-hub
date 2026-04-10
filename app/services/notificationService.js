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
      await sendStudyNotification({
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
      dispatched = true;
    } catch (err) {
      console.error(
        '[notification] Error dispatching scheduled notification:',
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
 * Start the node-cron scheduler that dispatches due notifications every 60 s.
 * Returns the cron task (call task.stop() to halt it).
 *
 * @param {{ getDb: function }} params
 * @returns {object} cron task
 */
export function startNotificationScheduler({ getDb }) {
  const task = cron.schedule('* * * * *', async () => {
    try {
      const db = await getDb();
      await dispatchDueNotifications({ db });
    } catch (err) {
      console.error('[notification] Scheduler error:', err);
    }
  });
  return task;
}

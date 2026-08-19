import express from 'express';
import { ObjectId } from 'mongodb';
import { makeGetDb } from '../utils/getDb.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION_DEVICE_TOKENS } from '../services/notificationService.js';
import { getEnrollment } from '../services/enrollmentNeo4j.js';
import {
  resolveEffectiveAssignments,
  getQuestionnaireCompletionStatus,
} from '../services/questionnaireScheduleService.js';
import { resolveLocaleText } from '../utils/localeText.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'participantRouter' });

export function createParticipantRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /participant/questionnaires:
   *   get:
   *     summary: Get questionnaires for the authenticated participant's enrolled study
   *     description: Returns the questionnaires linked to the study the participant is enrolled in.
   *     tags: [Participant]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of questionnaire definitions for the participant's study
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id: { type: string }
   *                   slug: { type: string }
   *                   title: { type: string }
   *                   description: { type: string }
   *                   version: { type: string }
   *                   questions: { type: array }
   *                   available: { type: boolean, description: "Has an open window due now — tappable/fillable" }
   *                   completedAt: { type: string, format: date-time, nullable: true, description: "Most recent submission that closed a window" }
   *                   nextDueAt: { type: string, format: date-time, nullable: true, description: "Earliest still-open window's due date, whether due now or in the future" }
   *       401:
   *         description: Missing or invalid JWT
   *       404:
   *         description: Participant not enrolled in any study
   */
  router.get('/questionnaires', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const lang = req.query.lang || 'en';

      const database = await getDb();

      const enrollment = neo4jRun
        ? await getEnrollment(neo4jRun, String(userId))
        : null;

      if (!enrollment) {
        return res.status(404).json({ error: 'Not enrolled in any study' });
      }

      let studyOid;
      try {
        studyOid = new ObjectId(enrollment.studyId);
      } catch {
        return res.status(404).json({ error: 'Not enrolled in any study' });
      }

      const study = await database
        .collection(STUDIES)
        .findOne({ _id: studyOid });

      if (!study || !study.isActive) {
        return res.status(404).json({ error: 'Study not found or inactive' });
      }

      const assignments = await resolveEffectiveAssignments({
        db: database,
        studyId: studyOid,
        groupId: enrollment.groupId ?? null,
      });
      const questionnaireIds = assignments.map((a) => a.questionnaireId);

      if (questionnaireIds.length === 0) {
        return res.json([]);
      }

      const docs = await database
        .collection('questionnaires')
        .find({ _id: { $in: questionnaireIds } })
        .toArray();

      const statusBySlug = await getQuestionnaireCompletionStatus({
        db: database,
        userId,
        slugs: docs.map((q) => q.slug),
      });

      // Habit-scoped questionnaires (e.g. a custom one an admin defines,
      // anchored to habit creation like SRHI) only make sense once the
      // participant has actually encountered them via a habit — i.e. has (or
      // has had) a window for them (see generateHabitCreationWindows).
      // Study-scoped ones are always listed once assigned, same as today.
      const visibleDocs = docs.filter(
        (q) => q.scope !== 'habit' || statusBySlug.has(q.slug)
      );

      res.json(
        visibleDocs.map((q) => {
          const languages = q.languages || ['en'];
          // No status entry means no window was ever generated for this
          // slug (e.g. a legacy ad-hoc questionnaire outside the
          // assignment/window system) — leave it open/always-fillable
          // rather than hiding or disabling it.
          const status = statusBySlug.get(q.slug) ?? {
            available: true,
            completedAt: null,
            nextDueAt: null,
          };
          return {
            id: q._id.toString(),
            slug: q.slug,
            title: resolveLocaleText(q.title, lang, languages),
            description: resolveLocaleText(q.description, lang, languages),
            version: q.version || '1',
            questions: (q.questions || []).map((question) => ({
              ...question,
              text: resolveLocaleText(question.text, lang, languages),
              options: (question.options || []).map((o) => ({
                ...o,
                label: resolveLocaleText(o.label, lang, languages),
              })),
            })),
            available: status.available,
            completedAt: status.completedAt,
            nextDueAt: status.nextDueAt,
          };
        })
      );
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /participant/register-token:
   *   post:
   *     summary: Register or refresh FCM device token for the authenticated participant
   *     tags: [Participant]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token]
   *             properties:
   *               token:
   *                 type: string
   *                 description: Firebase Cloud Messaging device token
   *               deviceId:
   *                 type: string
   *                 description: Stable per-device identifier (identifierForVendor on iOS, ANDROID_ID on Android). When present, this device's registration is kept separate from the participant's other devices instead of overwriting them.
   *               platform:
   *                 type: string
   *                 description: e.g. "ios", "android", "web"
   *               model:
   *                 type: string
   *                 description: Device model string
   *               appVersion:
   *                 type: string
   *                 description: "App version, e.g. 1.1.1+5"
   *     responses:
   *       200:
   *         description: Token registered or updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *       400:
   *         description: Missing or invalid token field
   *       401:
   *         description: Missing or invalid JWT
   */
  router.post('/register-token', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { token, deviceId, platform, model, appVersion } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'token is required' });
      }

      // A deviceId lets this participant register several devices, each
      // keeping its own doc (see notificationService.js / notificationCampaignService.js,
      // which already query deviceTokens with .find({userId}) — i.e. already
      // tolerate multiple docs per user, so no push-sending changes needed
      // here). Without one (older app builds that predate device tracking),
      // fall back to the original single-doc-per-user upsert so those
      // installs keep working unchanged.
      const hasDeviceId = typeof deviceId === 'string' && deviceId.length > 0;
      const filter = hasDeviceId
        ? { userId: String(userId), deviceId: String(deviceId) }
        : { userId: String(userId) };

      const setFields = {
        userId: String(userId),
        token: String(token),
        updatedAt: new Date(),
      };
      if (hasDeviceId) setFields.deviceId = String(deviceId);
      if (typeof platform === 'string') setFields.platform = platform;
      if (typeof model === 'string') setFields.model = model;
      if (typeof appVersion === 'string') setFields.appVersion = appVersion;

      const database = await getDb();
      const collection = database.collection(COLLECTION_DEVICE_TOKENS);
      await collection.updateOne(filter, { $set: setFields }, { upsert: true });
      if (hasDeviceId) {
        // An app build older than device tracking would have left a single
        // legacy doc keyed only by {userId} (no deviceId field). Once this
        // same participant registers with a deviceId (i.e. updated to a
        // build that supports it), that legacy doc is superseded — remove
        // it so it doesn't linger as a stale, unidentifiable "device" and
        // double up push sends to what's really the same device.
        await collection.deleteOne({
          userId: String(userId),
          deviceId: { $exists: false },
        });
      }

      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createParticipantRouter;

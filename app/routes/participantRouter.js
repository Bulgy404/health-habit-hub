import express from 'express';
import { ObjectId } from 'mongodb';
import { makeGetDb } from '../utils/getDb.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION_DEVICE_TOKENS } from '../services/notificationService.js';
import { getEnrollment } from '../services/enrollmentNeo4j.js';
import { resolveEffectiveAssignments } from '../services/questionnaireScheduleService.js';
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

      res.json(
        docs.map((q) => {
          const languages = q.languages || ['en'];
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

      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'token is required' });
      }

      const database = await getDb();
      await database.collection(COLLECTION_DEVICE_TOKENS).updateOne(
        { userId: String(userId) },
        {
          $set: {
            userId: String(userId),
            token: String(token),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createParticipantRouter;

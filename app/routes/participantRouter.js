import express from 'express';
import { ObjectId } from 'mongodb';
import { makeGetDb } from '../utils/getDb.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION_DEVICE_TOKENS } from '../services/notificationService.js';

export function createParticipantRouter({ db } = {}) {
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

      const database = await getDb();

      const enrollment = await database
        .collection(ENROLLMENTS)
        .findOne({ userId: String(userId) });

      if (!enrollment) {
        return res.status(404).json({ error: 'Not enrolled in any study' });
      }

      const study = await database
        .collection(STUDIES)
        .findOne({ _id: enrollment.studyId });

      if (!study || !study.isActive) {
        return res.status(404).json({ error: 'Study not found or inactive' });
      }

      const questionnaireIds = (study.questionnaires || []).filter(
        (id) => id instanceof ObjectId
      );

      if (questionnaireIds.length === 0) {
        return res.json([]);
      }

      const docs = await database
        .collection('questionnaires')
        .find({ _id: { $in: questionnaireIds } })
        .toArray();

      res.json(
        docs.map((q) => ({
          id: q._id.toString(),
          slug: q.slug,
          title: q.title,
          description: q.description || '',
          version: q.version || '1',
          questions: q.questions || [],
        }))
      );
    } catch (err) {
      console.error('[route] Error:', err);
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
      await database
        .collection(COLLECTION_DEVICE_TOKENS)
        .updateOne(
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
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createParticipantRouter;

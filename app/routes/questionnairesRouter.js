import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { getDueQuestionnaires } from '../services/questionnaireScheduleService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'questionnairesRouter' });

export function createQuestionnairesRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /questionnaires:
   *   get:
   *     summary: List active questionnaire definitions
   *     description: Returns all active questionnaire definitions (slug, title, description, version, question count).
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of active questionnaire definitions
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   slug: { type: string, example: sliq }
   *                   title: { type: string }
   *                   description: { type: string }
   *                   version: { type: string }
   *                   questionCount: { type: integer }
   *       401:
   *         description: Missing or invalid JWT
   */
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const docs = await database
        .collection('questionnaires')
        .find({ active: true })
        .toArray();
      res.json(
        docs.map((q) => ({
          slug: q.slug,
          title: q.title,
          description: q.description,
          version: q.version,
          questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
        }))
      );
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/questionnaires/due — the participant's due + upcoming
  // scheduled questionnaires (must be declared before the /:slug route).
  router.get('/due', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const database = await getDb();
      const due = await getDueQuestionnaires({ db: database, userId });
      res.json(due);
    } catch (err) {
      log.error({ err: err }, '[questionnaires] due error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /questionnaires/{slug}:
   *   get:
   *     summary: Get a questionnaire definition by slug
   *     description: Returns the full questionnaire definition including all questions and options.
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Questionnaire slug (e.g. sliq, rand-36)
   *         example: sliq
   *     responses:
   *       200:
   *         description: Full questionnaire definition
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 slug: { type: string }
   *                 title: { type: string }
   *                 description: { type: string }
   *                 version: { type: string }
   *                 questions:
   *                   type: array
   *                   items:
   *                     type: object
   *       401:
   *         description: Missing or invalid JWT
   *       404:
   *         description: Questionnaire not found
   */
  router.get('/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const database = await getDb();
      const doc = await database
        .collection('questionnaires')
        .findOne({ slug, active: true });
      if (!doc) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      res.json({
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        version: doc.version,
        questions: doc.questions || [],
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

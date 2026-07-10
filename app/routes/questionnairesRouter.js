import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { getDueQuestionnaires } from '../services/questionnaireScheduleService.js';
import { resolveLocaleText } from '../utils/localeText.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'questionnairesRouter' });

/** Resolves a questionnaire doc's title/description/questions to flat strings for [lang]. */
function resolveQuestionnaire(doc, lang) {
  const languages = doc.languages || ['en'];
  return {
    slug: doc.slug,
    title: resolveLocaleText(doc.title, lang, languages),
    description: resolveLocaleText(doc.description, lang, languages),
    version: doc.version,
    languages,
    questions: (doc.questions || []).map((q) => ({
      ...q,
      text: resolveLocaleText(q.text, lang, languages),
      options: (q.options || []).map((o) => ({
        ...o,
        label: resolveLocaleText(o.label, lang, languages),
      })),
    })),
  };
}

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
      const lang = req.query.lang || 'en';
      const database = await getDb();
      const docs = await database
        .collection('questionnaires')
        .find({ active: true })
        .toArray();
      res.json(
        docs.map((q) => {
          const languages = q.languages || ['en'];
          return {
            slug: q.slug,
            title: resolveLocaleText(q.title, lang, languages),
            description: resolveLocaleText(q.description, lang, languages),
            version: q.version,
            questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
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
   * /questionnaires/due:
   *   get:
   *     summary: The participant's due + upcoming scheduled questionnaires
   *     description: >
   *       Returns questionnaires due now or within the next 30 days for the
   *       authenticated participant, their reminder settings, and their
   *       study's end date / end-of-study notification config (present even
   *       when no questionnaires are currently due).
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Due questionnaires and study reminder/end-of-study config
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 reminders:
   *                   type: object
   *                   properties:
   *                     enabled: { type: boolean }
   *                     hour: { type: integer, minimum: 0, maximum: 23 }
   *                 questionnaires:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       windowId: { type: string }
   *                       questionnaireSlug: { type: string }
   *                       questionnaireTitle: { type: string }
   *                       occurrence: { type: integer }
   *                       scheduledFor: { type: string, format: date-time }
   *                       isDue: { type: boolean }
   *                 studyEndDate:
   *                   type: string
   *                   format: date-time
   *                   nullable: true
   *                 endOfStudyNotification:
   *                   type: object
   *                   properties:
   *                     enabled: { type: boolean }
   *                     title: { type: string }
   *                     body: { type: string }
   *       401:
   *         description: Missing or invalid JWT
   */
  router.get('/due', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const lang = req.query.lang || 'en';
      const database = await getDb();
      const due = await getDueQuestionnaires({ db: database, userId, lang });
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
      const lang = req.query.lang || 'en';
      const database = await getDb();
      const doc = await database
        .collection('questionnaires')
        .findOne({ slug, active: true });
      if (!doc) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      res.json(resolveQuestionnaire(doc, lang));
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

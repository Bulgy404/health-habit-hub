import cookieParser from 'cookie-parser';
import express from 'express';
import { v4 as uuid } from 'uuid';
import { renderSurvey, submitSurvey } from '../controllers/surveyController.js';

// Legacy static router (kept for backward compat with old non-v1 routes)
const legacyRouter = express.Router();
legacyRouter.use(cookieParser());
legacyRouter.use((req, res, next) => {
  let userId = req.cookies.userId;
  if (!userId) {
    userId = uuid();
    res.cookie('userId', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    });
  }
  req.userId = userId;
  next();
});
legacyRouter.get('/', (req, res) => res.json({ ok: true }));
legacyRouter.get('/:id', renderSurvey);
legacyRouter.post('/:id/complete', submitSurvey);

export default legacyRouter;

// Factory for v1 router: returns surveys filtered by group for participants,
// and all surveys for admin/researcher.
export function createSurveyRouter({ db } = {}) {
  const router = express.Router();

  async function getDb() {
    if (db) return db;
    const { connect } = await import('../models/survey.js');
    return connect();
  }

  /**
   * @swagger
   * /surveys:
   *   get:
   *     summary: List surveys
   *     description: Participants see only published surveys assigned to their study group. Admins and researchers see all surveys regardless of status.
   *     tags: [Surveys]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of surveys
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Survey'
   *             example:
   *               - id: survey-uuid-001
   *                 title: Baseline Questionnaire
   *                 type: questionnaire
   *                 status: published
   *                 assignedGroups: [G1, G2]
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/surveys – participant sees only published surveys for their group
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const roles = req.user?.realm_access?.roles || [];
      const isAdminOrResearcher =
        roles.includes('admin') || roles.includes('researcher');

      if (isAdminOrResearcher) {
        const docs = await database.collection('surveys').find({}).toArray();
        return res.json(
          docs.map((s) => ({
            id: s.id,
            title: s.title,
            type: s.type,
            status: s.status,
            assignedGroups: s.assignedGroups || [],
          }))
        );
      }

      // For participants: look up their group from the participants collection
      const userId = req.user?.sub;
      let group = null;
      if (userId) {
        const participant = await database
          .collection('participants')
          .findOne({ userId, deletedAt: { $exists: false } });
        group = participant?.group || null;
      }

      // Return published surveys assigned to the caller's group
      const filter = { status: 'published' };
      if (group) {
        filter.assignedGroups = group;
      }
      const docs = await database.collection('surveys').find(filter).toArray();
      res.json(
        docs.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          status: s.status,
          assignedGroups: s.assignedGroups || [],
        }))
      );
    } catch (err) {
      console.error('[route] Error:', err);
      res.json([]);
    }
  });

  /**
   * @swagger
   * /surveys/{id}:
   *   get:
   *     summary: Get a single survey by ID
   *     description: Returns the full survey including JSON schema (SurveyJS definition) and assigned groups.
   *     tags: [Surveys]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Survey UUID
   *         example: survey-uuid-001
   *     responses:
   *       200:
   *         description: Survey detail
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/Survey'
   *                 - type: object
   *                   properties:
   *                     jsonSchema:
   *                       type: object
   *                       description: SurveyJS JSON definition
   *             example:
   *               id: survey-uuid-001
   *               title: Baseline Questionnaire
   *               type: questionnaire
   *               status: published
   *               assignedGroups: [G1, G2]
   *               jsonSchema: { pages: [] }
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Survey not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: Survey not found
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/surveys/:id/render?lang=en|de
  // Returns the survey definition with the requested locale for client-side
  // SurveyJS rendering. Defaults to 'en' when lang is absent or unsupported.
  router.get('/:id/render', async (req, res) => {
    try {
      const { id } = req.params;
      const lang = ['en', 'de'].includes(req.query.lang)
        ? req.query.lang
        : 'en';
      const database = await getDb();
      const survey = await database.collection('surveys').findOne({ id });
      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      res.json({
        id: survey.id,
        title: survey.title,
        lang,
        jsonSchema: survey.jsonSchema || {},
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/surveys/:id
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const database = await getDb();
      const survey = await database.collection('surveys').findOne({ id });
      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      res.json({
        id: survey.id,
        title: survey.title,
        type: survey.type,
        status: survey.status,
        jsonSchema: survey.jsonSchema || {},
        assignedGroups: survey.assignedGroups || [],
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /surveys/{id}/results:
   *   post:
   *     summary: Submit survey answers
   *     description: Stores the authenticated participant's answers for a specific survey. Returns a confirmation with completion timestamp.
   *     tags: [Surveys]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Survey UUID
   *         example: survey-uuid-001
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               answers:
   *                 type: object
   *                 additionalProperties: true
   *                 description: SurveyJS answer map (question name → value)
   *                 example: { q1: "yes", q2: 42 }
   *     responses:
   *       201:
   *         description: Survey response recorded
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *                 surveyId: { type: string, example: survey-uuid-001 }
   *                 completedAt: { type: string, format: date-time }
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Survey not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/v1/surveys/:id/results
  router.post('/:id/results', async (req, res) => {
    try {
      const { id } = req.params;
      const { answers } = req.body;
      const userId = req.user?.sub;
      const database = await getDb();

      const survey = await database.collection('surveys').findOne({ id });
      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }

      const result = {
        surveyId: id,
        surveyTitle: survey.title || '',
        participantId: userId,
        answers: answers || {},
        completedAt: new Date(),
      };
      await database.collection('survey_responses').insertOne(result);
      res
        .status(201)
        .json({ ok: true, surveyId: id, completedAt: result.completedAt });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

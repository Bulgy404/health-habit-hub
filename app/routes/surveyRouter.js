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
    res.cookie('userId', userId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
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

  // GET /api/v1/surveys – participant sees only published surveys for their group
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const roles = req.user?.realm_access?.roles || [];
      const isAdminOrResearcher = roles.includes('admin') || roles.includes('researcher');

      if (isAdminOrResearcher) {
        const docs = await database.collection('surveys').find({}).toArray();
        return res.json(docs.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          status: s.status,
          assignedGroups: s.assignedGroups || [],
        })));
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
    } catch {
      res.json([]);
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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
      res.status(201).json({ ok: true, surveyId: id, completedAt: result.completedAt });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

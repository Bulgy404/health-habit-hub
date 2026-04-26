import cookieParser from 'cookie-parser';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { makeGetDb } from '../utils/getDb.js';
import { isPrivileged } from '../middleware/roles.js';
import { renderSurvey, submitSurvey } from '../controllers/surveyController.js';
import {
  normalizeSurveyTargetMode,
  canParticipantAccessSurvey,
} from '../utils/surveyTargeting.js';

// Legacy static router (kept for backward compat with old non-v1 routes)
const legacyRouter = express.Router();
legacyRouter.use(cookieParser());
legacyRouter.use((req, res, next) => {
  let userId = req.cookies.userId;
  if (!userId) {
    userId = randomUUID();
    res.cookie('userId', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }
  req.userId = userId;
  next();
});
legacyRouter.get('/', (req, res) => res.json({ ok: true }));
legacyRouter.get('/:id', renderSurvey);
legacyRouter.post('/:id/complete', submitSurvey);

export default legacyRouter;

function formatSurvey(s) {
  return {
    id: s.id,
    title: s.title,
    type: s.type,
    status: s.status,
    targetMode: normalizeSurveyTargetMode(s),
    assignedGroups: s.assignedGroups || [],
  };
}

async function getParticipantGroup(db, userId) {
  if (!userId) return null;
  const participant = await db
    .collection('participants')
    .findOne({ userId, deletedAt: { $exists: false } });
  return participant?.group || null;
}

/**
 * Fallback SurveyJS schema for the habit-donation survey when the stored
 * jsonSchema is empty. Provides multilingual (en/de) ratings about the
 * donated habit's frequency, duration, and perceived health benefit.
 * @returns {object} SurveyJS JSON schema
 */
function _defaultHabitDonationSchema() {
  return {
    locale: 'en',
    title: {
      en: 'Tell us about your habit',
      de: 'Erzähl uns von deiner Gewohnheit',
    },
    description: {
      en: 'A few quick questions about the habit you are donating.',
      de: 'Ein paar kurze Fragen zur Gewohnheit, die du spendest.',
    },
    showProgressBar: 'top',
    completeText: { en: 'Donate habit', de: 'Gewohnheit spenden' },
    pages: [
      {
        name: 'habit_info',
        elements: [
          {
            type: 'rating',
            name: 'frequency',
            title: {
              en: 'How often do you do this habit?',
              de: 'Wie oft führst du diese Gewohnheit aus?',
            },
            rateValues: [
              { value: 1, text: { en: 'Rarely', de: 'Selten' } },
              { value: 2, text: { en: 'Weekly', de: 'Wöchentlich' } },
              {
                value: 3,
                text: {
                  en: 'Several times/week',
                  de: 'Mehrmals/Woche',
                },
              },
              { value: 4, text: { en: 'Daily', de: 'Täglich' } },
            ],
            isRequired: true,
          },
          {
            type: 'rating',
            name: 'duration',
            title: {
              en: 'How long have you had this habit?',
              de: 'Wie lange hast du diese Gewohnheit schon?',
            },
            rateValues: [
              {
                value: 1,
                text: {
                  en: 'Less than a month',
                  de: 'Weniger als einen Monat',
                },
              },
              {
                value: 2,
                text: { en: '1–3 months', de: '1–3 Monate' },
              },
              {
                value: 3,
                text: { en: '3–12 months', de: '3–12 Monate' },
              },
              {
                value: 4,
                text: {
                  en: 'More than a year',
                  de: 'Mehr als ein Jahr',
                },
              },
            ],
            isRequired: true,
          },
          {
            type: 'rating',
            name: 'health_benefit',
            title: {
              en: 'How much does this habit benefit your health?',
              de: 'Wie sehr profitiert deine Gesundheit von dieser Gewohnheit?',
            },
            rateMin: 1,
            rateMax: 5,
            minRateDescription: { en: 'Not at all', de: 'Gar nicht' },
            maxRateDescription: { en: 'Very much', de: 'Sehr viel' },
            isRequired: true,
          },
          {
            type: 'rating',
            name: 'wellbeing_impact',
            title: {
              en: 'How much does this habit improve your overall wellbeing?',
              de: 'Wie sehr verbessert diese Gewohnheit dein allgemeines Wohlbefinden?',
            },
            rateMin: 1,
            rateMax: 5,
            minRateDescription: { en: 'Not at all', de: 'Gar nicht' },
            maxRateDescription: { en: 'Very much', de: 'Sehr viel' },
            isRequired: true,
          },
        ],
      },
    ],
  };
}

async function findSurveyByIdentifier(db, identifier) {
  const byId = await db.collection('surveys').findOne({ id: identifier });
  if (byId) return byId;

  const byType = await db
    .collection('surveys')
    .find({ type: identifier })
    .toArray();
  if (byType.length === 0) return null;
  const published = byType.find((survey) => survey.status === 'published');
  return published || byType[0];
}

/**
 * Return surveys visible to the calling user.
 * Admins and researchers see all surveys. Participants see published surveys
 * based on explicit targeting rules.
 * @param {{ db: object, user: object }} params
 * @returns {Promise<Array>}
 */
async function getSurveysForUser({ db, user }) {
  if (isPrivileged(user)) {
    const docs = await db.collection('surveys').find({}).toArray();
    return docs.map(formatSurvey);
  }
  const group = await getParticipantGroup(db, user?.sub);
  const docs = await db
    .collection('surveys')
    .find({ status: 'published' })
    .toArray();
  return docs
    .filter((survey) => canParticipantAccessSurvey(survey, group))
    .map(formatSurvey);
}

// Factory for v1 router: returns surveys filtered by group for participants,
// and all surveys for admin/researcher.
export function createSurveyRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

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
      const surveys = await getSurveysForUser({
        db: await getDb(),
        user: req.user,
      });
      res.json(surveys);
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
  // Returns an HTML page that renders the SurveyJS survey client-side. The
  // Flutter WebView injects JS after onPageFinished that looks for
  // window.survey.onComplete, so this page must expose the survey model on
  // window.survey. Defaults to 'en' when lang is absent or unsupported.
  router.get('/:id/render', async (req, res) => {
    try {
      const { id } = req.params;
      const lang = ['en', 'de'].includes(req.query.lang)
        ? req.query.lang
        : 'en';
      const database = await getDb();
      const survey = await findSurveyByIdentifier(database, id);
      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      if (!isPrivileged(req.user)) {
        const group = await getParticipantGroup(database, req.user?.sub);
        if (!canParticipantAccessSurvey(survey, group)) {
          return res.status(404).json({ error: 'Survey not found' });
        }
      }

      const hasSchema =
        survey.jsonSchema &&
        typeof survey.jsonSchema === 'object' &&
        Object.keys(survey.jsonSchema).length > 0;
      const schema = JSON.stringify(
        hasSchema ? survey.jsonSchema : _defaultHabitDonationSchema(),
      );
      const safeTitle = String(survey.title || 'Survey').replace(
        /[<>&"']/g,
        (c) =>
          ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;',
          })[c],
      );

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${safeTitle}</title>
<link rel="stylesheet" href="https://unpkg.com/survey-core@1.12.28/defaultV2.min.css">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { padding: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #1a1a1a; }
  .sv-root-modern { --primary: #45B700; }
  #survey-container { max-width: 720px; margin: 0 auto; }
</style>
</head>
<body>
<div id="survey-container"></div>
<script src="https://unpkg.com/survey-core@1.12.28/survey.core.min.js"></script>
<script src="https://unpkg.com/survey-js-ui@1.12.28/survey-js-ui.min.js"></script>
<script>
  (function() {
    var surveyJson = ${schema};
    try {
      window.survey = new Survey.Model(surveyJson);
      window.survey.locale = ${JSON.stringify(lang)};
      window.survey.render(document.getElementById("survey-container"));
    } catch (e) {
      document.getElementById("survey-container").textContent =
        "Failed to render survey: " + (e && e.message ? e.message : e);
    }
  })();
</script>
</body>
</html>`);
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
      const survey = await findSurveyByIdentifier(database, id);
      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      if (!isPrivileged(req.user)) {
        const group = await getParticipantGroup(database, req.user?.sub);
        if (!canParticipantAccessSurvey(survey, group)) {
          return res.status(404).json({ error: 'Survey not found' });
        }
      }
      res.json({
        id: survey.id,
        title: survey.title,
        type: survey.type,
        status: survey.status,
        targetMode: normalizeSurveyTargetMode(survey),
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

      const survey = await findSurveyByIdentifier(database, id);
      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      if (!isPrivileged(req.user)) {
        const group = await getParticipantGroup(database, req.user?.sub);
        if (!canParticipantAccessSurvey(survey, group)) {
          return res.status(404).json({ error: 'Survey not found' });
        }
      }

      const result = {
        surveyId: survey.id,
        surveyTitle: survey.title || '',
        participantId: userId,
        answers: answers || {},
        completedAt: new Date(),
      };
      await database.collection('survey_responses').insertOne(result);
      res.status(201).json({
        ok: true,
        surveyId: survey.id,
        completedAt: result.completedAt,
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

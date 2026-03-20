import express from 'express';

export function createQuestionnaireResponsesRouter({ db } = {}) {
  const router = express.Router();

  async function getDb() {
    if (db) return db;
    const { connect } = await import('../models/survey.js');
    return connect();
  }

  /**
   * @swagger
   * /questionnaire-responses:
   *   post:
   *     summary: Submit a questionnaire response
   *     description: Saves the authenticated user's answers for a questionnaire to the form_responses MongoDB collection.
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [questionnaireSlug, answers]
   *             properties:
   *               questionnaireSlug:
   *                 type: string
   *                 example: sliq
   *               answers:
   *                 type: object
   *                 description: Map of questionId to answer value
   *                 example: { "sliq_diet": "2", "sliq_activity": "3" }
   *     responses:
   *       201:
   *         description: Response saved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *       400:
   *         description: Missing required fields
   *       401:
   *         description: Missing or invalid JWT
   */
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { questionnaireSlug, answers } = req.body;
      if (!questionnaireSlug || typeof questionnaireSlug !== 'string') {
        return res.status(400).json({ error: 'questionnaireSlug is required' });
      }
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        return res.status(400).json({ error: 'answers must be an object' });
      }

      const database = await getDb();
      const result = await database.collection('form_responses').insertOne({
        userId,
        questionnaireSlug,
        answers,
        submitted_at: new Date(),
      });

      res.status(201).json({ id: result.insertedId });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

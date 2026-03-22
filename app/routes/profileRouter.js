import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

export function createProfileRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /profile:
   *   get:
   *     summary: Get the authenticated user's profile
   *     description: Returns the profile (questionnaire answers + timestamps) for the caller identified by the JWT sub claim.
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Profile found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Profile'
   *             example:
   *               userId: a1b2c3d4-1234-5678-abcd-ef0123456789
   *               answers: { age: 30, goal: "exercise more" }
   *               completedAt: "2026-03-15T10:00:00.000Z"
   *               updatedAt: "2026-03-15T10:00:00.000Z"
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: Unauthorized
   *       404:
   *         description: Profile not found for this user
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: Profile not found
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/profile – return caller's profile or 404
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const profile = await database
        .collection('profiles')
        .findOne({ userId: req.user.sub });
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = profile;
      res.json(rest);
    } catch (err) {
      console.error('[profileRouter] Error in GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /profile:
   *   post:
   *     summary: Create or update the authenticated user's profile
   *     description: Upserts the profile for the caller. Merges answers and updates timestamps.
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
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
   *                 example: { age: 30, goal: "exercise more" }
   *               completedAt:
   *                 type: string
   *                 format: date-time
   *                 example: "2026-03-15T10:00:00.000Z"
   *     responses:
   *       200:
   *         description: Profile upserted successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Profile'
   *             example:
   *               userId: a1b2c3d4-1234-5678-abcd-ef0123456789
   *               answers: { age: 30, goal: "exercise more" }
   *               completedAt: "2026-03-15T10:00:00.000Z"
   *               updatedAt: "2026-03-15T10:00:00.000Z"
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: Unauthorized
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/v1/profile – upsert caller's profile
  router.post('/', async (req, res) => {
    try {
      const database = await getDb();
      const { answers, completedAt } = req.body;
      const now = new Date();
      await database.collection('profiles').updateOne(
        { userId: req.user.sub },
        {
          $set: {
            userId: req.user.sub,
            answers: answers || {},
            completedAt: completedAt ? new Date(completedAt) : now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      const profile = await database
        .collection('profiles')
        .findOne({ userId: req.user.sub });
      const { _id, ...rest } = profile;
      res.json(rest);
    } catch (err) {
      console.error('[profileRouter] Error in POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createProfileRouter;

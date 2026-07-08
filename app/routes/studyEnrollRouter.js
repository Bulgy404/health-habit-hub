import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import {
  redeemCode,
  skipCode,
  switchStudy,
  leaveStudy,
  getEnrollmentStatus,
} from '../services/studyCodeService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'studyEnrollRouter' });

export function createStudyEnrollRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /onboarding/redeem-code:
   *   post:
   *     summary: Redeem a study enrollment code
   *     description: First-time onboarding — enrolls the participant in the code's study/group.
   *     tags: [Onboarding]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code: { type: string, example: "HHH-ABCDE" }
   *     responses:
   *       200:
   *         description: Enrolled
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EnrollmentResult'
   *       400:
   *         description: Missing or malformed code
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Code not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: Already enrolled in a study
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       410:
   *         description: Code has expired, or hit its redemption limit
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/redeem-code', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code is required' });
      }
      if (!/^HHH-[A-Z0-9]{5}$/i.test(code.trim())) {
        return res.status(400).json({
          error:
            'Invalid code format. Expected HHH-XXXXX (5 alphanumeric characters).',
        });
      }
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await redeemCode({ db: database, userId, code, neo4jRun });

      if (result.notFound)
        return res.status(404).json({ error: 'Code not found' });
      if (result.expired)
        return res.status(410).json({ error: 'Code has expired' });
      if (result.exhausted)
        return res.status(410).json({ error: 'Code redemption limit reached' });
      if (result.alreadyEnrolled)
        return res.status(409).json({ error: 'Already enrolled in a study' });

      res.json({
        studyId: result.studyId,
        groupId: result.groupId,
        studyName: result.studyName,
        groupLabel: result.groupLabel,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /onboarding/skip-code:
   *   post:
   *     summary: Enroll in the default study (no code)
   *     description: Round-robin group assignment within the platform's default study. Idempotent — safe to call again for an already-enrolled user.
   *     tags: [Onboarding]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Enrolled
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EnrollmentResult'
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       503:
   *         description: No default study configured, or it has no groups
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/skip-code', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await skipCode({ db: database, userId, neo4jRun });

      if (result.noDefaultStudy) {
        return res.status(503).json({ error: 'No default study configured' });
      }
      if (result.noGroups) {
        return res.status(503).json({ error: 'Default study has no groups' });
      }

      res.json({
        studyId: result.studyId,
        groupId: result.groupId,
        studyName: result.studyName,
        groupLabel: result.groupLabel,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /onboarding/enrollment:
   *   get:
   *     summary: Get the participant's current study/group
   *     description: Powers the "Study membership" section on the account screen.
   *     tags: [Onboarding]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Current enrollment
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/EnrollmentResult'
   *                 - type: object
   *                   properties:
   *                     isDefaultStudy: { type: boolean }
   *                     studyCodeUsed: { type: string, nullable: true }
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Not enrolled in any study
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/enrollment', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await getEnrollmentStatus({
        db: database,
        userId,
        neo4jRun,
      });

      if (result.notEnrolled) {
        return res.status(404).json({ error: 'Not enrolled in a study' });
      }
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /onboarding/switch-study:
   *   post:
   *     summary: Move to a different study via code
   *     description: >
   *       Already-donated habits, logs, and questionnaire answers keep the
   *       studyId they were stamped with at the time — only activity from
   *       this point on is attributed to the new study. Nothing is deleted.
   *     tags: [Onboarding]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code: { type: string, example: "HHH-ABCDE" }
   *     responses:
   *       200:
   *         description: Moved
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EnrollmentResult'
   *       400:
   *         description: Missing or malformed code
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Code not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: Not currently enrolled in a study, or the code targets the study already enrolled in
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       410:
   *         description: Code has expired, or hit its redemption limit
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/switch-study', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code is required' });
      }
      if (!/^HHH-[A-Z0-9]{5}$/i.test(code.trim())) {
        return res.status(400).json({
          error:
            'Invalid code format. Expected HHH-XXXXX (5 alphanumeric characters).',
        });
      }
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await switchStudy({
        db: database,
        userId,
        code,
        neo4jRun,
      });

      if (result.notEnrolled) {
        return res
          .status(409)
          .json({ error: 'Not currently enrolled in a study' });
      }
      if (result.notFound)
        return res.status(404).json({ error: 'Code not found' });
      if (result.expired)
        return res.status(410).json({ error: 'Code has expired' });
      if (result.exhausted)
        return res.status(410).json({ error: 'Code redemption limit reached' });
      if (result.alreadyInStudy)
        return res
          .status(409)
          .json({ error: 'Already enrolled in that study' });

      res.json({
        studyId: result.studyId,
        groupId: result.groupId,
        studyName: result.studyName,
        groupLabel: result.groupLabel,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /onboarding/leave-study:
   *   post:
   *     summary: Leave the current study
   *     description: >
   *       Moves the participant back to the default study (round-robin
   *       group). No data is deleted; past donations/logs/answers stay
   *       attributed to the study being left.
   *     tags: [Onboarding]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Moved to the default study
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/EnrollmentResult'
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: Not currently enrolled in a study, or already enrolled in the default study
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       503:
   *         description: No default study configured, or it has no groups
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/leave-study', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await leaveStudy({ db: database, userId, neo4jRun });

      if (result.notEnrolled) {
        return res
          .status(409)
          .json({ error: 'Not currently enrolled in a study' });
      }
      if (result.noDefaultStudy) {
        return res.status(503).json({ error: 'No default study configured' });
      }
      if (result.noGroups) {
        return res.status(503).json({ error: 'Default study has no groups' });
      }
      if (result.alreadyInDefaultStudy) {
        return res
          .status(409)
          .json({ error: 'Already enrolled in the default study' });
      }

      res.json({
        studyId: result.studyId,
        groupId: result.groupId,
        studyName: result.studyName,
        groupLabel: result.groupLabel,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createStudyEnrollRouter;

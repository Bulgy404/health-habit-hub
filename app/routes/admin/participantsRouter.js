import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import { createKeycloakAdminClient } from '../../services/keycloakAdminClient.js';
import {
  listParticipants,
  createParticipant,
  assignGroup,
  getParticipant,
  softDeleteParticipant,
} from '../../services/adminParticipantService.js';
import { getParticipantProgress } from '../../services/adminStatsService.js';
import { getParticipantResponses } from '../../services/questionnaireScheduleService.js';
import { fastForwardParticipant } from '../../services/devToolsService.js';
import { computeReminderPlans } from '../../services/reminderPlanService.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'participantsRouter' });

function testToolsEnabled() {
  return process.env.ENABLE_TEST_TOOLS === 'true';
}

export function createParticipantsRouter({
  db,
  keycloak,
  neo4jRun,
  tokenCardService: _tokenCardService,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  function getKeycloak() {
    return keycloak || createKeycloakAdminClient();
  }

  /**
   * @swagger
   * /admin/participants:
   *   get:
   *     summary: List all active participants
   *     description: Returns all participants that have not been soft-deleted.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of participant summaries
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Participant'
   *             example:
   *               - userId: a1b2c3d4-1234-5678-abcd-ef0123456789
   *                 username: p-a1b2c3d4
   *                 group: G2
   *                 enrolledAt: "2026-03-01T09:00:00.000Z"
   *                 lastActive: "2026-03-15T14:00:00.000Z"
   *                 surveyCompletionPct: 0.5
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Caller does not have admin or researcher role
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
   *   post:
   *     summary: Create a new participant
   *     description: Creates a Keycloak user with the participant role, inserts a MongoDB record, generates a token card PDF, and returns the participant identifiers plus a token card URL.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       201:
   *         description: Participant created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 userId: { type: string, format: uuid }
   *                 username: { type: string, example: p-a1b2c3d4 }
   *                 tokenCardUrl: { type: string, example: /api/v1/admin/participants/a1b2c3d4.../token-card }
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Caller does not have admin or researcher role
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
  // GET /api/v1/admin/participants/test-tools — whether dev test tools are on
  router.get('/participants/test-tools', (req, res) => {
    res.json({ enabled: testToolsEnabled() });
  });

  // POST /api/v1/admin/participants/:id/fast-forward — dev-only time travel.
  // Shifts a participant's timeline back N days so future windows become due.
  router.post('/participants/:id/fast-forward', async (req, res) => {
    if (!testToolsEnabled()) {
      return res.status(403).json({ error: 'Test tools are disabled' });
    }
    try {
      const days = Math.max(
        1,
        Math.min(365, parseInt(req.body?.days, 10) || 7)
      );
      const database = await getDb();
      const participant = await getParticipant({
        db: database,
        id: req.params.id,
      });
      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }
      const shifted = await fastForwardParticipant({
        db: database,
        neo4jRun,
        userId: req.params.id,
        days,
      });
      res.json({ ok: true, days, shifted });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/participants
  router.get('/participants', async (req, res) => {
    try {
      const database = await getDb();
      const result = await listParticipants({ db: database });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/participants
  router.post('/participants', async (req, res) => {
    try {
      const database = await getDb();
      const kc = getKeycloak();
      const result = await createParticipant({ db: database, kc });
      res.status(201).json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/participants/{id}/group:
   *   patch:
   *     summary: Assign participant to a study group
   *     description: Updates the participant's study group in MongoDB, Keycloak attributes, and Neo4j node labels.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Participant userId
   *         example: a1b2c3d4-1234-5678-abcd-ef0123456789
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [group]
   *             properties:
   *               group:
   *                 type: string
   *                 enum: [G1, G2, G3, G4]
   *                 example: G2
   *     responses:
   *       200:
   *         description: Group updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *                 userId: { type: string, format: uuid }
   *                 group: { type: string, enum: [G1, G2, G3, G4] }
   *       400:
   *         description: Invalid group value
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: Invalid group. Must be G1, G2, G3, or G4
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Caller does not have admin or researcher role
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Participant not found
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
  // PATCH /api/v1/admin/participants/:id/group
  router.patch('/participants/:id/group', async (req, res) => {
    try {
      const { id } = req.params;
      const { group } = req.body;

      if (!['G1', 'G2', 'G3', 'G4'].includes(group)) {
        return res
          .status(400)
          .json({ error: 'Invalid group. Must be G1, G2, G3, or G4' });
      }

      const database = await getDb();
      const kc = getKeycloak();
      const result = await assignGroup({
        db: database,
        kc,
        id,
        group,
      });

      if (result === null) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/participants/{id}/token-card:
   *   get:
   *     summary: Download participant token card PDF
   *     description: Returns the pre-generated PDF token card for the specified participant.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Participant userId
   *         example: a1b2c3d4-1234-5678-abcd-ef0123456789
   *     responses:
   *       200:
   *         description: PDF token card
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Caller does not have admin or researcher role
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Participant not found or token card not available
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/admin/participants/:id/token-card – returns stored PDF
  router.get('/participants/:id/token-card', async (req, res) => {
    try {
      const { id } = req.params;

      const database = await getDb();
      const participant = await getParticipant({ db: database, id });

      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      if (!participant.tokenCardPdf) {
        return res.status(404).json({ error: 'Token card not available' });
      }

      // MongoDB Binary → Buffer
      const pdfBuffer = Buffer.isBuffer(participant.tokenCardPdf)
        ? participant.tokenCardPdf
        : Buffer.from(
            participant.tokenCardPdf.buffer ?? participant.tokenCardPdf
          );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="token-card-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/participants/{id}/progress:
   *   get:
   *     summary: Get participant progress summary
   *     description: Returns profile completion status, survey responses, habit donation count, recommendation acceptance/dismissal counts, and a chronological activity timeline.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Participant userId
   *         example: a1b2c3d4-1234-5678-abcd-ef0123456789
   *     responses:
   *       200:
   *         description: Participant progress
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 profile:
   *                   type: object
   *                   properties:
   *                     completed: { type: boolean }
   *                     completedAt: { type: string, format: date-time, nullable: true }
   *                 surveys:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id: { type: string }
   *                       title: { type: string }
   *                       completedAt: { type: string, format: date-time }
   *                 habitsCount: { type: integer }
   *                 recommendations:
   *                   type: object
   *                   properties:
   *                     accepted: { type: integer }
   *                     dismissed: { type: integer }
   *                 timeline:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       type: { type: string }
   *                       timestamp: { type: string, format: date-time }
   *                       detail: { type: string }
   *             example:
   *               profile: { completed: true, completedAt: "2026-03-02T10:00:00.000Z" }
   *               surveys:
   *                 - id: survey-uuid-001
   *                   title: Baseline Questionnaire
   *                   completedAt: "2026-03-03T11:00:00.000Z"
   *               habitsCount: 7
   *               recommendations: { accepted: 3, dismissed: 1 }
   *               timeline:
   *                 - type: enrolled
   *                   timestamp: "2026-03-01T09:00:00.000Z"
   *                   detail: Participant enrolled
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Caller does not have admin or researcher role
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Participant not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/admin/participants/:id/progress
  router.get('/participants/:id/progress', async (req, res) => {
    try {
      const { id } = req.params;
      const database = await getDb();
      const result = await getParticipantProgress({
        db: database,
        neo4jRun,
        id,
      });

      if (result === null) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/participants/:id/responses — questionnaire answers
  router.get('/participants/:id/responses', async (req, res) => {
    try {
      const database = await getDb();
      const responses = await getParticipantResponses({
        db: database,
        userId: req.params.id,
      });
      res.json({ responses });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/participants/:id/reminder-plans
  router.get('/participants/:id/reminder-plans', async (req, res) => {
    try {
      const { id } = req.params;
      const database = await getDb();
      const participant = await getParticipant({ db: database, id });
      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }
      const plans = await computeReminderPlans({ db: database, userId: id });
      res.json({ plans });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/participants/{id}:
   *   delete:
   *     summary: Soft-delete a participant
   *     description: Sets deletedAt timestamp and anonymizes the username. The participant record is retained for data integrity but excluded from all participant listings.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: Participant userId
   *     responses:
   *       200:
   *         description: Participant soft-deleted
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Caller does not have admin or researcher role
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Participant not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // DELETE /api/v1/admin/participants/:id (soft delete)
  router.delete('/participants/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const database = await getDb();
      const result = await softDeleteParticipant({ db: database, id });

      if (result === null) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

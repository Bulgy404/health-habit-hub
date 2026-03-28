import express from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { makeGetDb } from '../utils/getDb.js';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import { generateTokenCard } from '../services/token_card_service.js';
import {
  listParticipants,
  createParticipant,
  assignGroup,
  getParticipant,
  softDeleteParticipant,
} from '../services/adminParticipantService.js';
import {
  getHabitsFeed,
  buildHabitsCSV,
} from '../services/adminHabitService.js';
import {
  getParticipantProgress,
  getSettings,
  updateSetting,
} from '../services/adminStatsService.js';
import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  setDefaultStudy,
  listStudyParticipants,
} from '../services/studyService.js';
import {
  createCodes,
  listCodes,
  revokeCode,
} from '../services/studyCodeService.js';
import {
  getFirebaseMessaging,
  sendStudyNotification,
  COLLECTION_SCHEDULED,
} from '../services/notificationService.js';
import {
  normalizeSurveyTargetMode,
  sanitizeSurveyTargeting,
} from '../utils/surveyTargeting.js';

const DEFAULT_SETTINGS = [{ key: 'token_card_format', value: 'both' }];

async function seedDefaultSettings(database) {
  for (const { key, value } of DEFAULT_SETTINGS) {
    const existing = await database
      .collection('admin_settings')
      .findOne({ key });
    if (!existing) {
      await database
        .collection('admin_settings')
        .insertOne({ key, value, updatedAt: new Date() });
    }
  }
}

export function createAdminRouter({
  db,
  neo4jRun,
  keycloak,
  tokenCardService,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Seed default settings asynchronously on router creation
  getDb()
    .then(seedDefaultSettings)
    .catch(() => {});

  function getKeycloak() {
    return keycloak || createKeycloakAdminClient();
  }

  function getTokenCardService() {
    return tokenCardService || { generateTokenCard };
  }

  /**
   * @swagger
   * /admin:
   *   get:
   *     summary: Admin base route health check
   *     description: Returns {"ok":true} to verify admin access is working.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Admin route is accessible
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
   *             example:
   *               error: Forbidden
   */
  // GET /api/v1/admin – base route
  router.get('/', (req, res) => {
    res.json({ ok: true });
  });

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
   *     description: Creates a Keycloak user with the participant role, inserts a MongoDB record, and returns credentials plus a token card URL.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Participant created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 userId: { type: string, format: uuid }
   *                 username: { type: string, example: p-a1b2c3d4 }
   *                 password: { type: string, example: Xk9mP2rNv7wQ }
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
  // GET /api/v1/admin/participants
  router.get('/participants', async (req, res) => {
    try {
      const database = await getDb();
      const result = await listParticipants({ db: database });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/participants
  router.post('/participants', async (req, res) => {
    try {
      const database = await getDb();
      const kc = getKeycloak();
      const result = await createParticipant({ db: database, kc });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
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
        neo4jRun,
        kc,
        id,
        group,
      });

      if (result === null) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/participants/{id}/token-card:
   *   get:
   *     summary: Download participant token card PDF
   *     description: Generates and returns a PDF token card for the specified participant. Supports QR code only, print-text only, or both formats.
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
   *       - in: query
   *         name: format
   *         required: false
   *         schema:
   *           type: string
   *           enum: [qr, print, both]
   *           default: both
   *         description: Token card output format
   *     responses:
   *       200:
   *         description: PDF token card
   *         content:
   *           application/pdf:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: Invalid format parameter
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
  // GET /api/v1/admin/participants/:id/token-card – returns PDF
  router.get('/participants/:id/token-card', async (req, res) => {
    try {
      const { id } = req.params;
      const format = req.query.format || 'both';

      if (!['qr', 'print', 'both'].includes(format)) {
        return res
          .status(400)
          .json({ error: "Invalid format. Must be 'qr', 'print', or 'both'" });
      }

      const database = await getDb();
      const participant = await getParticipant({ db: database, id });

      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      const svc = getTokenCardService();
      const pdfBuffer = await svc.generateTokenCard(
        participant.userId,
        participant.username,
        participant.password || '',
        format
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="token-card-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/settings:
   *   get:
   *     summary: Get all admin settings
   *     description: Returns a key-value map of all admin configuration settings (e.g., token_card_format).
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Settings map
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               additionalProperties: true
   *             example:
   *               token_card_format: both
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
   */
  // GET /api/v1/admin/settings
  router.get('/settings', async (req, res) => {
    try {
      const database = await getDb();
      const result = await getSettings({ db: database });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/settings/{key}:
   *   put:
   *     summary: Update an admin setting
   *     description: Upserts a single admin configuration key-value pair.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *         description: Setting key
   *         example: token_card_format
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [value]
   *             properties:
   *               value:
   *                 type: string
   *                 example: qr
   *     responses:
   *       200:
   *         description: Setting updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *                 key: { type: string, example: token_card_format }
   *                 value: { type: string, example: qr }
   *       400:
   *         description: Missing value field
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: Missing value
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
   */
  // PUT /api/v1/admin/settings/:key
  router.put('/settings/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined) {
        return res.status(400).json({ error: 'Missing value' });
      }
      const database = await getDb();
      const result = await updateSetting({ db: database, key, value });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
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
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/habits/feed/export:
   *   get:
   *     summary: Export donated habits as CSV
   *     description: Downloads all donated habits as a CSV file. Supports filtering by group, category, and date range.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: group
   *         schema: { type: string, enum: [G1, G2, G3, G4] }
   *         description: Filter by study group
   *       - in: query
   *         name: category
   *         schema: { type: string }
   *         description: Filter by habit category
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date }
   *         description: Filter habits donated on or after this date (ISO 8601)
   *         example: "2026-03-01"
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date }
   *         description: Filter habits donated on or before this date (ISO 8601)
   *         example: "2026-03-31"
   *       - in: query
   *         name: format
   *         schema: { type: string, enum: [csv], default: csv }
   *     responses:
   *       200:
   *         description: CSV file
   *         content:
   *           text/csv:
   *             schema:
   *               type: string
   *               example: "participantId,habitName,category,donatedAt\nanon-001,Walk daily,G1,2026-03-15T08:00:00.000Z"
   *       400:
   *         description: Invalid format parameter
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
   *       403:
   *         description: Caller does not have admin or researcher role
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/admin/habits/feed/export (must be before /habits/feed)
  router.get('/habits/feed/export', async (req, res) => {
    try {
      const { group, from, to, category, format = 'csv' } = req.query;

      if (format !== 'csv') {
        return res
          .status(400)
          .json({ error: "Invalid format. Only 'csv' is supported." });
      }

      const database = await getDb();
      const csv = await buildHabitsCSV({
        db: database,
        group,
        category,
        from,
        to,
      });

      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="habits-feed.csv"',
      });
      res.send(csv);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/habits/feed:
   *   get:
   *     summary: Paginated donated habits feed
   *     description: Returns paginated list of donated habits with optional filtering by group, category, and date range.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: group
   *         schema: { type: string, enum: [G1, G2, G3, G4] }
   *       - in: query
   *         name: category
   *         schema: { type: string }
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date }
   *         example: "2026-03-01"
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date }
   *         example: "2026-03-31"
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1, minimum: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
   *     responses:
   *       200:
   *         description: Paginated habit donations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 total: { type: integer, example: 142 }
   *                 page: { type: integer, example: 1 }
   *                 limit: { type: integer, example: 20 }
   *                 results:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       participantId: { type: string }
   *                       habitName: { type: string }
   *                       category: { type: string }
   *                       donatedAt: { type: string, format: date-time }
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
   */
  // GET /api/v1/admin/habits/feed
  router.get('/habits/feed', async (req, res) => {
    try {
      const { group, from, to, category, page = '1', limit = '20' } = req.query;
      const database = await getDb();
      const result = await getHabitsFeed({
        db: database,
        group,
        category,
        from,
        to,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
      });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/sessions:
   *   get:
   *     summary: List active Keycloak sessions
   *     description: Returns all active user sessions from Keycloak for the hhh realm.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of Keycloak session objects
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *             example:
   *               - id: session-abc123
   *                 userId: a1b2c3d4-...
   *                 username: p-a1b2c3d4
   *                 start: 1742000000000
   *                 lastAccess: 1742040000000
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
   */
  // GET /api/v1/admin/sessions
  router.get('/sessions', async (req, res) => {
    try {
      const kc = getKeycloak();
      const sessions = await kc.listSessions();
      res.json(sessions);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/sessions/{sessionId}:
   *   delete:
   *     summary: Revoke a Keycloak session
   *     description: Invalidates the specified Keycloak session, forcing the user to re-authenticate.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *         description: Keycloak session ID
   *         example: session-abc123
   *     responses:
   *       200:
   *         description: Session revoked
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
   */
  // DELETE /api/v1/admin/sessions/:sessionId
  router.delete('/sessions/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const kc = getKeycloak();
      await kc.revokeSession(sessionId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Survey CRUD endpoints ─────────────────────────────────────────────────

  /**
   * @swagger
   * /admin/surveys:
   *   get:
   *     summary: List all surveys (admin view)
   *     description: Returns all surveys regardless of status. Admin and researcher only.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: All surveys
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Survey'
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
   *   post:
   *     summary: Create a new survey
   *     description: Creates a new survey in draft status. Title and type are required.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [title, type]
   *             properties:
   *               title: { type: string, example: Baseline Questionnaire }
   *               type: { type: string, example: questionnaire }
   *               jsonSchema: { type: object, description: SurveyJS JSON definition }
   *               assignedGroups:
   *                 type: array
   *                 items: { type: string, enum: [G1, G2, G3, G4] }
   *                 example: [G1, G2]
   *     responses:
   *       201:
   *         description: Survey created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Survey'
   *       400:
   *         description: Missing required fields
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: title and type are required
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
   */
  // GET /api/v1/admin/surveys
  router.get('/surveys', async (req, res) => {
    try {
      const database = await getDb();
      const docs = await database.collection('surveys').find({}).toArray();
      res.json(
        docs.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          status: s.status,
          targetMode: normalizeSurveyTargetMode(s),
          jsonSchema: s.jsonSchema || {},
          assignedGroups: s.assignedGroups || [],
        }))
      );
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/surveys
  router.post('/surveys', async (req, res) => {
    try {
      const { title, type, jsonSchema, assignedGroups, targetMode } = req.body;
      if (!title || !type) {
        return res.status(400).json({ error: 'title and type are required' });
      }
      const targeting = sanitizeSurveyTargeting({
        type,
        targetMode,
        assignedGroups,
      });
      if (targeting.error) {
        return res.status(400).json({ error: targeting.error });
      }
      const database = await getDb();
      const id = randomUUID();
      const doc = {
        id,
        title,
        type,
        jsonSchema: jsonSchema || {},
        targetMode: targeting.targetMode,
        assignedGroups: targeting.assignedGroups,
        status: 'draft',
        createdAt: new Date(),
      };
      await database.collection('surveys').insertOne(doc);
      res.status(201).json({
        id,
        title,
        type,
        status: 'draft',
        targetMode: doc.targetMode,
        assignedGroups: doc.assignedGroups,
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/surveys/{id}:
   *   put:
   *     summary: Update a survey
   *     description: Updates any combination of title, type, jsonSchema, assignedGroups, or status for the specified survey.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: Survey UUID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title: { type: string }
   *               type: { type: string }
   *               jsonSchema: { type: object }
   *               assignedGroups:
   *                 type: array
   *                 items: { type: string, enum: [G1, G2, G3, G4] }
   *               status: { type: string, enum: [draft, published, archived] }
   *     responses:
   *       200:
   *         description: Survey updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *                 id: { type: string }
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
   *         description: Survey not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // PUT /api/v1/admin/surveys/:id
  router.put('/surveys/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, type, jsonSchema, assignedGroups, status, targetMode } =
        req.body;
      const database = await getDb();
      const existing = await database.collection('surveys').findOne({ id });
      if (!existing) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      const update = { updatedAt: new Date() };
      const nextType = type !== undefined ? type : existing.type;
      const nextAssignedGroups =
        assignedGroups !== undefined
          ? assignedGroups
          : existing.assignedGroups || [];
      const nextTargetMode =
        targetMode !== undefined
          ? targetMode
          : normalizeSurveyTargetMode(existing);
      const targeting = sanitizeSurveyTargeting({
        type: nextType,
        targetMode: nextTargetMode,
        assignedGroups: nextAssignedGroups,
      });
      if (targeting.error) {
        return res.status(400).json({ error: targeting.error });
      }
      if (title !== undefined) update.title = title;
      if (type !== undefined) update.type = type;
      if (jsonSchema !== undefined) update.jsonSchema = jsonSchema;
      update.targetMode = targeting.targetMode;
      update.assignedGroups = targeting.assignedGroups;
      if (status !== undefined) update.status = status;
      await database.collection('surveys').updateOne({ id }, { $set: update });
      res.json({ ok: true, id });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/surveys/{id}/status:
   *   patch:
   *     summary: Update survey status
   *     description: Transitions a survey between draft, published, and archived states.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [status]
   *             properties:
   *               status: { type: string, enum: [draft, published, archived] }
   *     responses:
   *       200:
   *         description: Status updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean }
   *                 id: { type: string }
   *                 status: { type: string }
   *       400:
   *         description: Invalid status value
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
   *       403:
   *         description: Caller does not have admin or researcher role
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
   */
  // PATCH /api/v1/admin/surveys/:id/status
  router.patch('/surveys/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!['published', 'archived', 'draft'].includes(status)) {
        return res.status(400).json({
          error: "status must be 'published', 'archived', or 'draft'",
        });
      }
      const database = await getDb();
      const result = await database
        .collection('surveys')
        .updateOne({ id }, { $set: { status, updatedAt: new Date() } });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      res.json({ ok: true, id, status });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/surveys/{id}/groups:
   *   patch:
   *     summary: Assign study groups to a survey
   *     description: Sets the list of study groups (G1-G4) that can see this survey.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [groups]
   *             properties:
   *               groups:
   *                 type: array
   *                 items: { type: string, enum: [G1, G2, G3, G4] }
   *                 example: [G1, G3]
   *     responses:
   *       200:
   *         description: Groups updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean }
   *                 id: { type: string }
   *                 assignedGroups: { type: array, items: { type: string } }
   *       400:
   *         description: Invalid groups array
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
   *       403:
   *         description: Caller does not have admin or researcher role
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
   */
  // PATCH /api/v1/admin/surveys/:id/groups
  router.patch('/surveys/:id/groups', async (req, res) => {
    try {
      const { id } = req.params;
      const { groups } = req.body;
      if (!Array.isArray(groups)) {
        return res.status(400).json({ error: 'groups must be an array' });
      }
      const valid = ['G1', 'G2', 'G3', 'G4'];
      if (groups.some((g) => !valid.includes(g))) {
        return res
          .status(400)
          .json({ error: 'groups must contain only G1, G2, G3, G4' });
      }
      const database = await getDb();
      const existing = await database.collection('surveys').findOne({ id });
      if (!existing) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      const targeting = sanitizeSurveyTargeting({
        type: existing.type,
        targetMode: 'group_assigned',
        assignedGroups: groups,
      });
      await database.collection('surveys').updateOne(
        { id },
        {
          $set: {
            targetMode: targeting.targetMode,
            assignedGroups: targeting.assignedGroups,
            updatedAt: new Date(),
          },
        }
      );
      res.json({
        ok: true,
        id,
        targetMode: targeting.targetMode,
        assignedGroups: targeting.assignedGroups,
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Questionnaire CRUD (admin) ────────────────────────────────────────────

  // GET /api/v1/admin/questionnaires
  router.get('/questionnaires', async (req, res) => {
    try {
      const database = await getDb();
      const query = {};
      if (req.query.library === 'true') query.isLibrary = true;
      const docs = await database
        .collection('questionnaires')
        .find(query)
        .toArray();
      res.json(
        docs.map((q) => ({
          id: q._id.toString(),
          slug: q.slug,
          title: q.title,
          description: q.description || '',
          version: q.version || '1',
          active: q.active !== false,
          isLibrary: q.isLibrary === true,
          questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
          updatedAt: q.updatedAt || q.createdAt || null,
        }))
      );
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/questionnaires
  router.post('/questionnaires', async (req, res) => {
    try {
      const { slug, title, description, version, questions } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'title is required' });
      }
      const database = await getDb();
      if (slug) {
        const existing = await database
          .collection('questionnaires')
          .findOne({ slug });
        if (existing) {
          return res
            .status(409)
            .json({ error: 'Questionnaire with this slug already exists' });
        }
      }
      const now = new Date();
      const doc = {
        slug: slug || null,
        title,
        description: description || '',
        version: version || '1',
        active: true,
        isLibrary: false,
        questions: Array.isArray(questions) ? questions : [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await database.collection('questionnaires').insertOne(doc);
      res.status(201).json({
        ok: true,
        id: result.insertedId.toString(),
        slug: slug || null,
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/questionnaires/:id
  router.put('/questionnaires/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let oid;
      try {
        oid = new ObjectId(id);
      } catch {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      const database = await getDb();
      const existing = await database
        .collection('questionnaires')
        .findOne({ _id: oid });
      if (!existing) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      if (existing.isLibrary === true) {
        return res
          .status(403)
          .json({ error: 'Cannot modify a library questionnaire' });
      }
      const { title, description, version, questions } = req.body;
      const update = { updatedAt: new Date() };
      if (title !== undefined) update.title = title;
      if (description !== undefined) update.description = description;
      if (version !== undefined) update.version = version;
      if (questions !== undefined) update.questions = questions;
      await database
        .collection('questionnaires')
        .updateOne({ _id: oid }, { $set: update });
      res.json({ ok: true, id });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/v1/admin/questionnaires/:slug/active
  router.patch('/questionnaires/:slug/active', async (req, res) => {
    try {
      const { slug } = req.params;
      const { active } = req.body;
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' });
      }
      const database = await getDb();
      const result = await database
        .collection('questionnaires')
        .updateOne({ slug }, { $set: { active, updatedAt: new Date() } });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      res.json({ ok: true, slug, active });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/questionnaires/:id
  router.delete('/questionnaires/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let oid;
      try {
        oid = new ObjectId(id);
      } catch {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      const database = await getDb();
      const existing = await database
        .collection('questionnaires')
        .findOne({ _id: oid });
      if (!existing) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      if (existing.isLibrary === true) {
        return res
          .status(403)
          .json({ error: 'Cannot delete a library questionnaire' });
      }
      // Check if assigned to any active study
      const studyCount = await database
        .collection('studies')
        .countDocuments({ questionnaires: oid, isActive: true });
      if (studyCount > 0) {
        return res
          .status(409)
          .json({ error: 'Questionnaire is assigned to an active study' });
      }
      await database.collection('questionnaires').deleteOne({ _id: oid });
      res.json({ ok: true, id, deleted: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Participant management (cont.) ────────────────────────────────────────

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
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Study CRUD routes ─────────────────────────────────────────────────────

  // GET /api/v1/admin/studies — paginated list with participant count
  router.get('/studies', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
      );
      const database = await getDb();
      const result = await listStudies({ db: database, page, limit });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/studies — create a new study
  router.post('/studies', async (req, res) => {
    try {
      const { name, description, groups, questionnaires } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
      }
      if (!Array.isArray(groups) || groups.length === 0) {
        return res
          .status(400)
          .json({ error: 'groups must be a non-empty array' });
      }
      const database = await getDb();
      const study = await createStudy({
        db: database,
        name,
        description,
        groups,
        questionnaires,
      });
      res.status(201).json({
        id: study._id.toString(),
        name: study.name,
        description: study.description,
        isDefault: study.isDefault,
        isActive: study.isActive,
        groups: study.groups,
        questionnaires: (study.questionnaires || []).map((id) => id.toString()),
        createdAt: study.createdAt,
        updatedAt: study.updatedAt,
      });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id — get a single study
  router.get('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const study = await getStudy({ db: database, id: req.params.id });
      if (!study) return res.status(404).json({ error: 'Study not found' });
      res.json(study);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/studies/:id — update a study
  router.put('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await updateStudy({
        db: database,
        id: req.params.id,
        updates: req.body,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/studies/:id — soft-delete a study
  router.delete('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await softDeleteStudy({ db: database, id: req.params.id });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      if (result.isDefault) {
        return res.status(409).json({
          error:
            'Cannot deactivate the default study. Set another study as default first.',
        });
      }
      if (result.conflict) {
        return res
          .status(409)
          .json({ error: 'Study has enrolled participants' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/studies/:id/default — mark study as default
  router.put('/studies/:id/default', async (req, res) => {
    try {
      const database = await getDb();
      const result = await setDefaultStudy({ db: database, id: req.params.id });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Study code routes ─────────────────────────────────────────────────────

  // POST /api/v1/admin/studies/:id/codes — generate enrollment codes
  router.post('/studies/:id/codes', async (req, res) => {
    try {
      const { count, groupId, maxRedemptions, expiresAt } = req.body;
      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ error: 'groupId is required' });
      }
      const database = await getDb();
      const result = await createCodes({
        db: database,
        studyId: req.params.id,
        groupId,
        count,
        maxRedemptions,
        expiresAt,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      if (result.groupNotFound)
        return res.status(404).json({ error: 'Group not found in study' });
      res.status(201).json({ codes: result.codes });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id/codes — list codes for a study
  router.get('/studies/:id/codes', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
      );
      const database = await getDb();
      const result = await listCodes({
        db: database,
        studyId: req.params.id,
        page,
        limit,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/studies/:id/codes/:code — revoke a code
  router.delete('/studies/:id/codes/:code', async (req, res) => {
    try {
      const database = await getDb();
      const result = await revokeCode({
        db: database,
        studyId: req.params.id,
        code: req.params.code,
      });
      if (result.notFound) return res.status(404).json({ error: 'Not found' });
      if (result.conflict)
        return res
          .status(409)
          .json({ error: 'Code has already been redeemed' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id/participants — list enrolled participants
  router.get('/studies/:id/participants', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        500,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
      );
      const database = await getDb();
      const result = await listStudyParticipants({
        db: database,
        id: req.params.id,
        page,
        limit,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/send:
   *   post:
   *     summary: Send push notification immediately to study participants
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [studyId, title, body]
   *             properties:
   *               studyId: { type: string }
   *               groupId: { type: string, description: Optional group filter }
   *               title: { type: string }
   *               body: { type: string }
   *               data: { type: object }
   *     responses:
   *       200:
   *         description: Notification dispatched
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 sent: { type: integer }
   *                 failed: { type: integer }
   *       400:
   *         description: Missing required fields
   */
  router.post('/notifications/send', async (req, res) => {
    try {
      const { studyId, groupId, title, body, data } = req.body;
      if (!studyId || !title || !body) {
        return res
          .status(400)
          .json({ error: 'studyId, title, and body are required' });
      }

      const database = await getDb();
      const messaging = await getFirebaseMessaging();
      const result = await sendStudyNotification({
        db: database,
        messaging,
        studyId,
        groupId: groupId || undefined,
        title,
        body,
        data,
      });

      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/schedule:
   *   post:
   *     summary: Schedule a push notification for future delivery
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [studyId, title, body, scheduledAt]
   *             properties:
   *               studyId: { type: string }
   *               groupId: { type: string }
   *               title: { type: string }
   *               body: { type: string }
   *               data: { type: object }
   *               scheduledAt: { type: string, format: date-time }
   *     responses:
   *       201:
   *         description: Notification scheduled
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id: { type: string }
   *       400:
   *         description: Missing required fields or invalid scheduledAt
   */
  router.post('/notifications/schedule', async (req, res) => {
    try {
      const { studyId, groupId, title, body, data, scheduledAt } = req.body;
      if (!studyId || !title || !body || !scheduledAt) {
        return res.status(400).json({
          error: 'studyId, title, body, and scheduledAt are required',
        });
      }

      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res
          .status(400)
          .json({ error: 'scheduledAt must be a valid ISO 8601 date' });
      }

      const { ObjectId: OId } = await import('mongodb');

      const database = await getDb();
      const doc = {
        studyId: new OId(studyId),
        groupId: groupId ? new OId(groupId) : null,
        title,
        body,
        data: data || null,
        scheduledAt: scheduledDate,
        sent: false,
        createdAt: new Date(),
      };

      const result = await database
        .collection(COLLECTION_SCHEDULED)
        .insertOne(doc);

      res.status(201).json({ id: result.insertedId.toString() });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/scheduled:
   *   get:
   *     summary: List pending scheduled notifications
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of pending scheduled notifications
   */
  router.get('/notifications/scheduled', async (req, res) => {
    try {
      const database = await getDb();
      const docs = await database
        .collection(COLLECTION_SCHEDULED)
        .find({ sent: false })
        .sort({ scheduledAt: 1 })
        .toArray();

      res.json(
        docs.map((d) => ({
          id: d._id.toString(),
          studyId: d.studyId.toString(),
          groupId: d.groupId ? d.groupId.toString() : null,
          title: d.title,
          body: d.body,
          data: d.data,
          scheduledAt: d.scheduledAt,
          createdAt: d.createdAt,
        }))
      );
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/scheduled/{id}:
   *   delete:
   *     summary: Cancel a pending scheduled notification
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Notification cancelled
   *       404:
   *         description: Notification not found or already sent
   */
  router.delete('/notifications/scheduled/:id', async (req, res) => {
    try {
      const { ObjectId: OId } = await import('mongodb');
      let oid;
      try {
        oid = new OId(req.params.id);
      } catch {
        return res.status(404).json({ error: 'Not found' });
      }

      const database = await getDb();
      const result = await database
        .collection(COLLECTION_SCHEDULED)
        .deleteOne({ _id: oid, sent: false });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Not found or already sent' });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createAdminRouter;

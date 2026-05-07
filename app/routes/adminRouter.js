import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import {
  getHabitsFeed,
  buildHabitsCSV,
} from '../services/adminHabitService.js';
import { getSettings, updateSetting } from '../services/adminStatsService.js';
import { createSurveysRouter } from './admin/surveysRouter.js';
import { createNotificationsRouter } from './admin/notificationsRouter.js';
import { createStudiesRouter } from './admin/studiesRouter.js';
import { createParticipantsRouter } from './admin/participantsRouter.js';
import { requireRole } from '../middleware/requireRole.js';
import { ROLES } from '../middleware/auth.js';

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
   *         description: Caller does not have admin role (settings are admin-only)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/admin/settings — admin only
  router.get('/settings', requireRole(ROLES.ADMIN), async (req, res) => {
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
   *         description: Caller does not have admin role (settings are admin-only)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // PUT /api/v1/admin/settings/:key — admin only
  router.put('/settings/:key', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined) {
        return res.status(400).json({ error: 'Missing value' });
      }
      const database = await getDb();
      const result = await updateSetting({ db: database, key, value });
      if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
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

  // ── Mount domain sub-routers ──────────────────────────────────────────────
  router.use(
    '/',
    createParticipantsRouter({ db, neo4jRun, keycloak, tokenCardService })
  );
  router.use('/', createSurveysRouter({ db, neo4jRun }));
  router.use('/', createStudiesRouter({ db, neo4jRun, keycloak }));
  router.use('/', createNotificationsRouter({ db }));

  return router;
}

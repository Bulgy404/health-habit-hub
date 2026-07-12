import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { config } from '../utils/config.js';
import { registerNeo4jDriver } from '../utils/neo4jDrivers.js';
import { COLLECTION as HABIT_COMMENTS_COLLECTION } from '../models/habitComment.js';
import {
  listAllComments,
  countAllComments,
  deleteHabitComments,
  approveComment,
} from '../db/habitQueries.js';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import {
  getHabitsFeed,
  buildHabitsCSV,
  listHabitCategories,
} from '../services/adminHabitService.js';
import { listInsights, getInsight } from '../services/adminInsightsService.js';
import { getSettings, updateSetting } from '../services/adminStatsService.js';
import { createSurveysRouter } from './admin/surveysRouter.js';
import { createNotificationsRouter } from './admin/notificationsRouter.js';
import { createStudiesRouter } from './admin/studiesRouter.js';
import { createParticipantsRouter } from './admin/participantsRouter.js';
import { requireRole } from '../middleware/requireRole.js';
import { ROLES } from '../middleware/auth.js';
import { createProfileFieldDefinitionsAdminRouter } from './profileFieldDefinitionsRouter.js';
import { createActivityTypeRouter } from './activityTypeRouter.js';
import { seedActivityTypes } from '../services/activityTypeService.js';
import {
  seedDefaultQuestionnaires,
  seedDefaultStudy,
} from '../services/defaultStudySeedService.js';
import { createBackupsRouter } from './admin/backupsRouter.js';
import { createSystemRouter } from './admin/systemRouter.js';
import { createAuditLogRouter } from './admin/auditLogRouter.js';
import { createRestoreAttemptsRouter } from './admin/restoreAttemptsRouter.js';
import { createTeamRouter } from './admin/teamRouter.js';
import { createAuditAdminActionsMiddleware } from '../middleware/auditAdminActions.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'adminRouter' });

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
  // Lazy Neo4j fallback for production (tests inject neo4jRun).
  let _neo4jDriver = null;
  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    if (!_neo4jDriver) {
      _neo4jDriver = neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
      );
      registerNeo4jDriver(_neo4jDriver);
    }
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  const router = express.Router();
  const getDb = makeGetDb(db);

  // Audits every mutating admin request (see auditAdminActions.js for why
  // this is mounted first, before any domain sub-router).
  router.use(createAuditAdminActionsMiddleware({ getDb }));

  // Seed default settings, activity types, the questionnaire library, and the
  // default study asynchronously on router creation. Idempotent — safe to
  // run on every boot, so a fresh deploy that never ran `make seed` still
  // ends up with a usable default study (questionnaire seeding must run
  // first: seedDefaultStudy looks up SLIQ/RAND-36 by slug to link them).
  (async () => {
    try {
      const database = await getDb();
      await seedDefaultSettings(database);
      await seedActivityTypes(database);
      await seedDefaultQuestionnaires(database);
      await seedDefaultStudy(database);
    } catch {
      // Non-fatal: initialization errors are ignored
    }
  })();

  // Resolve once at router construction so the admin token cache
  // (55s TTL, see keycloakAdminClient.js) is actually reused across requests.
  const kcAdmin = keycloak || createKeycloakAdminClient();
  function getKeycloak() {
    return kcAdmin;
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
  // GET /api/v1/admin/settings — admin and researcher
  router.get(
    '/settings',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    async (req, res) => {
      try {
        const database = await getDb();
        const result = await getSettings({ db: database });
        res.json(result);
      } catch (err) {
        log.error({ err: err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

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
      log.error({ err: err }, 'unhandled route error');
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
  /**
   * @swagger
   * /admin/comments:
   *   get:
   *     summary: List community comments for moderation
   *     description: >
   *       Paginated, newest first, with habit context. `?status=flagged`
   *       returns only comments the automated moderator (local wordlist +
   *       link/email/phone regex — not an LLM call) held for review; the
   *       default ('all') returns every comment regardless of status.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [all, flagged], default: all }
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1, minimum: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 100, maximum: 500 }
   *     responses:
   *       200:
   *         description: Paginated comment list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 total: { type: integer }
   *                 page: { type: integer }
   *                 limit: { type: integer }
   *                 comments:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id: { type: string }
   *                       text: { type: string }
   *                       createdAt: { type: string, format: date-time }
   *                       habitId: { type: string }
   *                       habitSentence: { type: string }
   *                       flagged: { type: boolean }
   *                       approved: { type: boolean }
   *                       flagReason: { type: string, nullable: true }
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
  router.get('/comments', async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const status = req.query.status === 'flagged' ? 'flagged' : 'all';
      const [comments, total] = await Promise.all([
        listAllComments(queryNeo4j, { page, limit, status }),
        countAllComments(queryNeo4j, { status }),
      ]);
      res.json({ comments, total, page, limit });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/comments/{commentId}/approve:
   *   post:
   *     summary: Publish a flagged comment
   *     description: >
   *       Marks a flagged comment as approved (visible in the public habit
   *       comment list) after a researcher/admin has reviewed it and judged
   *       it OK. Used from the admin "Flagged for review" queue.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: commentId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Comment approved
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *                 commentId: { type: string }
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
   *         description: Comment not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/comments/:commentId/approve', async (req, res) => {
    try {
      const commentId = String(req.params.commentId);
      const approved = await approveComment(queryNeo4j, commentId);
      if (!approved) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      log.info({ commentId }, '[admin] comment approved');
      res.json({ ok: true, commentId });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/comments/{commentId}:
   *   delete:
   *     summary: Delete (or reject) a comment
   *     description: >
   *       Deletes the anonymous Neo4j Comment node and the MongoDB ownership
   *       mapping. Used both to reject a flagged comment and to remove an
   *       already-published one.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: commentId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Comment deleted
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *                 commentId: { type: string }
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
  router.delete('/comments/:commentId', async (req, res) => {
    try {
      const commentId = String(req.params.commentId);
      await deleteHabitComments(queryNeo4j, [commentId]);
      const database = await getDb();
      const { deletedCount } = await database
        .collection(HABIT_COMMENTS_COLLECTION)
        .deleteOne({ commentId });
      log.info({ commentId, deletedCount }, '[admin] comment moderated');
      res.json({ ok: true, commentId });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/habits/categories — distinct BCIO category labels
  // currently in use, localised to ?lang, for the donations feed's category
  // filter dropdown.
  router.get('/habits/categories', async (req, res) => {
    try {
      const categories = await listHabitCategories({
        neo4jRun: queryNeo4j,
        lang: req.query.lang,
      });
      res.json({ categories });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/habits/feed/export (must be before /habits/feed)
  router.get('/habits/feed/export', async (req, res) => {
    try {
      const { group, category, format = 'csv' } = req.query;
      const from = req.query.from ?? req.query.dateFrom;
      const to = req.query.to ?? req.query.dateTo;

      if (format !== 'csv') {
        return res
          .status(400)
          .json({ error: "Invalid format. Only 'csv' is supported." });
      }

      const database = await getDb();
      const csv = await buildHabitsCSV({
        db: database,
        neo4jRun: queryNeo4j,
        group,
        category,
        from,
        to,
        lang: req.query.lang,
      });

      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="habits-feed.csv"',
      });
      res.send(csv);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
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
      const { group, category, page = '1', limit = '20' } = req.query;
      const from = req.query.from ?? req.query.dateFrom;
      const to = req.query.to ?? req.query.dateTo;
      const database = await getDb();
      const result = await getHabitsFeed({
        db: database,
        neo4jRun: queryNeo4j,
        group,
        category,
        from,
        to,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
        lang: req.query.lang,
      });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
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
  /**
   * @swagger
   * /admin/insights:
   *   get:
   *     summary: List available insight questions
   *     description: Returns metadata (key, title, description) for each curated cross-database insight. Fetch an individual answer via /admin/insights/{key}.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Insight metadata list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 insights:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       key: { type: string, example: totals }
   *                       title: { type: string, example: Platform totals }
   *                       description: { type: string }
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
  // GET /api/v1/admin/insights — list available insight questions (metadata)
  router.get('/insights', (req, res) => {
    res.json({ insights: listInsights() });
  });

  /**
   * @swagger
   * /admin/insights/{key}:
   *   get:
   *     summary: Get a cached insight answer
   *     description: Computes (or serves a Redis-cached) answer for the given insight key. The result is either a stats list or a table. Pass refresh=1 to force a recompute.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: key
   *         required: true
   *         schema: { type: string }
   *         description: Insight key (see /admin/insights)
   *         example: donations_by_participant
   *       - in: query
   *         name: refresh
   *         required: false
   *         schema: { type: string, enum: ['1', 'true'] }
   *         description: Force recompute instead of serving the cached value
   *     responses:
   *       200:
   *         description: Insight answer
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key: { type: string }
   *                 title: { type: string }
   *                 description: { type: string }
   *                 computedAt: { type: string, format: date-time }
   *                 cached: { type: boolean }
   *                 result:
   *                   type: object
   *                   description: '{ type: "stats", items: [...] } or { type: "table", columns: [...], rows: [...] }'
   *       404:
   *         description: Unknown insight key
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
  // GET /api/v1/admin/insights/:key — cached answer (refresh=1 to recompute)
  router.get('/insights/:key', async (req, res) => {
    try {
      const database = await getDb();
      const insight = await getInsight({
        db: database,
        neo4jRun: queryNeo4j,
        key: req.params.key,
        refresh: req.query.refresh === '1' || req.query.refresh === 'true',
      });
      if (!insight) return res.status(404).json({ error: 'Unknown insight' });
      res.json(insight);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/sessions
  router.get('/sessions', async (req, res) => {
    try {
      const kc = getKeycloak();
      const raw = await kc.listSessions();
      // Keycloak's session shape (id, userId, lastAccess epoch-ms, ...)
      // normalized to what the admin UI renders.
      const all = raw.map((s) => ({
        sessionId: s.id,
        userId: s.userId,
        lastSeen: s.lastAccess ? new Date(s.lastAccess).toISOString() : null,
        startedAt: s.start ? new Date(s.start).toISOString() : null,
        ipAddress: s.ipAddress ?? null,
      }));
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit, 10) || 100)
      );
      const skip = (page - 1) * limit;
      // Keycloak's session list has no server-side pagination params to push
      // this down to — bounded here so the browser never has to render an
      // unbounded list.
      res.json({
        total: all.length,
        page,
        limit,
        sessions: all.slice(skip, skip + limit),
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
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
      log.error({ err: err }, 'unhandled route error');
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
  router.use(
    '/profile-field-definitions',
    requireRole(ROLES.ADMIN),
    createProfileFieldDefinitionsAdminRouter({ db })
  );

  router.use(
    '/activity-types',
    requireRole(ROLES.ADMIN),
    createActivityTypeRouter({ db })
  );

  // Role checks for these live on their own routes (scoped per-path) rather
  // than here — a requireRole gate on this catch-all '/' mount would run for
  // every unmatched request that falls through this router, including
  // sibling admin sub-resources mounted separately in apiRouter.js (e.g.
  // /admin/cue-pools), wrongly 403ing non-admin roles for paths this
  // sub-router doesn't even own.
  router.use('/', createBackupsRouter({ db }));

  router.use('/', createSystemRouter());

  router.use('/', createAuditLogRouter({ db }));

  router.use('/', createRestoreAttemptsRouter({ db }));

  router.use('/', createTeamRouter({ db, keycloak: kcAdmin }));

  return router;
}

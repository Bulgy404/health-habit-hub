import express from 'express';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { generateTokenCard } from '../services/token_card_service.js';

// Production Keycloak admin client (reads config from env)
function createKeycloakClient() {
  const base = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  const realm = process.env.KEYCLOAK_REALM || 'hhh';
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'hhh-backend';
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';

  async function getAdminToken() {
    const res = await fetch(
      `${base}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );
    const data = await res.json();
    return data.access_token;
  }

  return {
    async createUser({ userId, username, password }) {
      const token = await getAdminToken();
      await fetch(`${base}/admin/realms/${realm}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: userId,
          username,
          enabled: true,
          credentials: [
            { type: 'password', value: password, temporary: false },
          ],
          attributes: { group: [] },
        }),
      });
    },
    async assignRole(userId, roleName) {
      const token = await getAdminToken();
      // Fetch role by name
      const rolesRes = await fetch(
        `${base}/admin/realms/${realm}/roles/${roleName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const role = await rolesRes.json();
      await fetch(
        `${base}/admin/realms/${realm}/users/${userId}/role-mappings/realm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify([role]),
        }
      );
    },
    async updateUserAttribute(userId, key, value) {
      const token = await getAdminToken();
      await fetch(`${base}/admin/realms/${realm}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ attributes: { [key]: [value] } }),
      });
    },
    async listSessions() {
      const token = await getAdminToken();
      const res = await fetch(`${base}/admin/realms/${realm}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    async revokeSession(sessionId) {
      const token = await getAdminToken();
      await fetch(`${base}/admin/realms/${realm}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
}

function randomPassword() {
  return randomBytes(12).toString('base64url');
}

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

  async function getDb() {
    if (db) return db;
    const { connect } = await import('../models/survey.js');
    return connect();
  }

  // Seed default settings asynchronously on router creation
  getDb()
    .then(seedDefaultSettings)
    .catch(() => {});

  function getKeycloak() {
    return keycloak || createKeycloakClient();
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
      const participants = await database
        .collection('participants')
        .find({ deletedAt: { $exists: false } })
        .toArray();

      const result = participants.map((p) => ({
        userId: p.userId,
        username: p.username,
        group: p.group || null,
        enrolledAt: p.enrolledAt,
        lastActive: p.lastActive || null,
        surveyCompletionPct: p.surveyCompletionPct || 0,
      }));

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

      const userId = randomUUID();
      const username = `p-${userId}`;
      const password = randomPassword();

      await kc.createUser({ userId, username, password });
      await kc.assignRole(userId, 'participant');

      const now = new Date();
      await database.collection('participants').insertOne({
        userId,
        username,
        password,
        group: null,
        enrolledAt: now,
        lastActive: null,
        surveyCompletionPct: 0,
      });

      const tokenCardUrl = `/api/v1/admin/participants/${userId}/token-card`;
      res.json({ userId, username, password, tokenCardUrl });
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

      await kc.updateUserAttribute(id, 'group', group);

      const result = await database
        .collection('participants')
        .updateOne(
          { userId: id, deletedAt: { $exists: false } },
          { $set: { group } }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      if (neo4jRun) {
        const labelMap = {
          G1: 'hhh__Group1',
          G2: 'hhh__Group2',
          G3: 'hhh__Group3',
          G4: 'hhh__Group4',
        };
        const newLabel = labelMap[group];
        const cypher = [
          'MATCH (d:hhh__Donor {hhh__id: $userId})',
          'REMOVE d:hhh__Group1 REMOVE d:hhh__Group2 REMOVE d:hhh__Group3 REMOVE d:hhh__Group4',
          `SET d:\`${newLabel}\``,
          'RETURN d',
        ].join(' ');
        await neo4jRun(cypher, { userId: id }).catch(() => {});
      }

      res.json({ ok: true, userId: id, group });
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
      const participant = await database
        .collection('participants')
        .findOne({ userId: id, deletedAt: { $exists: false } });

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
      const docs = await database
        .collection('admin_settings')
        .find({})
        .toArray();
      const result = {};
      for (const doc of docs) {
        result[doc.key] = doc.value;
      }
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
      await database
        .collection('admin_settings')
        .updateOne(
          { key },
          { $set: { value, updatedAt: new Date() } },
          { upsert: true }
        );
      res.json({ ok: true, key, value });
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

      const participant = await database
        .collection('participants')
        .findOne({ userId: id, deletedAt: { $exists: false } });

      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      const surveyResponses = await database
        .collection('survey_responses')
        .find({ participantId: id })
        .toArray();

      let habitsCount = 0;
      if (neo4jRun) {
        try {
          const records = await neo4jRun(
            'MATCH (h:Habit {userID: $userId}) RETURN count(h) AS cnt',
            { userId: id }
          );
          const cnt = records[0]?.cnt;
          habitsCount =
            typeof cnt?.toNumber === 'function' ? cnt.toNumber() : (cnt ?? 0);
        } catch (err) {
          console.error('[route] Error:', err);
          // Neo4j unavailable; habitsCount stays 0
        }
      } else {
        const habitDocs = await database
          .collection('habit_donations')
          .find({ participantId: id })
          .toArray();
        habitsCount = habitDocs.length;
      }

      const recDocs = await database
        .collection('recommendations_log')
        .find({ participantId: id })
        .toArray();
      const accepted = recDocs.filter((r) => r.type === 'accepted').length;
      const dismissed = recDocs.filter((r) => r.type === 'dismissed').length;

      const timeline = [];
      if (participant.enrolledAt) {
        timeline.push({
          type: 'enrolled',
          timestamp: participant.enrolledAt,
          detail: 'Participant enrolled',
        });
      }
      for (const sr of surveyResponses) {
        timeline.push({
          type: 'survey_completed',
          timestamp: sr.completedAt,
          detail: sr.surveyTitle || sr.surveyId,
        });
      }
      for (const rec of recDocs) {
        timeline.push({
          type: `recommendation_${rec.type}`,
          timestamp: rec.timestamp,
          detail: rec.recommendationId || '',
        });
      }
      timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      res.json({
        profile: {
          completed: participant.profileCompleted || false,
          completedAt: participant.profileCompletedAt || null,
        },
        surveys: surveyResponses.map((sr) => ({
          id: sr.surveyId,
          title: sr.surveyTitle || '',
          completedAt: sr.completedAt,
        })),
        habitsCount,
        recommendations: { accepted, dismissed },
        timeline,
      });
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
      const filter = {};
      if (group) filter.group = group;
      if (category) filter.category = category;
      if (from || to) {
        filter.donatedAt = {};
        if (from) filter.donatedAt.$gte = new Date(from);
        if (to) filter.donatedAt.$lte = new Date(to);
      }

      const docs = await database
        .collection('habit_donations')
        .find(filter)
        .toArray();

      const escape = (v) => {
        const s = v == null ? '' : String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const header = 'participantId,habitName,category,donatedAt';
      const rows = docs.map((d) =>
        [
          d.participantId,
          d.habitName,
          d.category,
          d.donatedAt instanceof Date ? d.donatedAt.toISOString() : d.donatedAt,
        ]
          .map(escape)
          .join(',')
      );
      const csv = [header, ...rows].join('\n');

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
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const database = await getDb();
      const filter = {};
      if (group) filter.group = group;
      if (category) filter.category = category;
      if (from || to) {
        filter.donatedAt = {};
        if (from) filter.donatedAt.$gte = new Date(from);
        if (to) filter.donatedAt.$lte = new Date(to);
      }

      const collection = database.collection('habit_donations');
      const [total, paginated] = await Promise.all([
        collection.countDocuments(filter),
        collection.find(filter).skip(skip).limit(limitNum).toArray(),
      ]);

      res.json({
        total,
        page: pageNum,
        limit: limitNum,
        results: paginated.map((d) => ({
          participantId: d.participantId,
          habitName: d.habitName,
          category: d.category,
          donatedAt: d.donatedAt,
        })),
      });
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
      const { title, type, jsonSchema, assignedGroups } = req.body;
      if (!title || !type) {
        return res.status(400).json({ error: 'title and type are required' });
      }
      const database = await getDb();
      const id = randomUUID();
      const doc = {
        id,
        title,
        type,
        jsonSchema: jsonSchema || {},
        assignedGroups: assignedGroups || [],
        status: 'draft',
        createdAt: new Date(),
      };
      await database.collection('surveys').insertOne(doc);
      res.status(201).json({
        id,
        title,
        type,
        status: 'draft',
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
      const { title, type, jsonSchema, assignedGroups, status } = req.body;
      const database = await getDb();
      const update = { updatedAt: new Date() };
      if (title !== undefined) update.title = title;
      if (type !== undefined) update.type = type;
      if (jsonSchema !== undefined) update.jsonSchema = jsonSchema;
      if (assignedGroups !== undefined) update.assignedGroups = assignedGroups;
      if (status !== undefined) update.status = status;
      const result = await database
        .collection('surveys')
        .updateOne({ id }, { $set: update });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Survey not found' });
      }
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
      const result = await database
        .collection('surveys')
        .updateOne(
          { id },
          { $set: { assignedGroups: groups, updatedAt: new Date() } }
        );
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Survey not found' });
      }
      res.json({ ok: true, id, assignedGroups: groups });
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
      const docs = await database
        .collection('questionnaires')
        .find({})
        .toArray();
      res.json(
        docs.map((q) => ({
          slug: q.slug,
          title: q.title,
          description: q.description || '',
          version: q.version || '1',
          active: q.active !== false,
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
      if (!slug || !title) {
        return res.status(400).json({ error: 'slug and title are required' });
      }
      const database = await getDb();
      const existing = await database
        .collection('questionnaires')
        .findOne({ slug });
      if (existing) {
        return res
          .status(409)
          .json({ error: 'Questionnaire with this slug already exists' });
      }
      const now = new Date();
      const doc = {
        slug,
        title,
        description: description || '',
        version: version || '1',
        active: true,
        questions: Array.isArray(questions) ? questions : [],
        createdAt: now,
        updatedAt: now,
      };
      await database.collection('questionnaires').insertOne(doc);
      res.status(201).json({ ok: true, slug });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/questionnaires/:slug
  router.put('/questionnaires/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const { title, description, version, questions } = req.body;
      const database = await getDb();
      const update = { updatedAt: new Date() };
      if (title !== undefined) update.title = title;
      if (description !== undefined) update.description = description;
      if (version !== undefined) update.version = version;
      if (questions !== undefined) update.questions = questions;
      const result = await database
        .collection('questionnaires')
        .updateOne({ slug }, { $set: update });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      res.json({ ok: true, slug });
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

  // DELETE /api/v1/admin/questionnaires/:slug
  router.delete('/questionnaires/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const database = await getDb();
      const responseCount = await database
        .collection('form_responses')
        .countDocuments({ questionnaireSlug: slug });
      if (responseCount > 0) {
        // Has responses: deactivate only
        await database
          .collection('questionnaires')
          .updateOne(
            { slug },
            { $set: { active: false, updatedAt: new Date() } }
          );
        return res.json({
          ok: true,
          slug,
          deleted: false,
          deactivated: true,
          responseCount,
        });
      }
      const result = await database
        .collection('questionnaires')
        .deleteOne({ slug });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      res.json({ ok: true, slug, deleted: true });
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

      const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
      const anonymizedUsername = `deleted-${hash}`;

      const result = await database
        .collection('participants')
        .updateOne(
          { userId: id, deletedAt: { $exists: false } },
          { $set: { deletedAt: new Date(), username: anonymizedUsername } }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Participant not found' });
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

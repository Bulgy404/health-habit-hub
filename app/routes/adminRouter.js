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

  // GET /api/v1/admin – base route
  router.get('/', (req, res) => {
    res.json({ ok: true });
  });

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
    } catch {
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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
            'MATCH (h:hhh__Habit {hhh__source: $userId}) RETURN count(h) AS cnt',
            { userId: id }
          );
          const cnt = records[0]?.cnt;
          habitsCount =
            typeof cnt?.toNumber === 'function' ? cnt.toNumber() : (cnt ?? 0);
        } catch {}
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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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

      const docs = await database
        .collection('habit_donations')
        .find(filter)
        .toArray();

      const total = docs.length;
      const paginated = docs.slice(skip, skip + limitNum);

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/sessions
  router.get('/sessions', async (req, res) => {
    try {
      const kc = getKeycloak();
      const sessions = await kc.listSessions();
      res.json(sessions);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/sessions/:sessionId
  router.delete('/sessions/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const kc = getKeycloak();
      await kc.revokeSession(sessionId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createAdminRouter;

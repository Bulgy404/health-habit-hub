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
  };
}

function randomPassword() {
  return randomBytes(12).toString('base64url');
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

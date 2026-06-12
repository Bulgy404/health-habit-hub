import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { deleteHabitComments } from '../db/habitQueries.js';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'usersRouter' });

const SUPPORTED_LANGUAGES = ['en', 'de', 'ja'];

export function createUsersRouter({ db, keycloak, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Production fallbacks (mirrors adminRouter/habitsRouter): when not
  // injected (tests inject mocks), create real clients so account deletion
  // ALWAYS erases the Keycloak identity and the user's Comment nodes.
  const getKeycloak = () => keycloak || createKeycloakAdminClient();
  let _neo4jDriver = null;
  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    _neo4jDriver ??= neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
    );
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  // GET /api/v1/users/me – return caller's user record (creates default if absent)
  router.get('/me', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);
      const doc = await database.collection('users').findOne({ userId });
      if (doc) {
        const { _id, ...rest } = doc;
        return res.json(rest);
      }
      // Return default without persisting
      return res.json({ userId, preferredLanguage: 'en' });
    } catch (err) {
      log.error({ err: err }, '[usersRouter] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/users/me – update user fields (currently preferredLanguage)
  router.put('/me', async (req, res) => {
    try {
      const { preferredLanguage } = req.body || {};
      if (
        preferredLanguage !== undefined &&
        !SUPPORTED_LANGUAGES.includes(preferredLanguage)
      ) {
        return res.status(400).json({
          error: `preferredLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
        });
      }
      const database = await getDb();
      const userId = String(req.user.sub);
      const update = {};
      if (preferredLanguage !== undefined)
        update.preferredLanguage = preferredLanguage;
      await database
        .collection('users')
        .updateOne(
          { userId },
          { $set: { userId, ...update } },
          { upsert: true }
        );
      const doc = await database.collection('users').findOne({ userId });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/users/me/consent – latest recorded consent for the caller
  router.get('/me/consent', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);
      const doc = await database
        .collection('consents')
        .find({ userId })
        .sort({ consentedAt: -1 })
        .limit(1)
        .toArray();
      if (!doc.length)
        return res.status(404).json({ error: 'No consent recorded' });
      const { _id, ...rest } = doc[0];
      res.json(rest);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] consent read error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/users/me/consent – record acceptance of the informed-consent
  // document (append-only audit trail; one record per accepted version).
  router.post('/me/consent', async (req, res) => {
    try {
      const { consentVersion, locale } = req.body || {};
      if (!consentVersion || typeof consentVersion !== 'string') {
        return res.status(400).json({ error: 'consentVersion is required' });
      }
      const database = await getDb();
      const userId = String(req.user.sub);
      const record = {
        userId,
        consentVersion: String(consentVersion),
        locale: typeof locale === 'string' ? locale : null,
        consentedAt: new Date(),
      };
      await database.collection('consents').insertOne(record);
      const { _id, ...rest } = record;
      res.status(201).json(rest);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] consent write error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/users/me – GDPR / App Store account deletion.
  // Removes all participant-linked documents from MongoDB and deletes the
  // Keycloak account. Donated habits in Neo4j carry no user identifier and
  // are therefore already anonymous (see informed-consent document).
  const USER_COLLECTIONS = [
    'users',
    'profiles',
    'enrollments',
    'implementation_intentions',
    'daily_behavior_logs',
    'srhi_responses',
    'form_responses',
    'recommendations',
    'recommendation_feedback',
    'deviceTokens',
    'consents',
    'habit_comments',
  ];

  // GET /api/v1/users/me/export – GDPR Art. 20 data portability.
  // Returns every document linked to the caller across all participant
  // collections as a single JSON download (same scope as account deletion).
  router.get('/me/export', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);

      const data = {};
      for (const name of USER_COLLECTIONS) {
        const docs = await database.collection(name).find({ userId }).toArray();
        data[name] = docs.map(({ _id, ...rest }) => ({
          id: String(_id),
          ...rest,
        }));
      }

      const payload = {
        format: 'health-habit-hub-export/v1',
        exportedAt: new Date().toISOString(),
        userId,
        note:
          'Donated habits are stored anonymously in the habit graph and are ' +
          'not attributable to this account (see the informed-consent document).',
        data,
      };

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="health-habit-hub-export.json"'
      );
      res.json(payload);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] export error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/me', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);

      // Erase the user's anonymous Comment nodes from the habit graph first
      // (ownership is only known via the habit_comments mapping).
      try {
        const ownComments = await database
          .collection('habit_comments')
          .find({ userId })
          .toArray();
        await deleteHabitComments(
          queryNeo4j,
          ownComments.map((c) => String(c.commentId))
        );
      } catch (err) {
        log.warn({ err }, '[usersRouter] comment-node erasure failed');
      }

      const deleted = {};
      for (const name of USER_COLLECTIONS) {
        const result = await database.collection(name).deleteMany({ userId });
        deleted[name] = result?.deletedCount ?? 0;
      }

      const kc = getKeycloak();
      if (kc?.deleteUser) {
        await kc.deleteUser(userId);
      } else {
        log.warn(
          '[usersRouter] no Keycloak admin client available — identity not deleted'
        );
      }

      log.info({ userId, deleted }, '[usersRouter] account deleted');
      res.status(200).json({ ok: true, deleted });
    } catch (err) {
      log.error({ err: err }, '[usersRouter] account deletion error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createUsersRouter;

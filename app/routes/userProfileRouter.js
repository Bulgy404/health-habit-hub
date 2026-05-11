import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { setUserProfileProperties } from '../db/userQueries.js';

const VALID_FIELD_TYPES = new Set(['text', 'number', 'date', 'select']);

function convertFieldValue(field) {
  const { type, value } = field;
  if (value === undefined || value === null) return field;
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(value);
    return { ...field, value: isNaN(d.getTime()) ? value : d };
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return { ...field, value: isNaN(n) ? value : n };
  }
  return field;
}

export function createUserProfileServiceRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/service/:userId', async (req, res) => {
    try {
      const token = req.headers['x-service-auth-token'];
      const expected = process.env.API_SERVICE_SECRET;
      if (!token || !expected || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.params.userId });
      if (!doc) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[userProfileRouter] GET /service/:userId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createUserProfileRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        process.env.NEO4J_URI || 'bolt://neo4j:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );

  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { fields } = req.body;
      if (!Array.isArray(fields) || fields.length === 0) {
        return res
          .status(400)
          .json({ error: 'fields must be a non-empty array' });
      }
      for (const f of fields) {
        if (
          typeof f.questionId !== 'string' ||
          !f.questionId ||
          typeof f.questionText !== 'string' ||
          !f.questionText ||
          f.value === undefined ||
          f.value === null ||
          typeof f.label !== 'string' ||
          !f.label
        ) {
          return res.status(400).json({
            error:
              'each field must have questionId, questionText, value, and label',
          });
        }
        if (f.type !== undefined && !VALID_FIELD_TYPES.has(f.type)) {
          return res.status(400).json({ error: `Invalid field type: ${f.type}` });
        }
      }

      const converted = fields.map(convertFieldValue);

      const database = await getDb();
      await database
        .collection('user_profiles')
        .updateOne(
          { userId },
          { $set: { userId, fields: converted, updatedAt: new Date() } },
          { upsert: true }
        );

      // Fire-and-forget Neo4j sync
      setUserProfileProperties(queryNeo4j, userId, converted).catch((err) =>
        console.error('[userProfileRouter] Neo4j sync error:', err)
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('[userProfileRouter] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.user?.sub });
      if (!doc) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[userProfileRouter] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

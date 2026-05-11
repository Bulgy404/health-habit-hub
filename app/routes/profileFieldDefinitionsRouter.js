import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

const VALID_TYPES = ['text', 'number', 'date', 'select'];
const FIELD_ID_RE = /^[a-z][a-z0-9_]*$/;

export function createProfileFieldDefinitionsAdminRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/admin/profile-field-definitions
  router.get('/', async (_req, res) => {
    try {
      const database = await getDb();
      const defs = await database
        .collection('profile_field_definitions')
        .find({})
        .toArray();
      defs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json(defs.map(({ _id, ...d }) => d));
    } catch (err) {
      console.error('[profileFieldDefs] GET /admin:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/profile-field-definitions
  router.post('/', async (req, res) => {
    try {
      const {
        fieldId,
        label,
        type,
        options = [],
        required = false,
        order = 0,
      } = req.body;
      if (!fieldId || !FIELD_ID_RE.test(fieldId)) {
        return res
          .status(400)
          .json({ error: 'fieldId must match /^[a-z][a-z0-9_]*$/' });
      }
      if (!VALID_TYPES.includes(type)) {
        return res
          .status(400)
          .json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      if (!label || typeof label !== 'string') {
        return res.status(400).json({ error: 'label is required' });
      }
      if (
        type === 'select' &&
        (!Array.isArray(options) || options.length === 0)
      ) {
        return res
          .status(400)
          .json({
            error: 'options must be a non-empty array when type is select',
          });
      }
      const database = await getDb();
      const existing = await database
        .collection('profile_field_definitions')
        .findOne({ fieldId: String(fieldId) });
      if (existing) {
        return res
          .status(409)
          .json({ error: `fieldId '${fieldId}' already exists` });
      }
      const doc = {
        fieldId,
        label,
        type,
        options,
        required: Boolean(required),
        order: Number(order) || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await database.collection('profile_field_definitions').insertOne(doc);
      const { _id, ...rest } = doc;
      res.status(201).json(rest);
    } catch (err) {
      console.error('[profileFieldDefs] POST /admin:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/profile-field-definitions/:fieldId
  router.put('/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const { label, type, options, required, order } = req.body;
      if (type !== undefined && !VALID_TYPES.includes(type)) {
        return res
          .status(400)
          .json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      const database = await getDb();
      const existing = await database
        .collection('profile_field_definitions')
        .findOne({ fieldId });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const effectiveType = type ?? existing.type;
      const effectiveOptions = options ?? existing.options;
      if (
        effectiveType === 'select' &&
        (!Array.isArray(effectiveOptions) || effectiveOptions.length === 0)
      ) {
        return res.status(400).json({
          error: 'options must be a non-empty array when type is select',
        });
      }
      const updates = { updatedAt: new Date() };
      if (label !== undefined) updates.label = label;
      if (type !== undefined) updates.type = type;
      if (options !== undefined) updates.options = options;
      if (required !== undefined) updates.required = Boolean(required);
      if (order !== undefined) updates.order = Number(order) || 0;
      const result = await database
        .collection('profile_field_definitions')
        .findOneAndUpdate(
          { fieldId },
          { $set: updates },
          { returnDocument: 'after' }
        );
      if (!result) return res.status(404).json({ error: 'Not found' });
      const { _id, ...rest } = result;
      res.json(rest);
    } catch (err) {
      console.error('[profileFieldDefs] PUT /admin/:fieldId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/profile-field-definitions/:fieldId
  router.delete('/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const database = await getDb();
      const result = await database
        .collection('profile_field_definitions')
        .deleteOne({ fieldId });
      if (result.deletedCount === 0)
        return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[profileFieldDefs] DELETE /admin/:fieldId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createProfileFieldDefinitionsPublicRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/profile-field-definitions
  router.get('/', async (_req, res) => {
    try {
      const database = await getDb();
      const defs = await database
        .collection('profile_field_definitions')
        .find({})
        .toArray();
      defs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json(defs.map(({ _id, ...d }) => d));
    } catch (err) {
      console.error('[profileFieldDefs] GET /public:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { resolveLocaleText } from '../utils/localeText.js';
import {
  createProfileFieldSchema,
  updateProfileFieldSchema,
} from '../schemas/adminSchemas.js';

const log = logger.child({ module: 'profileFieldDefinitionsRouter' });

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
      res.json(
        defs.map(({ _id, ...d }) => ({ ...d, isLibrary: d.isLibrary === true }))
      );
    } catch (err) {
      log.error({ err: err }, '[profileFieldDefs] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/profile-field-definitions
  router.post('/', validate(createProfileFieldSchema), async (req, res) => {
    try {
      const {
        fieldId,
        label,
        type,
        options = [],
        languages,
        required = false,
        order = 0,
      } = req.body;
      if (
        type === 'select' &&
        (!Array.isArray(options) || options.length === 0)
      ) {
        return res.status(400).json({
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
        languages,
        required: Boolean(required),
        order: Number(order) || 0,
        // Custom fields created here are never library entries — only the
        // seed script (seedProfileFields.js) inserts isLibrary: true fields.
        isLibrary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await database.collection('profile_field_definitions').insertOne(doc);
      const { _id, ...rest } = doc;
      res.status(201).json(rest);
    } catch (err) {
      log.error({ err: err }, '[profileFieldDefs] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/profile-field-definitions/:fieldId
  router.put(
    '/:fieldId',
    validate(updateProfileFieldSchema),
    async (req, res) => {
      try {
        const { fieldId } = req.params;
        const { label, type, options, languages, required, order } = req.body;
        const database = await getDb();
        const existing = await database
          .collection('profile_field_definitions')
          .findOne({ fieldId });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        // Library fields (the seeded defaults, e.g. gender/age group) are
        // shared research covariates — editing them here would silently
        // change what every study/participant sees, so they're read-only
        // from the admin UI, matching the questionnaire library's behaviour.
        if (existing.isLibrary === true) {
          return res
            .status(403)
            .json({ error: 'Cannot modify a library profile field' });
        }
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
        if (languages !== undefined) updates.languages = languages;
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
        log.error({ err: err }, '[profileFieldDefs] error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /api/v1/admin/profile-field-definitions/:fieldId
  router.delete('/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const database = await getDb();
      const existing = await database
        .collection('profile_field_definitions')
        .findOne({ fieldId });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.isLibrary === true) {
        return res
          .status(403)
          .json({ error: 'Cannot delete a library profile field' });
      }
      await database
        .collection('profile_field_definitions')
        .deleteOne({ fieldId });
      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, '[profileFieldDefs] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createProfileFieldDefinitionsPublicRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/profile-field-definitions?lang=de
  // Resolves label + option labels down to the requested language (falling
  // back through English, then any available language) so the mobile app
  // gets plain strings — the same participant-facing contract as before
  // i18n, just localized. `option.value` stays a stable machine key so the
  // stored answer never depends on which language the participant used.
  router.get('/', async (req, res) => {
    try {
      const lang = req.query.lang || 'en';
      const database = await getDb();
      const defs = await database
        .collection('profile_field_definitions')
        .find({})
        .toArray();
      defs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json(
        defs.map((d) => {
          const languages = d.languages ?? ['en'];
          return {
            fieldId: d.fieldId,
            label: resolveLocaleText(d.label, lang, languages),
            type: d.type,
            options: (d.options ?? []).map((opt) => ({
              value: opt.value,
              label: resolveLocaleText(opt.label, lang, languages),
            })),
            required: d.required ?? false,
            order: d.order ?? 0,
          };
        })
      );
    } catch (err) {
      log.error({ err: err }, '[profileFieldDefs] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

import express from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { makeGetDb } from '../../utils/getDb.js';
import { logger } from '../../utils/logger.js';
import {
  normalizeSurveyTargetMode,
  sanitizeSurveyTargeting,
} from '../../utils/surveyTargeting.js';
import { validate } from '../../middleware/validate.js';
import {
  createSurveySchema,
  updateSurveySchema,
  updateSurveyStatusSchema,
  updateSurveyGroupsSchema,
  createQuestionnaireSchema,
  updateQuestionnaireSchema,
} from '../../schemas/adminSchemas.js';

const log = logger.child({ module: 'surveysRouter' });

export function createSurveysRouter({ db, neo4jRun: _neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

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
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/surveys
  router.post('/surveys', validate(createSurveySchema), async (req, res) => {
    try {
      const { title, type, jsonSchema, assignedGroups, targetMode } = req.body;
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
      log.error({ err: err }, 'unhandled route error');
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
  router.put('/surveys/:id', validate(updateSurveySchema), async (req, res) => {
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
      log.error({ err: err }, 'unhandled route error');
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
  router.patch(
    '/surveys/:id/status',
    validate(updateSurveyStatusSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        const database = await getDb();
        const result = await database
          .collection('surveys')
          .updateOne({ id }, { $set: { status, updatedAt: new Date() } });
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Survey not found' });
        }
        res.json({ ok: true, id, status });
      } catch (err) {
        log.error({ err: err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

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
  router.patch(
    '/surveys/:id/groups',
    validate(updateSurveyGroupsSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { groups } = req.body;
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
        log.error({ err: err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

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
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/questionnaires/:id — full document including questions array
  router.get('/questionnaires/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let oid;
      try {
        oid = new ObjectId(id);
      } catch {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      const database = await getDb();
      const doc = await database
        .collection('questionnaires')
        .findOne({ _id: oid });
      if (!doc) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      res.json({
        id: doc._id.toString(),
        slug: doc.slug || null,
        title: doc.title,
        description: doc.description || '',
        version: doc.version || '1',
        active: doc.active !== false,
        isLibrary: doc.isLibrary === true,
        questions: Array.isArray(doc.questions) ? doc.questions : [],
        updatedAt: doc.updatedAt || doc.createdAt || null,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/questionnaires
  router.post(
    '/questionnaires',
    validate(createQuestionnaireSchema),
    async (req, res) => {
      try {
        const { slug, title, description, version, questions } = req.body;
        const database = await getDb();

        // Every questionnaire needs a slug — responses and questionnaire
        // scheduling/completion are keyed by it. Derive a unique one from the
        // title when the admin didn't supply a slug.
        let finalSlug;
        if (slug) {
          const existing = await database
            .collection('questionnaires')
            .findOne({ slug: String(slug) });
          if (existing) {
            return res
              .status(409)
              .json({ error: 'Questionnaire with this slug already exists' });
          }
          finalSlug = String(slug);
        } else {
          let base = String(title || 'questionnaire')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
          if (!/^[a-z]/.test(base)) base = `q-${base}`;
          finalSlug = base;
          let n = 1;
          while (await database.collection('questionnaires').findOne({ slug: finalSlug })) {
            n += 1;
            finalSlug = `${base}-${n}`;
          }
        }

        const now = new Date();
        const doc = {
          slug: finalSlug,
          title,
          description: description || '',
          version: version || '1',
          active: true,
          isLibrary: false,
          questions: Array.isArray(questions) ? questions : [],
          createdAt: now,
          updatedAt: now,
        };
        const result = await database
          .collection('questionnaires')
          .insertOne(doc);
        res.status(201).json({
          ok: true,
          id: result.insertedId.toString(),
          slug: finalSlug,
        });
      } catch (err) {
        log.error({ err: err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PUT /api/v1/admin/questionnaires/:id
  router.put(
    '/questionnaires/:id',
    validate(updateQuestionnaireSchema),
    async (req, res) => {
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
        log.error({ err: err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

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
      log.error({ err: err }, 'unhandled route error');
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
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  setDefaultStudy,
  listStudyParticipants,
  updateGroupCueConfig,
} from '../../services/studyService.js';
import {
  createCodes,
  listCodes,
  revokeCode,
} from '../../services/studyCodeService.js';
import { logger } from '../../utils/logger.js';
import {
  getWeeklyActiveRate,
  getMeanSrhiTrajectory,
  getDropoutCurve,
} from '../../services/studyAnalyticsService.js';

const log = logger.child({ module: 'studiesRouter' });

export function createStudiesRouter({
  db,
  neo4jRun: _neo4jRun,
  keycloak: _keycloak,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // ── Study CRUD routes ─────────────────────────────────────────────────────

  // GET /api/v1/admin/studies — paginated list with participant count
  router.get('/studies', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
      );
      const database = await getDb();
      const result = await listStudies({ db: database, page, limit });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/studies — create a new study
  router.post('/studies', async (req, res) => {
    try {
      const { name, description, groups, questionnaires } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
      }
      if (!Array.isArray(groups) || groups.length === 0) {
        return res
          .status(400)
          .json({ error: 'groups must be a non-empty array' });
      }
      const database = await getDb();
      const study = await createStudy({
        db: database,
        name,
        description,
        groups,
        questionnaires,
      });
      res.status(201).json({
        id: study._id.toString(),
        name: study.name,
        description: study.description,
        isDefault: study.isDefault,
        isActive: study.isActive,
        groups: study.groups,
        questionnaires: (study.questionnaires || []).map((id) => id.toString()),
        createdAt: study.createdAt,
        updatedAt: study.updatedAt,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id — get a single study
  router.get('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const study = await getStudy({ db: database, id: req.params.id });
      if (!study) return res.status(404).json({ error: 'Study not found' });
      res.json(study);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/studies/:id — update a study
  router.put('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await updateStudy({
        db: database,
        id: req.params.id,
        updates: req.body,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/v1/admin/studies/:id/groups/:groupId/cue-config
  router.patch('/studies/:id/groups/:groupId/cue-config', async (req, res) => {
    try {
      const { cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits } =
        req.body;
      if (!cueCount || !cueSource) {
        return res
          .status(400)
          .json({ error: 'cueCount and cueSource are required' });
      }
      const database = await getDb();
      const result = await updateGroupCueConfig({
        db: database,
        studyId: req.params.id,
        groupId: req.params.groupId,
        cueConfig: {
          cueCount,
          cueSource,
          cuePoolId: cuePoolId ?? null,
          behaviorOptions: behaviorOptions ?? [],
          maxHabits: maxHabits ?? null,
        },
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study or group not found' });
      res.json({ updated: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/studies/:id — soft-delete a study
  router.delete('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await softDeleteStudy({ db: database, id: req.params.id });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      if (result.isDefault) {
        return res.status(409).json({
          error:
            'Cannot deactivate the default study. Set another study as default first.',
        });
      }
      if (result.conflict) {
        return res
          .status(409)
          .json({ error: 'Study has enrolled participants' });
      }
      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/studies/:id/default — mark study as default
  router.put('/studies/:id/default', async (req, res) => {
    try {
      const database = await getDb();
      const result = await setDefaultStudy({ db: database, id: req.params.id });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Study code routes ─────────────────────────────────────────────────────

  // POST /api/v1/admin/studies/:id/codes — generate enrollment codes
  router.post('/studies/:id/codes', async (req, res) => {
    try {
      const { count, groupId, maxRedemptions, expiresAt } = req.body;
      const parsedCount = parseInt(count, 10);
      if (
        !Number.isInteger(parsedCount) ||
        parsedCount < 1 ||
        parsedCount > 100
      ) {
        return res
          .status(400)
          .json({ error: 'count must be a positive integer ≤ 100' });
      }
      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ error: 'groupId is required' });
      }
      const database = await getDb();
      const result = await createCodes({
        db: database,
        studyId: req.params.id,
        groupId,
        count: parsedCount,
        maxRedemptions,
        expiresAt,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      if (result.groupNotFound)
        return res.status(404).json({ error: 'Group not found in study' });
      res.status(201).json({ codes: result.codes });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id/codes — list codes for a study
  router.get('/studies/:id/codes', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
      );
      const database = await getDb();
      const result = await listCodes({
        db: database,
        studyId: req.params.id,
        page,
        limit,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/admin/studies/:id/codes/:code — revoke a code
  router.delete('/studies/:id/codes/:code', async (req, res) => {
    try {
      const database = await getDb();
      const result = await revokeCode({
        db: database,
        studyId: req.params.id,
        code: req.params.code,
      });
      if (result.notFound) return res.status(404).json({ error: 'Not found' });
      if (result.conflict)
        return res
          .status(409)
          .json({ error: 'Code has already been redeemed' });
      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id/participants — list enrolled participants
  router.get('/studies/:id/participants', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        500,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
      );
      const database = await getDb();
      const result = await listStudyParticipants({
        db: database,
        id: req.params.id,
        page,
        limit,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id/analytics
  router.get('/studies/:id/analytics', async (req, res) => {
    try {
      const database = await getDb();
      const [weeklyActiveRate, srhiTrajectory, dropoutCurve] =
        await Promise.all([
          getWeeklyActiveRate({ db: database, studyId: req.params.id }),
          getMeanSrhiTrajectory({ db: database, studyId: req.params.id }),
          getDropoutCurve({ db: database, studyId: req.params.id }),
        ]);
      res.json({ weeklyActiveRate, srhiTrajectory, dropoutCurve });
    } catch (err) {
      log.error({ err: err }, '[studies] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

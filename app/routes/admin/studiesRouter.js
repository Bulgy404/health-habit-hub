import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  deleteStudy,
  setDefaultStudy,
  listStudyParticipants,
  updateGroupCueConfig,
  updateGroupConfig,
  updateAllocationWeights,
} from '../../services/studyService.js';
import { exportStudyData } from '../../services/studyExportService.js';
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
  getQuestionnaireCompletionRates,
  getEnrollmentTrend,
  getDailyActive,
  getHabitsByGroup,
  getEngagementSummary,
} from '../../services/studyAnalyticsService.js';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getStudyCompletion,
  getStudyScheduleCalendar,
} from '../../services/questionnaireScheduleService.js';
import { validate } from '../../middleware/validate.js';
import {
  createStudySchema,
  updateStudySchema,
  createStudyCodesSchema,
  cueConfigSchema,
  updateAllocationSchema,
  updateGroupConfigSchema,
  createQuestionnaireAssignmentSchema,
  updateQuestionnaireAssignmentSchema,
} from '../../schemas/adminSchemas.js';

const log = logger.child({ module: 'studiesRouter' });

export function createStudiesRouter({
  db,
  neo4jRun,
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
  router.post('/studies', validate(createStudySchema), async (req, res) => {
    try {
      const {
        name,
        description,
        groups,
        questionnaires,
        recommenderEnabled,
        onboardingEnabled,
        selfHabitCreationEnabled,
        endDate,
        endOfStudyNotification,
      } = req.body;
      const database = await getDb();
      const study = await createStudy({
        db: database,
        name,
        description,
        groups,
        questionnaires,
        recommenderEnabled,
        onboardingEnabled,
        selfHabitCreationEnabled,
        endDate,
        endOfStudyNotification,
        neo4jRun,
      });
      res.status(201).json({
        id: study._id.toString(),
        name: study.name,
        description: study.description,
        isDefault: study.isDefault,
        isActive: study.isActive,
        recommenderEnabled: study.recommenderEnabled !== false,
        onboardingEnabled: study.onboardingEnabled !== false,
        selfHabitCreationEnabled: study.selfHabitCreationEnabled !== false,
        endDate: study.endDate ?? null,
        endOfStudyNotification: study.endOfStudyNotification,
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
  router.put('/studies/:id', validate(updateStudySchema), async (req, res) => {
    try {
      const database = await getDb();
      const result = await updateStudy({
        db: database,
        id: req.params.id,
        updates: req.body,
        neo4jRun,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/v1/admin/studies/:id/allocation — set per-group allocation weights
  router.patch(
    '/studies/:id/allocation',
    validate(updateAllocationSchema),
    async (req, res) => {
      try {
        const database = await getDb();
        const result = await updateAllocationWeights({
          db: database,
          studyId: req.params.id,
          weights: req.body.weights,
        });
        if (result.notFound)
          return res.status(404).json({ error: 'Study not found' });
        res.json({ updated: true });
      } catch (err) {
        log.error({ err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PATCH /api/v1/admin/studies/:id/groups/:groupId/cue-config
  router.patch(
    '/studies/:id/groups/:groupId/cue-config',
    validate(cueConfigSchema),
    async (req, res) => {
      try {
        const { cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits } =
          req.body;
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
    }
  );

  // PATCH /api/v1/admin/studies/:id/groups/:groupId/config — update per-group config
  router.patch(
    '/studies/:id/groups/:groupId/config',
    validate(updateGroupConfigSchema),
    async (req, res) => {
      try {
        const database = await getDb();
        const result = await updateGroupConfig({
          db: database,
          studyId: req.params.id,
          groupId: req.params.groupId,
          config: req.body,
        });
        if (result.notFound)
          return res.status(404).json({ error: 'Study or group not found' });
        res.json({ updated: true });
      } catch (err) {
        log.error({ err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /api/v1/admin/studies/:id — soft-delete a study
  router.delete('/studies/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await softDeleteStudy({
        db: database,
        id: req.params.id,
        neo4jRun,
      });
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

  /**
   * @swagger
   * /admin/studies/{id}/export:
   *   get:
   *     summary: Download all data for a study
   *     description: Returns a JSON snapshot of the study, its enrollments, participants, questionnaire assignments/windows, and all participant-scoped data (responses, logs, SRHI, donations, comments). Token-card binaries are omitted and recovery phrases are redacted unless EXPOSE_RECOVERY_PHRASES is enabled.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: Study id
   *     responses:
   *       200:
   *         description: JSON export bundle (attachment)
   *         content:
   *           application/json:
   *             schema: { type: object }
   *       404:
   *         description: Study not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/admin/studies/:id/export — downloadable JSON of all study data
  router.get('/studies/:id/export', async (req, res) => {
    try {
      const database = await getDb();
      const bundle = await exportStudyData({ db: database, id: req.params.id });
      if (!bundle) return res.status(404).json({ error: 'Study not found' });
      const safeName = String(bundle.study.name || 'study')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 60);
      const stamp = new Date().toISOString().slice(0, 10);
      res.set({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="study-${safeName || 'export'}-${stamp}.json"`,
      });
      res.send(JSON.stringify(bundle, null, 2));
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/studies/{id}/delete:
   *   post:
   *     summary: Delete a study from the admin UI (soft-delete)
   *     description: Hides the study from the studies list while retaining all of its data in the backend. Requires the exact study name as confirmation. The default study cannot be deleted.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: Study id
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [confirmName]
   *             properties:
   *               confirmName:
   *                 type: string
   *                 description: Must exactly match the study's name
   *     responses:
   *       200:
   *         description: Study hidden from the list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok: { type: boolean, example: true }
   *       400:
   *         description: Name confirmation did not match
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Study not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       409:
   *         description: Cannot delete the default study
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/v1/admin/studies/:id/delete — soft-delete (hide from UI, keep
  // data). Requires the exact study name in the body as a confirmation.
  router.post('/studies/:id/delete', async (req, res) => {
    try {
      const database = await getDb();
      const result = await deleteStudy({
        db: database,
        id: req.params.id,
        confirmName: req.body?.confirmName,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      if (result.isDefault) {
        return res.status(409).json({
          error:
            'Cannot delete the default study. Set another study as default first.',
        });
      }
      if (result.nameMismatch) {
        return res.status(400).json({
          error: 'Study name confirmation does not match.',
        });
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
  router.post(
    '/studies/:id/codes',
    validate(createStudyCodesSchema),
    async (req, res) => {
      try {
        const { count, groupId, maxRedemptions, expiresAt } = req.body;
        const database = await getDb();
        const result = await createCodes({
          db: database,
          studyId: req.params.id,
          groupId,
          count,
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
    }
  );

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
        neo4jRun,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Study not found' });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Questionnaire assignments (schedule + completion) ─────────────────────

  // GET /api/v1/admin/studies/:id/questionnaire-assignments
  router.get('/studies/:id/questionnaire-assignments', async (req, res) => {
    try {
      const database = await getDb();
      const [assignments, completion] = await Promise.all([
        listAssignments({ db: database, studyId: req.params.id }),
        getStudyCompletion({ db: database, studyId: req.params.id }),
      ]);
      res.json({ assignments, completion });
    } catch (err) {
      log.error({ err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/studies/:id/questionnaire-calendar
  router.get('/studies/:id/questionnaire-calendar', async (req, res) => {
    try {
      const database = await getDb();
      const calendar = await getStudyScheduleCalendar({
        db: database,
        studyId: req.params.id,
      });
      res.json({ calendar });
    } catch (err) {
      log.error({ err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/studies/:id/questionnaire-assignments
  router.post(
    '/studies/:id/questionnaire-assignments',
    validate(createQuestionnaireAssignmentSchema),
    async (req, res) => {
      try {
        const { questionnaireId, groupId, cadence } = req.body;
        const database = await getDb();
        const result = await createAssignment({
          db: database,
          studyId: req.params.id,
          groupId: groupId ?? null,
          questionnaireId,
          cadence,
          neo4jRun,
        });
        if (result.notFound)
          return res
            .status(404)
            .json({ error: 'Study or questionnaire not found' });
        if (result.groupNotFound)
          return res.status(404).json({ error: 'Group not found in study' });
        if (result.missingSlug)
          return res.status(400).json({
            error:
              'This questionnaire has no slug; open it in Questionnaires and save it a slug first',
          });
        if (result.conflict)
          return res.status(409).json({
            error: 'This questionnaire is already assigned to that scope',
          });
        res.status(201).json({ id: result.id });
      } catch (err) {
        log.error({ err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PUT /api/v1/admin/studies/:id/questionnaire-assignments/:assignmentId
  router.put(
    '/studies/:id/questionnaire-assignments/:assignmentId',
    validate(updateQuestionnaireAssignmentSchema),
    async (req, res) => {
      try {
        const database = await getDb();
        const result = await updateAssignment({
          db: database,
          studyId: req.params.id,
          assignmentId: req.params.assignmentId,
          updates: req.body,
          neo4jRun,
        });
        if (result.notFound)
          return res.status(404).json({ error: 'Assignment not found' });
        res.json({ updated: true });
      } catch (err) {
        log.error({ err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /api/v1/admin/studies/:id/questionnaire-assignments/:assignmentId
  router.delete(
    '/studies/:id/questionnaire-assignments/:assignmentId',
    async (req, res) => {
      try {
        const database = await getDb();
        const result = await deleteAssignment({
          db: database,
          studyId: req.params.id,
          assignmentId: req.params.assignmentId,
        });
        if (result.notFound)
          return res.status(404).json({ error: 'Assignment not found' });
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // GET /api/v1/admin/studies/:id/analytics
  router.get('/studies/:id/analytics', async (req, res) => {
    try {
      const database = await getDb();
      const [
        weeklyActiveRate,
        srhiTrajectory,
        dropoutCurve,
        questionnaireCompletionRates,
        enrollmentTrend,
        dailyActive,
        habitsByGroup,
        engagement,
      ] = await Promise.all([
        getWeeklyActiveRate({ db: database, studyId: req.params.id, neo4jRun }),
        getMeanSrhiTrajectory({ db: database, studyId: req.params.id }),
        getDropoutCurve({ db: database, studyId: req.params.id, neo4jRun }),
        getQuestionnaireCompletionRates({
          db: database,
          studyId: req.params.id,
          neo4jRun,
        }),
        getEnrollmentTrend({ studyId: req.params.id, neo4jRun }),
        getDailyActive({ db: database, studyId: req.params.id, neo4jRun }),
        getHabitsByGroup({ studyId: req.params.id, neo4jRun }),
        getEngagementSummary({
          db: database,
          studyId: req.params.id,
          neo4jRun,
        }),
      ]);
      res.json({
        weeklyActiveRate,
        srhiTrajectory,
        dropoutCurve,
        questionnaireCompletionRates,
        enrollmentTrend,
        dailyActive,
        habitsByGroup,
        engagement,
      });
    } catch (err) {
      log.error({ err: err }, '[studies] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

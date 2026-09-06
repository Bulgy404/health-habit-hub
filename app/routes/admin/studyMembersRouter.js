import express from 'express';
import { ObjectId } from 'mongodb';
import { makeGetDb } from '../../utils/getDb.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { COLLECTION as MEMBERSHIPS } from '../../models/studyMembership.js';
import { COLLECTION as STUDIES } from '../../models/study.js';
import { resolveIdentityConfig } from '../../services/identityConfig.js';

const log = logger.child({ module: 'studyMembersRouter' });

const ROLE_VALUES = ['researcher', 'lead'];
const SCOPE_VALUES = ['read', 'export'];

/**
 * Per-study researcher membership.
 *
 * `requireStudyAccess` has enforced this since the identity feature shipped,
 * but there was no way to administer it — memberships had to be inserted into
 * Mongo by hand, which meant the first researcher added to a verified study
 * needed a database operation.
 *
 * Admin-only. A `lead` is a label for the person running the study, not a
 * capability: it does not let them manage the member list, because deciding
 * who may read identifiable-adjacent research data is an operator decision.
 */
export function createStudyMembersRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /** Resolve the study id, or send the response and return null. */
  async function studyFor(req, res) {
    let oid;
    try {
      oid = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: 'Invalid study id' });
      return null;
    }
    const database = await getDb();
    const study = await database.collection(STUDIES).findOne({ _id: oid });
    if (!study) {
      res.status(404).json({ error: 'Study not found' });
      return null;
    }
    return { database, oid, study };
  }

  /**
   * @swagger
   * /admin/studies/{id}/members:
   *   get:
   *     summary: List researchers with access to a study
   *     description: >
   *       Also reports whether membership is actually enforced for this study.
   *       An anonymous study is `open` — members can be added, but the list has
   *       no effect until the study becomes verified. Saying so avoids the
   *       impression that adding someone did nothing.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Members plus the study's scoping mode
   *       403:
   *         description: Caller does not have admin role
   */
  router.get(
    '/studies/:id/members',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const ctx = await studyFor(req, res);
        if (!ctx) return;

        const members = await ctx.database
          .collection(MEMBERSHIPS)
          .find({ studyId: ctx.oid })
          .sort({ createdAt: 1 })
          .toArray();

        res.json({
          enforced:
            resolveIdentityConfig(ctx.study).researcherScoping === 'scoped',
          members: members.map((m) => ({
            id: m._id.toString(),
            userId: m.userId,
            username: m.username ?? null,
            role: m.role,
            scope: m.scope,
            createdAt: m.createdAt,
            createdBy: m.createdBy ?? null,
          })),
        });
      } catch (err) {
        log.error({ err }, 'failed to list study members');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/studies/{id}/members:
   *   post:
   *     summary: Add or update a researcher's access to a study
   *     description: >
   *       Upserts on (userId, studyId), so re-adding an existing member changes
   *       their role or scope rather than failing on the unique index.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Member added or updated
   *       400:
   *         description: Invalid role, scope or user id
   */
  router.post(
    '/studies/:id/members',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      const { userId, username, role, scope } = req.body ?? {};
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return res.status(400).json({ error: 'userId_required' });
      }
      if (!ROLE_VALUES.includes(role)) {
        return res.status(400).json({ error: 'invalid_role' });
      }
      if (!SCOPE_VALUES.includes(scope)) {
        return res.status(400).json({ error: 'invalid_scope' });
      }

      try {
        const ctx = await studyFor(req, res);
        if (!ctx) return;

        await ctx.database.collection(MEMBERSHIPS).updateOne(
          { userId: userId.trim(), studyId: ctx.oid },
          {
            $set: {
              username: typeof username === 'string' ? username.trim() : null,
              role,
              scope,
            },
            $setOnInsert: {
              userId: userId.trim(),
              studyId: ctx.oid,
              createdAt: new Date(),
              createdBy: req.user?.sub ?? null,
            },
          },
          { upsert: true }
        );

        res.locals.auditAction = 'grant_study_membership';
        res.locals.auditResourceType = 'study';
        res.locals.auditResourceId = req.params.id;
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'failed to add a study member');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/studies/{id}/members/{userId}:
   *   delete:
   *     summary: Remove a researcher's access to a study
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: userId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Removed, or there was nothing to remove
   */
  router.delete(
    '/studies/:id/members/:userId',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const ctx = await studyFor(req, res);
        if (!ctx) return;

        const result = await ctx.database
          .collection(MEMBERSHIPS)
          .deleteOne({ userId: req.params.userId, studyId: ctx.oid });

        res.locals.auditAction = 'revoke_study_membership';
        res.locals.auditResourceType = 'study';
        res.locals.auditResourceId = req.params.id;
        res.json({ removed: result.deletedCount > 0 });
      } catch (err) {
        log.error({ err }, 'failed to remove a study member');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

export default createStudyMembersRouter;

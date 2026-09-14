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

// A study with more members than this does not exist today, but the list is
// the kind that only ever grows and an unbounded find() is how a page that
// worked for a year stops working. The cap is on the server because that is
// the side that has to survive it.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// One admin adding a whole department in one go is the point of the bulk path;
// pasting an entire user directory into it is not.
const MAX_BULK = 50;

function parsePaging(query) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawSkip = Number.parseInt(query.skip, 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? rawSkip : 0;
  return { limit, skip };
}

/** Validate one member payload; returns an error string or null. */
function validateMember(member) {
  const { userId, role, scope } = member ?? {};
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return 'userId_required';
  }
  if (!ROLE_VALUES.includes(role)) return 'invalid_role';
  if (!SCOPE_VALUES.includes(scope)) return 'invalid_scope';
  return null;
}

function shapeMember(m) {
  return {
    id: m._id.toString(),
    userId: m.userId,
    username: m.username ?? null,
    role: m.role,
    scope: m.scope,
    createdAt: m.createdAt,
    createdBy: m.createdBy ?? null,
  };
}

/**
 * Per-study researcher membership.
 *
 * Admin-only. A `lead` is a label for the person running the study, not a
 * capability: it does not let them manage the member list, because deciding
 * who may read identifiable-adjacent research data is an operator decision.
 *
 * Every grant and revocation records WHO was affected and at WHAT scope in the
 * admin audit log, not merely which study was touched. That detail is the
 * whole evidentiary value of the entry under the joint-controllership
 * arrangement this feature was built for.
 */
export function createStudyMembersRouter({ db, keycloak } = {}) {
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
   * Confirm the id belongs to a real account.
   *
   * Returns the Keycloak username when it does, `null` when the check could
   * not be made at all (no client wired in — the unit tests run this way), and
   * throws {@link UnknownUserError} when the realm says nobody has that id.
   */
  async function resolveUsername(userId) {
    if (!keycloak?.getUser) return null;
    const user = await keycloak.getUser(userId);
    if (!user) {
      const err = new Error('unknown_user');
      err.code = 'unknown_user';
      throw err;
    }
    return user.username ?? null;
  }

  /**
   * @swagger
   * /admin/studies/{id}/members:
   *   get:
   *     summary: List researchers with access to a study
   *     description: >
   *       Paged. Also reports whether membership is actually enforced for this
   *       study — an anonymous study is `open`, so members can be added but the
   *       list has no effect until the study becomes verified. Saying so avoids
   *       the impression that adding someone did nothing.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50, maximum: 200 }
   *       - in: query
   *         name: skip
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Members plus the study's scoping mode and the total count
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

        const { limit, skip } = parsePaging(req.query);
        const collection = ctx.database.collection(MEMBERSHIPS);
        const [members, total] = await Promise.all([
          collection
            .find({ studyId: ctx.oid })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          collection.countDocuments({ studyId: ctx.oid }),
        ]);

        res.json({
          enforced:
            resolveIdentityConfig(ctx.study).researcherScoping === 'scoped',
          total,
          limit,
          skip,
          members: members.map(shapeMember),
        });
      } catch (err) {
        log.error({ err }, 'failed to list study members');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/study-memberships:
   *   get:
   *     summary: Every study one researcher can reach
   *     description: >
   *       Answers "what can this person see?" in one request. Reconstructing it
   *       by opening each study in turn is the kind of audit question that gets
   *       asked under joint controllership, and it should not require knowing
   *       the full list of studies to ask.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: userId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: The user's memberships, each with its study's name
   *       400:
   *         description: No userId given
   */
  router.get(
    '/study-memberships',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const userId = String(req.query.userId || '').trim();
        if (!userId) return res.status(400).json({ error: 'userId_required' });

        const database = await getDb();
        const { limit, skip } = parsePaging(req.query);
        const collection = database.collection(MEMBERSHIPS);
        const [memberships, total] = await Promise.all([
          collection
            .find({ userId })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          collection.countDocuments({ userId }),
        ]);

        // Names are resolved in one query rather than per row — this list is
        // short, but it is the shape that invites an N+1.
        const studyIds = memberships.map((m) => m.studyId);
        const studies = studyIds.length
          ? await database
              .collection(STUDIES)
              .find({ _id: { $in: studyIds } })
              .toArray()
          : [];
        const nameById = new Map(
          studies.map((s) => [s._id.toString(), s.name ?? null])
        );

        res.json({
          userId,
          total,
          limit,
          skip,
          memberships: memberships.map((m) => ({
            ...shapeMember(m),
            studyId: m.studyId.toString(),
            studyName: nameById.get(m.studyId.toString()) ?? null,
          })),
        });
      } catch (err) {
        log.error({ err }, 'failed to list memberships for a user');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/studies/{id}/members:
   *   post:
   *     summary: Add or update researchers' access to a study
   *     description: >
   *       Takes one member, or a `members` array to grant several at once.
   *       Upserts on (userId, studyId), so re-adding an existing member changes
   *       their role or scope rather than failing on the unique index. Every id
   *       is checked against Keycloak first: a grant to an account that does
   *       not exist is refused rather than stored.
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
   *         description: Members added or updated
   *       400:
   *         description: Invalid role, scope or user id, or an id nobody holds
   */
  router.post(
    '/studies/:id/members',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      const body = req.body ?? {};
      const incoming = Array.isArray(body.members) ? body.members : [body];

      if (incoming.length === 0) {
        return res.status(400).json({ error: 'no_members' });
      }
      if (incoming.length > MAX_BULK) {
        return res
          .status(400)
          .json({ error: 'too_many_members', max: MAX_BULK });
      }

      for (const [index, member] of incoming.entries()) {
        const problem = validateMember(member);
        if (problem) {
          return res.status(400).json({ error: problem, index });
        }
      }

      try {
        const ctx = await studyFor(req, res);
        if (!ctx) return;

        // Resolve every id before writing any of them, so a bad id in the
        // middle of a batch cannot leave half the grants applied.
        const resolved = [];
        for (const [index, member] of incoming.entries()) {
          const userId = member.userId.trim();
          let keycloakUsername;
          try {
            keycloakUsername = await resolveUsername(userId);
          } catch (err) {
            if (err.code === 'unknown_user') {
              return res
                .status(400)
                .json({ error: 'unknown_user', index, userId });
            }
            throw err;
          }
          resolved.push({
            userId,
            // Keycloak is authoritative when it answered; the caller-supplied
            // label is only a fallback for the no-client case.
            username:
              keycloakUsername ??
              (typeof member.username === 'string'
                ? member.username.trim() || null
                : null),
            role: member.role,
            scope: member.scope,
          });
        }

        await ctx.database.collection(MEMBERSHIPS).bulkWrite(
          resolved.map((m) => ({
            updateOne: {
              filter: { userId: m.userId, studyId: ctx.oid },
              update: {
                $set: {
                  username: m.username,
                  role: m.role,
                  scope: m.scope,
                },
                $setOnInsert: {
                  userId: m.userId,
                  studyId: ctx.oid,
                  createdAt: new Date(),
                  createdBy: req.user?.sub ?? null,
                },
              },
              upsert: true,
            },
          }))
        );

        res.locals.auditAction = 'grant_study_membership';
        res.locals.auditResourceType = 'study';
        res.locals.auditResourceId = req.params.id;
        res.locals.auditDetail = resolved
          .map(
            (m) =>
              `${m.username ?? m.userId} (${m.userId}) as ${m.role}/${m.scope}`
          )
          .join('; ');
        res.json({ ok: true, granted: resolved.length });
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

        const collection = ctx.database.collection(MEMBERSHIPS);
        // Read first, so the audit entry can name what was actually revoked.
        // After the delete there is nothing left to describe.
        const existing = await collection.findOne({
          userId: req.params.userId,
          studyId: ctx.oid,
        });
        const result = await collection.deleteOne({
          userId: req.params.userId,
          studyId: ctx.oid,
        });

        res.locals.auditAction = 'revoke_study_membership';
        res.locals.auditResourceType = 'study';
        res.locals.auditResourceId = req.params.id;
        res.locals.auditDetail = existing
          ? `${existing.username ?? existing.userId} (${existing.userId}) had ${existing.role}/${existing.scope}`
          : `${req.params.userId} (no membership to revoke)`;
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

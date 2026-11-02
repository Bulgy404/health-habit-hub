import { ObjectId } from 'mongodb';
import { ROLES, isStudyScoped } from './roles.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as MEMBERSHIPS } from '../models/studyMembership.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'requireStudyAccess' });

/**
 * Decide whether the caller may use one study.
 *
 * Admins always pass. Both research roles require a current membership on
 * every study, including anonymous studies and legacy studies marked `open`.
 * The list is filtered by studyScopeGuard; knowing another study's ID grants
 * no access to its details, mutations, participants, analytics or exports.
 *
 * @param {{ db: import('mongodb').Db, user: object, studyId: string,
 *   requireExport?: boolean }} args `requireExport` demands
 *   `scope: 'export'` rather than mere read access — downloading a study
 *   bundle is a materially bigger act than viewing a page.
 * @returns {Promise<{ ok: true, study: object|null, membership: object|null }
 *   | { ok: false, status: number, body: object }>}
 */
export async function checkStudyAccess({
  db,
  user,
  studyId,
  requireExport = false,
}) {
  const roles = user?.realm_access?.roles ?? [];
  if (roles.includes(ROLES.ADMIN)) {
    return { ok: true, study: null, membership: null };
  }
  if (!isStudyScoped(user) || !user?.sub) {
    return {
      ok: false,
      status: 403,
      body: { error: 'not_permitted_for_role' },
    };
  }

  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return { ok: false, status: 400, body: { error: 'Invalid study id' } };
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) {
    return { ok: false, status: 404, body: { error: 'Study not found' } };
  }

  const membership = await db
    .collection(MEMBERSHIPS)
    .findOne({ userId: String(user.sub), studyId: oid });

  if (!membership) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'not_a_study_member',
        message:
          'This study restricts access to named members. Ask a study ' +
          'administrator to add you.',
      },
    };
  }
  if (requireExport && membership.scope !== 'export') {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'export_not_permitted',
        message: 'Your membership grants read access, not export.',
      },
    };
  }
  return { ok: true, study, membership };
}

/**
 * Per-study access control for researchers, as route middleware. See
 * {@link checkStudyAccess} for the rules.
 *
 * @param {{ getDb: () => Promise<import('mongodb').Db>, requireExport?: boolean }} deps
 */
export function requireStudyAccess({ getDb, requireExport = false }) {
  return async function studyAccessGuard(req, res, next) {
    try {
      const roles = req.user?.realm_access?.roles ?? [];
      if (roles.includes(ROLES.ADMIN)) return next();

      const result = await checkStudyAccess({
        db: await getDb(),
        user: req.user,
        studyId: req.params.id ?? req.params.studyId,
        requireExport,
      });
      if (!result.ok) return res.status(result.status).json(result.body);
      return next();
    } catch (err) {
      // Fail CLOSED. An error resolving access must not become access.
      log.error({ err }, 'study access check failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

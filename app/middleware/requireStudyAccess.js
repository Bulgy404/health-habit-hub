import { ObjectId } from 'mongodb';
import { ROLES, isStudyScoped } from './roles.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as MEMBERSHIPS } from '../models/studyMembership.js';
import { resolveIdentityConfig } from '../services/identityConfig.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'requireStudyAccess' });

/**
 * Decide whether the caller may use one study.
 *
 * Four deliberate properties:
 *
 * 1. **Admins always pass.** Scoping is about limiting researchers to their own
 *    studies, not about locking operators out of the platform they run.
 *
 * 2. **A `study-researcher` always needs membership** (#66). That role exists
 *    to see only the studies an admin assigned, so the study's own setting
 *    does not matter for them.
 *
 * 3. **For a full `researcher`, scoping applies only where the study asks for
 *    it.** Anonymous studies default to `open`, which is exactly the behaviour
 *    before memberships existed, so nothing existing breaks.
 *    `resolveIdentityConfig` forces `scoped` for verified studies, so
 *    protection lands precisely where identity data exists.
 *
 * 4. **Study existence is not secret to a full researcher.** One without
 *    membership gets 403 on a scoped study's pages and export, but the study
 *    still appears in the list — the sensitive thing is the data, not the
 *    name. A `study-researcher`'s list is filtered instead (studyScopeGuard),
 *    because a partner from outside should not learn what else runs here.
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

  if (
    !isStudyScoped(user) &&
    resolveIdentityConfig(study).researcherScoping !== 'scoped'
  ) {
    return { ok: true, study, membership: null };
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

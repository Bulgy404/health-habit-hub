import { ObjectId } from 'mongodb';
import { ROLES } from './auth.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as MEMBERSHIPS } from '../models/studyMembership.js';
import { resolveIdentityConfig } from '../services/identityConfig.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'requireStudyAccess' });

/**
 * Per-study access control for researchers.
 *
 * Three deliberate properties:
 *
 * 1. **Admins always pass.** Scoping is about limiting researchers to their own
 *    studies, not about locking operators out of the platform they run.
 *
 * 2. **Scoping applies only where the study asks for it.** Anonymous studies
 *    default to `open`, which is exactly today's behaviour, so nothing existing
 *    breaks. `resolveIdentityConfig` forces `scoped` for verified studies, so
 *    protection lands precisely where identity data exists.
 *
 * 3. **Study existence is not secret.** A researcher without membership gets
 *    403 on the detail and the export, but the study still appears in the list.
 *    Hiding it would make the studies page look broken and generate support
 *    load for no security gain — the sensitive thing is the data, not the name.
 *
 * @param {{ getDb: () => Promise<import('mongodb').Db>, requireExport?: boolean }} deps
 *   `requireExport` demands `scope: 'export'` rather than mere read access —
 *   downloading a study bundle is a materially bigger act than viewing a page.
 */
export function requireStudyAccess({ getDb, requireExport = false }) {
  return async function studyAccessGuard(req, res, next) {
    try {
      const roles = req.user?.realm_access?.roles ?? [];
      if (roles.includes(ROLES.ADMIN)) return next();

      const studyId = req.params.id ?? req.params.studyId;
      let oid;
      try {
        oid = new ObjectId(studyId);
      } catch {
        return res.status(400).json({ error: 'Invalid study id' });
      }

      const db = await getDb();
      const study = await db.collection(STUDIES).findOne({ _id: oid });
      if (!study) return res.status(404).json({ error: 'Study not found' });

      if (resolveIdentityConfig(study).researcherScoping !== 'scoped') {
        return next();
      }

      const membership = await db
        .collection(MEMBERSHIPS)
        .findOne({ userId: String(req.user.sub), studyId: oid });

      if (!membership) {
        return res.status(403).json({
          error: 'not_a_study_member',
          message:
            'This study restricts access to named members. Ask a study ' +
            'administrator to add you.',
        });
      }
      if (requireExport && membership.scope !== 'export') {
        return res.status(403).json({
          error: 'export_not_permitted',
          message: 'Your membership grants read access, not export.',
        });
      }
      return next();
    } catch (err) {
      // Fail CLOSED. An error resolving access must not become access.
      log.error({ err }, 'study access check failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

import { ObjectId } from 'mongodb';
import { ROLES, isStudyScoped } from './roles.js';
import { checkStudyAccess } from './requireStudyAccess.js';
import { COLLECTION as MEMBERSHIPS } from '../models/studyMembership.js';
import { COLLECTION as CAMPAIGNS } from '../models/notificationCampaign.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'studyScopeGuard' });

// /studies/:id and everything below it.
const STUDY_PATH = /^\/studies\/([^/]+)(\/.*)?$/;

// What a `study-researcher` may do on a study they are a member of: the same
// study pages a researcher uses, minus the operator decisions — deleting a
// study, making it the default, and managing who else is a member. Paths are
// relative to /studies/:id.
const STUDY_ROUTES = [
  ['GET', /^$/],
  ['PUT', /^$/],
  ['PATCH', /^\/allocation$/],
  ['PATCH', /^\/groups\/[^/]+\/(cue-config|config)$/],
  ['GET', /^\/export(\/zip)?$/],
  ['GET', /^\/codes$/],
  ['POST', /^\/codes$/],
  ['DELETE', /^\/codes\/[^/]+$/],
  ['GET', /^\/participants$/],
  ['GET', /^\/questionnaire-assignments$/],
  ['POST', /^\/questionnaire-assignments$/],
  ['PUT', /^\/questionnaire-assignments\/[^/]+$/],
  ['DELETE', /^\/questionnaire-assignments\/[^/]+$/],
  ['GET', /^\/questionnaire-calendar$/],
  ['GET', /^\/analytics$/],
];

// Outside a study: the study list (filtered below) and the questionnaire
// library, which the study page reads to offer questionnaires for assignment.
// Notification campaigns are handled separately because the study they belong
// to is in the query, the body or the stored campaign rather than the path.
const OTHER_ROUTES = [
  ['GET', /^\/?$/],
  ['GET', /^\/studies\/?$/],
  ['GET', /^\/questionnaires\/?$/],
  ['GET', /^\/questionnaires\/[^/]+$/],
];

// One participant's detail, which the analytics page opens from a study's
// participant table. The study is the one that participant is enrolled in.
const PARTICIPANT_DETAIL_PATH =
  /^\/participants\/([^/]+)\/(progress|reminder-plans|habits|responses)$/;

const NOTIFICATIONS_PATH = /^\/notifications\/?$/;
const NOTIFICATION_PATH = /^\/notifications\/([0-9a-fA-F]{24})$/;

function allowed(routes, method, path) {
  return routes.some(([m, re]) => m === method && re.test(path));
}

function forbidden(res) {
  return res.status(403).json({
    error: 'not_permitted_for_role',
    message:
      'Your account can only work on the studies it was assigned to. Ask ' +
      'an administrator if you need more.',
  });
}

/**
 * Per-study fence for the admin API (#66).
 *
 * Mounted once at the top of the admin router, so it runs for every /admin
 * request, including the admin resources apiRouter mounts separately
 * (/admin/notifications, /admin/studies/:id/export/zip, /admin/cue-pools),
 * since those requests pass through the admin router first.
 *
 * - Every `/studies/:id/...` request from a non-admin goes through
 *   {@link checkStudyAccess}. For a full `researcher` that only bites on
 *   studies that ask for scoping; before this, those studies protected their
 *   detail page and export but not their participants, codes or analytics.
 *
 * - The detail of one participant (`/participants/:id/progress` and the
 *   like) is judged by the study that participant is enrolled in, the same
 *   way.
 *
 * - A `study-researcher` is held to an allowlist: their member studies'
 *   pages, their participants' details, the filtered study list, the
 *   questionnaire library (read only) and notification campaigns for their
 *   studies. Anything else, including any admin route added later, is a 403
 *   until someone decides otherwise.
 *
 * @param {{ getDb: () => Promise<import('mongodb').Db> }} deps
 */
export function createStudyScopeGuard({ getDb }) {
  return async function studyScopeGuard(req, res, next) {
    const roles = req.user?.realm_access?.roles ?? [];
    if (roles.includes(ROLES.ADMIN)) return next();
    const scoped = isStudyScoped(req.user);

    try {
      const studyMatch = STUDY_PATH.exec(req.path);
      if (studyMatch) {
        const subPath = studyMatch[2] ?? '';
        if (scoped && !allowed(STUDY_ROUTES, req.method, subPath)) {
          return forbidden(res);
        }
        // Whether the study is anonymous or verified is the operator's call.
        if (scoped && req.method === 'PUT' && subPath === '' && req.body) {
          if (Object.hasOwn(req.body, 'identity')) return forbidden(res);
        }
        const result = await checkStudyAccess({
          db: await getDb(),
          user: req.user,
          studyId: studyMatch[1],
          requireExport: /^\/export(\/zip)?$/.test(subPath),
        });
        if (!result.ok) return res.status(result.status).json(result.body);
        return next();
      }

      const participantMatch = PARTICIPANT_DETAIL_PATH.exec(req.path);
      if (participantMatch && req.method === 'GET') {
        const db = await getDb();
        const enrollment = await db
          .collection(ENROLLMENTS)
          .findOne({ userId: participantMatch[1] });
        // Not enrolled anywhere: no study to judge by, so only the
        // unrestricted researcher keeps the access they had.
        if (!enrollment) return scoped ? forbidden(res) : next();
        const result = await checkStudyAccess({
          db,
          user: req.user,
          studyId: String(enrollment.studyId),
        });
        if (result.ok || (!scoped && result.status === 404)) return next();
        return res.status(result.status).json(result.body);
      }

      if (!scoped) return next();

      const db = await getDb();
      const memberships = await db
        .collection(MEMBERSHIPS)
        .find({ userId: String(req.user.sub) })
        .toArray();
      const memberOf = new Set(memberships.map((m) => String(m.studyId)));

      if (allowed(OTHER_ROUTES, req.method, req.path)) {
        // Read by the study list, which shows only these studies.
        req.studyScope = {
          studyIds: memberships.map((m) => new ObjectId(m.studyId)),
        };
        return next();
      }

      if (NOTIFICATIONS_PATH.test(req.path)) {
        if (req.method === 'GET') {
          return memberOf.has(String(req.query.studyId ?? ''))
            ? next()
            : forbidden(res);
        }
        if (req.method === 'POST') {
          const ok = await campaignStaysInStudy(db, req.body, memberOf);
          return ok ? next() : forbidden(res);
        }
        return forbidden(res);
      }

      const one = NOTIFICATION_PATH.exec(req.path);
      if (one && req.method === 'DELETE') {
        const campaign = await db
          .collection(CAMPAIGNS)
          .findOne({ _id: new ObjectId(one[1]) });
        if (!campaign) return res.status(404).json({ error: 'Not found' });
        return memberOf.has(String(campaign.studyId ?? ''))
          ? next()
          : forbidden(res);
      }

      return forbidden(res);
    } catch (err) {
      // Fail CLOSED. An error resolving access must not become access.
      log.error({ err }, 'study scope check failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * True when a new campaign from a `study-researcher` can only reach
 * participants of one of their studies: it names a member study, and any
 * groups or participants it targets belong to that study.
 */
async function campaignStaysInStudy(db, body, memberOf) {
  const studyId = String(body?.studyId ?? '');
  if (!memberOf.has(studyId)) return false;
  const targetIds = Array.isArray(body.targetIds) ? body.targetIds : [];

  if (body.targetType === 'all_enrolled') return true;
  if (targetIds.length === 0) return false;

  if (body.targetType === 'group') {
    const study = await db
      .collection(STUDIES)
      .findOne({ _id: new ObjectId(studyId) });
    const groupIds = new Set(
      (study?.groups ?? []).map((g) => String(g.id ?? g._id))
    );
    return targetIds.every((id) => groupIds.has(String(id)));
  }

  if (body.targetType === 'individual') {
    const enrolled = await db.collection(ENROLLMENTS).countDocuments({
      userId: { $in: targetIds.map(String) },
      studyId: new ObjectId(studyId),
    });
    return enrolled === new Set(targetIds.map(String)).size;
  }

  return false;
}

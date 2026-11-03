import { ObjectId } from 'mongodb';
import { ROLES, isStudyScoped } from '../middleware/roles.js';
import { COLLECTION as MEMBERSHIPS } from '../models/studyMembership.js';

export async function donationScope(db, user, studyId, requireExport = false) {
  if (studyId && (typeof studyId !== 'string' || !ObjectId.isValid(studyId))) {
    throw Object.assign(new Error('Invalid study id'), { status: 400 });
  }
  if (user?.realm_access?.roles?.includes(ROLES.ADMIN)) return undefined;
  if (!isStudyScoped(user) || !user?.sub) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  const memberships = await db
    .collection(MEMBERSHIPS)
    .find({ userId: String(user.sub) })
    .toArray();
  const ids = memberships
    .filter((m) => !requireExport || m.scope === 'export')
    .map((m) => String(m.studyId));
  if (studyId && !ids.includes(studyId)) {
    throw Object.assign(
      new Error(
        requireExport
          ? 'Export not permitted for this study'
          : 'Study access denied'
      ),
      { status: 403 }
    );
  }
  // An all-studies export must never silently omit read-only studies.
  if (
    requireExport &&
    !studyId &&
    memberships.some((m) => m.scope !== 'export')
  ) {
    throw Object.assign(new Error('Select a study with export permission'), {
      status: 403,
    });
  }
  return ids;
}

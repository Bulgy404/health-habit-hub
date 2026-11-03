import { ObjectId } from 'mongodb';
import { isPrivileged, isStudyScoped } from '../middleware/roles.js';
import { checkStudyAccess } from '../middleware/requireStudyAccess.js';

export function accessError(message, status = 403) {
  return Object.assign(new Error(message), { status });
}
export async function requireResourceStudy(db, user, studyId, manage = false) {
  if (!studyId || typeof studyId !== 'string' || !ObjectId.isValid(studyId))
    throw accessError('Select a study', 400);
  const result = await checkStudyAccess({
    db,
    user,
    studyId,
    requireManage: manage,
  });
  if (!result.ok) throw accessError(result.body.error, result.status);
  if (
    isPrivileged(user) &&
    !(await db.collection('studies').findOne({ _id: new ObjectId(studyId) }))
  )
    throw accessError('Study not found', 404);
  return new ObjectId(studyId);
}
export async function resourceFilter(db, user, studyId) {
  if (studyId) {
    const id = await requireResourceStudy(db, user, studyId);
    return { $or: [{ studyId: null }, { studyId: id }] };
  }
  if (isPrivileged(user)) return {};
  if (!isStudyScoped(user) || !user?.sub) throw accessError('Access denied');
  const memberships = await db
    .collection('study_memberships')
    .find({ userId: String(user.sub) })
    .toArray();
  return {
    $or: [
      { studyId: null },
      { studyId: { $in: memberships.map((m) => new ObjectId(m.studyId)) } },
    ],
  };
}
export async function authorizeResource(db, user, resource, manage = false) {
  if (!resource) throw accessError('Resource not found', 404);
  if (isPrivileged(user)) return;
  if (!resource.studyId) {
    if (manage || !isStudyScoped(user))
      throw accessError(
        'Shared resources are read-only. Copy into your study to edit.'
      );
    return;
  }
  await requireResourceStudy(db, user, String(resource.studyId), manage);
  // Do not let a scoped researcher change a resource reused by another study.
  if (manage && resource.slug) {
    const foreign = await db.collection('questionnaire_assignments').findOne({
      questionnaireId: resource._id,
      studyId: { $ne: resource.studyId },
    });
    if (foreign)
      throw accessError(
        'This questionnaire is used by another study. Copy it before editing.',
        409
      );
  }
}
export async function assertStudyResource(db, collection, query, studyId) {
  const resource = await db.collection(collection).findOne(query);
  if (
    !resource ||
    (resource.studyId && String(resource.studyId) !== String(studyId))
  )
    throw accessError('Resource does not belong to this study', 400);
  return resource;
}

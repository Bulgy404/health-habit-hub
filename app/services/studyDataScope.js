import { ObjectId } from 'mongodb';

export function studyDataFilter(studyId) {
  return studyId
    ? { studyId: { $in: [new ObjectId(studyId), String(studyId)] } }
    : {};
}

// Legacy form responses have no studyId. Attribute them through the original
// scheduled window or donation, never through the participant's current study.
export async function studyResponseFilter(db, studyId) {
  if (!studyId) return {};
  const filter = studyDataFilter(studyId);
  const [windows, donations] = await Promise.all([
    db.collection('questionnaire_windows').find(filter).toArray(),
    db.collection('habit_donations').find(filter).toArray(),
  ]);
  const references = [
    ...windows.map((w) => w.responseId),
    ...donations.map((d) => d.questionnaireResponseId),
  ].filter(Boolean);
  const ids = references.flatMap((id) =>
    ObjectId.isValid(String(id)) ? [new ObjectId(String(id)), String(id)] : [id]
  );
  return { $or: [filter, { _id: { $in: ids } }] };
}

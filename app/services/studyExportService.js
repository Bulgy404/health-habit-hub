// app/services/studyExportService.js
//
// Builds a complete, downloadable snapshot of a study and all data associated
// with its participants. Used by the admin "download all data" step before a
// study is deleted from the UI (data itself is retained in the backend).

import { ObjectId } from 'mongodb';
import { recoveryPhrasesEnabled } from '../utils/recoveryPhrase.js';
import { COLLECTION as HABIT_COMMENTS_COLLECTION } from '../models/habitComment.js';

/** Collections keyed by participant `userId` that hold their generated data. */
const USER_SCOPED_COLLECTIONS = [
  'form_responses',
  'survey_responses',
  'implementation_intentions',
  'daily_behavior_logs',
  'srhi_responses',
  'habit_donations',
  HABIT_COMMENTS_COLLECTION,
  'habit_annotations',
  'recommendations',
  'recommendation_feedback',
  'consents',
  'user_profiles',
  'profiles',
];

async function safeFind(db, collection, filter) {
  try {
    return await db.collection(collection).find(filter).toArray();
  } catch {
    // Missing collection or unindexed field — treat as empty rather than fail.
    return [];
  }
}

/**
 * Remove bulky binaries and (unless explicitly enabled) account secrets from
 * participant records so the export stays a clean, portable JSON document.
 */
/**
 * Credential-bearing fields that must never leave the platform in a research
 * export. Redacted unconditionally — unlike `recoveryPhrase`, there is no
 * configuration under which a researcher legitimately needs these.
 *
 * `passwordHash` in particular was previously exported verbatim: bcrypt is
 * slow but not unbreakable, and a study bundle is copied, emailed and archived
 * far more freely than the database it came from.
 */
const CREDENTIAL_FIELDS = ['passwordHash', 'password', 'salt', 'email'];

function sanitizeParticipant(p) {
  const clean = { ...p };
  if ('tokenCardPdf' in clean) clean.tokenCardPdf = '[binary omitted]';
  if (!recoveryPhrasesEnabled() && 'recoveryPhrase' in clean) {
    clean.recoveryPhrase = '[redacted]';
  }
  for (const field of CREDENTIAL_FIELDS) {
    if (field in clean) clean[field] = '[redacted]';
  }
  return clean;
}

/**
 * Gather a full export bundle for a study.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<object|null>} export bundle, or null if the study is absent
 */
export async function exportStudyData({ db, id }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }

  const study = await db.collection('studies').findOne({ _id: oid });
  if (!study) return null;

  const enrollments = await safeFind(db, 'enrollments', { studyId: oid });
  const userIds = [
    ...new Set(enrollments.map((e) => e.userId).filter(Boolean)),
  ];
  const byUser = { userId: { $in: userIds } };

  const participants = userIds.length
    ? (await safeFind(db, 'participants', byUser)).map(sanitizeParticipant)
    : [];
  const questionnaireAssignments = await safeFind(
    db,
    'questionnaire_assignments',
    { studyId: oid }
  );
  const questionnaireWindows = await safeFind(db, 'questionnaire_windows', {
    studyId: oid,
  });

  const collections = {
    studies: [study],
    enrollments,
    participants,
    questionnaire_assignments: questionnaireAssignments,
    questionnaire_windows: questionnaireWindows,
  };

  for (const coll of USER_SCOPED_COLLECTIONS) {
    collections[coll] = userIds.length ? await safeFind(db, coll, byUser) : [];
  }

  const counts = Object.fromEntries(
    Object.entries(collections).map(([k, v]) => [k, v.length])
  );

  return {
    exportedAt: new Date().toISOString(),
    study: { id: study._id.toString(), name: study.name },
    participantCount: userIds.length,
    counts,
    collections,
  };
}

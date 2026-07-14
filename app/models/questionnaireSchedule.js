/**
 * Questionnaire scheduling models.
 *
 * Two collections work together to let admins assign questionnaires to a study
 * (all groups) or to a specific group, on a cadence, and to track completion
 * per participant:
 *
 *   questionnaire_assignments — one per (study, group|null, questionnaire) with
 *     a cadence describing how often it recurs.
 *   questionnaire_windows     — one per (participant, assignment, occurrence):
 *     a scheduled due date and its completion state (linked to form_responses).
 */

export const ASSIGNMENTS = 'questionnaire_assignments';
export const WINDOWS = 'questionnaire_windows';

/**
 * Create indexes for both collections (idempotent).
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const assignments = db.collection(ASSIGNMENTS);
  // Fetch all assignments for a study (study-wide + per-group) in one query.
  await assignments.createIndex(
    { studyId: 1, groupId: 1 },
    { name: 'assignments_study_group' }
  );
  // Prevent duplicate assignments of the same questionnaire to the same scope.
  await assignments.createIndex(
    { studyId: 1, groupId: 1, questionnaireId: 1 },
    { name: 'assignments_scope_questionnaire_unique', unique: true }
  );

  const windows = db.collection(WINDOWS);
  // One window per participant per assignment occurrence. `intentionId` is part
  // of the key so per-habit "deliver on habit creation" windows (all
  // occurrence 1, one per habit) don't collide; enrollment-scheduled windows
  // have no intentionId (indexed as null) and stay unique by occurrence.
  // Drop the legacy 3-field index if it exists from a prior deploy.
  try {
    await windows.dropIndex('windows_user_assignment_occurrence_unique');
  } catch {
    // Index absent (fresh DB or already migrated) — nothing to drop.
  }
  await windows.createIndex(
    { userId: 1, assignmentId: 1, occurrence: 1, intentionId: 1 },
    {
      name: 'windows_user_assignment_occurrence_intention_unique',
      unique: true,
    }
  );
  // Completion lookups: nearest open window for a participant + questionnaire.
  await windows.createIndex(
    { userId: 1, questionnaireSlug: 1, submittedAt: 1, scheduledFor: 1 },
    { name: 'windows_user_slug_open' }
  );
  // Study-level completion aggregation.
  await windows.createIndex(
    { studyId: 1, questionnaireId: 1 },
    { name: 'windows_study_questionnaire' }
  );
}

// app/services/reminderConfigService.js

/**
 * Shared resolution logic for the 4 reminder types (habit, questionnaire,
 * end-of-study, study-update). Kept as its own module — rather than living in
 * studyService.js — so habitConfigService.js and questionnaireScheduleService.js
 * can both depend on it without a circular import (neither currently imports
 * studyService.js).
 *
 * Each type's config is `{ mode, time }`:
 *   off:                no reminder; time is null.
 *   participant_choice: participant picks their own time; time is null here.
 *                       Habit reminders only — no participant-facing picker
 *                       exists for the other 3 types.
 *   admin_fixed:        admin locks `time`; the participant has no input.
 */

/**
 * Baseline reminders used when a study document has no `reminders` field at
 * all. These preserve today's actual behavior for each type: habit reminders
 * were fully participant-chosen, questionnaire/end-of-study reminders always
 * fired at a fixed 9am with no participant input, and study-update reminders
 * didn't exist (off).
 * @returns {{habit: object, questionnaire: object, endOfStudy: object, studyUpdate: object}}
 */
export function defaultReminders() {
  return {
    habit: { mode: 'participant_choice', time: null },
    questionnaire: { mode: 'admin_fixed', time: '09:00' },
    endOfStudy: { mode: 'admin_fixed', time: '09:00' },
    studyUpdate: { mode: 'off', time: null },
  };
}

/**
 * Merge a study's stored `reminders` (if any) over the defaults, per type.
 * @param {{ reminders?: object }} study
 * @returns {{habit: object, questionnaire: object, endOfStudy: object, studyUpdate: object}}
 */
export function normalizeReminders(study) {
  const defaults = defaultReminders();
  const stored = study?.reminders ?? {};
  const out = {};
  for (const type of Object.keys(defaults)) {
    out[type] = stored[type] ?? defaults[type];
  }
  return out;
}

/**
 * Resolve the effective reminder config for a participant: a non-null
 * per-group override wins over the study-level setting, independently per
 * reminder type.
 * @param {{ study: object, group?: { reminders?: object } | null }} deps
 * @returns {{habit: object, questionnaire: object, endOfStudy: object, studyUpdate: object}}
 */
export function resolveEffectiveReminders({ study, group }) {
  const studyReminders = normalizeReminders(study);
  const out = {};
  for (const type of Object.keys(studyReminders)) {
    out[type] = group?.reminders?.[type] ?? studyReminders[type];
  }
  return out;
}

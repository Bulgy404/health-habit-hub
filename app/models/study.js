/**
 * Study model — MongoDB collection 'studies'.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   name         string     Required. Human-readable study name.
 *   description  string     Optional description.
 *   isDefault    boolean    True for the default study (partial-unique index ensures at most one).
 *   isActive     boolean    Soft-delete flag.
 *   recommenderEnabled boolean  Optional. When false, participants in this study do not see
 *                              the recommender screen in the app. Defaults to true (treated as
 *                              enabled when absent, for backward compatibility). A group's
 *                              `recommenderEnabled` (below), when non-null, overrides this.
 *   habitEntryMode  string     Optional. 'freeText' (default) or 'structured'. Study-wide
 *                              default — a group's `habitEntryMode` (below), when non-null,
 *                              overrides this per group. When 'structured', the new-habit
 *                              screen shows a picker over structuredActivityKeys instead of a
 *                              free-text field. Defaults to 'freeText' when absent.
 *   structuredActivityKeys  Array<string>  Optional. Activity-type catalog keys (see
 *                              activity_types collection) offered when habitEntryMode is
 *                              'structured'. Ignored (and should be empty) otherwise. Study-wide
 *                              default — a group's `structuredActivityKeys` (below), when
 *                              non-null, overrides this per group.
 *   groups       Array<{    Experiment groups for this study.
 *     id:               ObjectId
 *     label:            string
 *     index:            1|2|3|4
 *     allocationWeight: int (1–100, default 1) — relative weight for round-robin enrollment via study codes.
 *     cueConfig:        { restricted: boolean, cueCount, cueSource, cuePoolId, maxHabits } | null
 *     activityTypeConfig: { restricted: boolean, allowedActivityTypeIds: ObjectId[] } | null
 *     reminders:        { habit, questionnaire, endOfStudy, studyUpdate } | null — same shape as
 *                          study-level `reminders` below; each type independently null means
 *                          "inherit the study-level setting for that type".
 *     autoDonate:       boolean — when true habits are auto-donated to the community on creation
 *     onboardingEnabled: boolean | null — null means "inherit the study-level setting".
 *     selfHabitCreationEnabled: boolean | null — null means "inherit the study-level setting".
 *     recommenderEnabled: boolean | null — null means "inherit the study-level setting".
 *     habitEntryMode:   'freeText' | 'structured' | null — null means "inherit the study-level
 *                          setting"; a non-null value overrides it for this group only.
 *     structuredActivityKeys: Array<string> | null — null means "inherit the study-level
 *                          setting"; only consulted when this group's effective habitEntryMode
 *                          (own override or inherited) is 'structured'.
 *   }>
 *   questionnaires  Array<ObjectId>  Refs to questionnaires collection.
 *   endDate      Date|null  Optional. When set, the study concludes on this date.
 *   endOfStudyNotification  { title: string, body: string } | null
 *                              Optional. Content for the end-of-study notification (whether/when
 *                              it fires is configured via `reminders.endOfStudy` below).
 *   reminders    { habit, questionnaire, endOfStudy, studyUpdate }  Optional. Each entry is
 *                  { mode: 'off'|'participant_choice'|'admin_fixed', time: string|null }
 *                  (time is "HH:MM", required for admin_fixed, null otherwise;
 *                  'participant_choice' is valid for `habit` only — the other
 *                  3 types have no participant-facing override).
 *                  Absent entries fall back to reminderConfigService.defaultReminders().
 *   createdAt    Date
 *   updatedAt    Date
 */

export const COLLECTION = 'studies';

/** Reusable bsonType shape for one reminder type's { mode, time } config. */
const REMINDER_MODE_BSON = {
  bsonType: ['object', 'null'],
  properties: {
    mode: {
      bsonType: 'string',
      enum: ['off', 'participant_choice', 'admin_fixed'],
    },
    time: { bsonType: ['string', 'null'] },
  },
};

/** Reusable bsonType shape for the §7.3 Information Overload guard config. */
const INFO_OVERLOAD_GUARD_BSON = {
  bsonType: ['object', 'null'],
  properties: {
    enabled: { bsonType: 'bool' },
    userOptOutAllowed: { bsonType: 'bool' },
  },
};

/** Reusable bsonType shape for the { habit, questionnaire, endOfStudy, studyUpdate } group. */
const REMINDERS_BSON = {
  bsonType: ['object', 'null'],
  properties: {
    habit: REMINDER_MODE_BSON,
    questionnaire: REMINDER_MODE_BSON,
    endOfStudy: REMINDER_MODE_BSON,
    studyUpdate: REMINDER_MODE_BSON,
  },
};

/** MongoDB JSON Schema validator for the studies collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'name',
      'isDefault',
      'isActive',
      'groups',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      name: { bsonType: 'string' },
      description: { bsonType: ['string', 'null'] },
      isDefault: { bsonType: 'bool' },
      isActive: { bsonType: 'bool' },
      // Optional: absence is treated as enabled (true) for backward compatibility.
      recommenderEnabled: { bsonType: 'bool' },
      // §7.1 Habit Stacking — study-wide toggle; a group's value overrides.
      habitStackingEnabled: { bsonType: 'bool' },
      // §7.2 Implementation Intention Reminder — reminder copy mode.
      reminderContentMode: {
        bsonType: 'string',
        enum: ['generic', 'implementation_intention'],
      },
      // §7.3 Information Overload — growing per-type habit cap guard.
      informationOverloadGuard: INFO_OVERLOAD_GUARD_BSON,
      // §7.5 Gamification — study-wide on/off toggle; a group's value overrides.
      gamificationEnabled: { bsonType: 'bool' },
      // Optional: absence is treated as 'freeText' for backward compatibility.
      habitEntryMode: { bsonType: 'string', enum: ['freeText', 'structured'] },
      structuredActivityKeys: {
        bsonType: 'array',
        items: { bsonType: 'string' },
      },
      groups: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['id', 'label', 'index'],
          properties: {
            id: { bsonType: 'objectId' },
            label: { bsonType: 'string' },
            index: { bsonType: 'int', minimum: 1, maximum: 4 },
            allocationWeight: { bsonType: 'int', minimum: 1, maximum: 100 },
            cueConfig: {
              bsonType: ['object', 'null'],
              properties: {
                restricted: { bsonType: 'bool' },
                cueCount: { bsonType: 'string', enum: ['single', 'multi'] },
                cueSource: {
                  bsonType: 'string',
                  enum: ['low_quality', 'high_quality', 'self_selected'],
                },
                cuePoolId: { bsonType: ['objectId', 'null'] },
                maxHabits: { bsonType: ['int', 'null'] },
              },
            },
            activityTypeConfig: {
              bsonType: ['object', 'null'],
              properties: {
                restricted: { bsonType: 'bool' },
                allowedActivityTypeIds: {
                  bsonType: 'array',
                  items: { bsonType: 'objectId' },
                },
              },
            },
            reminders: REMINDERS_BSON,
            autoDonate: { bsonType: 'bool' },
            // §7.1/§7.2/§7.3 group-level overrides (null = inherit study).
            habitStackingEnabled: { bsonType: ['bool', 'null'] },
            reminderContentMode: {
              bsonType: ['string', 'null'],
              enum: ['generic', 'implementation_intention', null],
            },
            informationOverloadGuard: INFO_OVERLOAD_GUARD_BSON,
            // §7.5 group-level gamification override (null = inherit study).
            gamificationEnabled: { bsonType: ['bool', 'null'] },
          },
        },
      },
      // @deprecated — superseded by questionnaire_assignments.active as the
      // single source of truth for which questionnaires apply to a study.
      // No longer written by the admin UI; left declared only for backward
      // compatibility with any pre-existing documents.
      questionnaires: {
        bsonType: 'array',
        items: { bsonType: 'objectId' },
      },
      endDate: { bsonType: ['date', 'null'] },
      endOfStudyNotification: {
        bsonType: ['object', 'null'],
        properties: {
          title: { bsonType: 'string' },
          body: { bsonType: 'string' },
        },
      },
      reminders: REMINDERS_BSON,
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the studies collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  // Partial unique index: at most one study may have isDefault: true.
  await col.createIndex(
    { isDefault: 1 },
    {
      unique: true,
      partialFilterExpression: { isDefault: true },
      name: 'studies_isDefault_unique',
    }
  );
}

/**
 * Implementation Intention model — MongoDB collection 'implementation_intentions'.
 *
 * Schema:
 *   _id                ObjectId   Auto-generated
 *   userId             string     Required. User identifier.
 *   enrollmentId       ObjectId   Optional. Reference to enrollment.
 *   studyId            ObjectId   Optional. Reference to study.
 *   groupId            ObjectId   Optional. Reference to group.
 *   behaviorKey        string     Required. Unique behavior identifier.
 *   behaviorLabel      string     Required. Display label for the behavior.
 *   durationMinutes    int        Required. Duration of behavior in minutes.
 *   cues               Array<{    0-2 cue objects. Required to be non-empty EXCEPT when
 *                                 creationMode is 'stacked' — a stacked habit's anchor
 *                                 habit (see stackedOn/anchorLabel) already serves as the
 *                                 trigger, so a separate cue is optional (§7.1).
 *     text:     string
 *     cueId:    ObjectId (optional)
 *     source:   'pre_rated' | 'self_selected'
 *   }>
 *   intentionStatement string     Required. User's "if-then" statement.
 *   habitType          string     Required. 'build' | 'quit' — whether the participant is
 *                                 building a new behaviour or breaking an existing one
 *                                 (§7.4 Habit Distinction). Changes downstream cue guidance
 *                                 and colours the habit card; a standard research covariate.
 *                                 Defaults to 'build' for documents created before this field
 *                                 existed (see ensureIndexes backfill note).
 *   stackedOn          ObjectId   Optional. When set, this intention was created by stacking
 *                                 onto an existing *tracked* anchor habit (§7.1 Habit
 *                                 Stacking). Points at the anchor intention's _id; null when
 *                                 the anchor was free-typed (not itself tracked) or the habit
 *                                 is standalone.
 *   anchorLabel        string     Optional. Human-readable anchor habit name for a stacked
 *                                 habit, shown as its own field (not folded into cues) on the
 *                                 confirm/detail screens — e.g. "Drink my morning coffee".
 *                                 Set whether the anchor is tracked (stackedOn) or free-typed
 *                                 (stackedOn null). Null for standalone habits.
 *   creationMode       string     Required. 'standalone' | 'stacked' — how the habit was
 *                                 created. Lets researchers compare autonomy-tier progression
 *                                 speed for stacked vs. standalone habits. Defaults to
 *                                 'standalone'.
 *   earnedBadges       Array<{    Optional. Gamification badges earned for this habit (§7.5).
 *                                 Only earned badges are persisted; XP/levels are recomputed
 *                                 on read from reminderPlanService signals.
 *     badgeKey: string
 *     earnedAt: Date
 *   }>
 *   status             string     Required. 'active' | 'paused' | 'completed' | 'abandoned'
 *   createdAt          Date
 *   updatedAt          Date
 */

/** Allowed habit types (§7.4 Habit Distinction). */
export const HABIT_TYPES = ['build', 'quit'];

/** Allowed creation modes (§7.1 Habit Stacking). */
export const CREATION_MODES = ['standalone', 'stacked'];

export const COLLECTION = 'implementation_intentions';

/** MongoDB JSON Schema validator for the implementation_intentions collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'userId',
      'behaviorKey',
      'behaviorLabel',
      'durationMinutes',
      'cues',
      'intentionStatement',
      'habitType',
      'creationMode',
      'status',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      enrollmentId: { bsonType: ['objectId', 'null'] },
      studyId: { bsonType: ['objectId', 'null'] },
      groupId: { bsonType: ['objectId', 'null'] },
      behaviorKey: { bsonType: 'string' },
      behaviorLabel: { bsonType: 'string' },
      durationMinutes: { bsonType: 'int' },
      cues: {
        bsonType: 'array',
        // 0 allowed only for creationMode: 'stacked' (enforced in
        // intentionsRouter.js, not expressible in JSON Schema here) — the
        // anchor (stackedOn/anchorLabel) serves as the trigger instead.
        minItems: 0,
        maxItems: 2,
        items: {
          bsonType: 'object',
          required: ['text', 'source'],
          properties: {
            text: { bsonType: 'string' },
            cueId: { bsonType: ['objectId', 'null'] },
            source: {
              bsonType: 'string',
              enum: ['pre_rated', 'self_selected'],
            },
          },
        },
      },
      intentionStatement: { bsonType: 'string' },
      // §7.4 Habit Distinction — required build/quit flag.
      habitType: { bsonType: 'string', enum: ['build', 'quit'] },
      // §7.1 Habit Stacking — anchor reference + creation mode.
      stackedOn: { bsonType: ['objectId', 'null'] },
      anchorLabel: { bsonType: ['string', 'null'] },
      creationMode: {
        bsonType: 'string',
        enum: ['standalone', 'stacked'],
      },
      // §7.5 Gamification — persisted earned badges (XP/levels recomputed on read).
      earnedBadges: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['badgeKey', 'earnedAt'],
          properties: {
            badgeKey: { bsonType: 'string' },
            earnedAt: { bsonType: 'date' },
          },
        },
      },
      reminderTime: {
        bsonType: ['string', 'null'],
        pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      },
      status: {
        bsonType: 'string',
        enum: ['active', 'paused', 'completed', 'abandoned'],
      },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the implementation_intentions collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { userId: 1, status: 1 },
    { name: 'intentions_userId_status' }
  );
  await col.createIndex(
    { enrollmentId: 1 },
    { name: 'intentions_enrollmentId', sparse: true }
  );
  // §7.3 Information Overload counts active habits per type per user, and
  // §7.4 filters/analyses by build vs. quit — index the compound key.
  await col.createIndex(
    { userId: 1, habitType: 1, status: 1 },
    { name: 'intentions_userId_habitType_status' }
  );
  // §7.1 Habit Stacking — resolve an anchor's stacked children cheaply.
  await col.createIndex(
    { stackedOn: 1 },
    { name: 'intentions_stackedOn', sparse: true }
  );
}

/**
 * Backfill the fields introduced in §7 for documents created before they
 * existed, so the collection validator (which now requires habitType and
 * creationMode) accepts them and reminder/gamification reads have consistent
 * shapes. Idempotent: only touches documents still missing a field.
 *
 * Legacy habits default to habitType 'build' (the app only supported
 * build-style habits before Habit Distinction) and creationMode 'standalone'.
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ habitType: number, creationMode: number }>}
 */
export async function backfillHabitFields(db) {
  const col = db.collection(COLLECTION);
  const [habitTypeRes, creationModeRes] = await Promise.all([
    col.updateMany(
      { habitType: { $exists: false } },
      { $set: { habitType: 'build' } }
    ),
    col.updateMany(
      { creationMode: { $exists: false } },
      { $set: { creationMode: 'standalone', stackedOn: null } }
    ),
  ]);
  return {
    habitType: habitTypeRes.modifiedCount,
    creationMode: creationModeRes.modifiedCount,
  };
}

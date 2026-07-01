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
 *                              enabled when absent, for backward compatibility).
 *   groups       Array<{    Experiment groups for this study.
 *     id:               ObjectId
 *     label:            string
 *     index:            1|2|3|4
 *     allocationWeight: int (1–100, default 1) — relative weight for round-robin enrollment via study codes.
 *     cueConfig:        { restricted: boolean, cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits } | null
 *     activityTypeConfig: { restricted: boolean, allowedActivityTypeIds: ObjectId[] } | null
 *     reminderConfig:   { enabled: boolean, fixedTime: string|null } | null  — fixedTime is "HH:MM"
 *     autoDonate:       boolean — when true habits are auto-donated to the community on creation
 *   }>
 *   questionnaires  Array<ObjectId>  Refs to questionnaires collection.
 *   createdAt    Date
 *   updatedAt    Date
 */

export const COLLECTION = 'studies';

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
                behaviorOptions: {
                  bsonType: 'array',
                  items: { bsonType: 'string' },
                },
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
            reminderConfig: {
              bsonType: ['object', 'null'],
              properties: {
                enabled: { bsonType: 'bool' },
                fixedTime: { bsonType: ['string', 'null'] },
              },
            },
            autoDonate: { bsonType: 'bool' },
          },
        },
      },
      questionnaires: {
        bsonType: 'array',
        items: { bsonType: 'objectId' },
      },
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

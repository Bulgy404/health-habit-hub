/**
 * Study model — MongoDB collection 'studies'.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   name         string     Required. Human-readable study name.
 *   description  string     Optional description.
 *   isDefault    boolean    True for the default study (partial-unique index ensures at most one).
 *   isActive     boolean    Soft-delete flag.
 *   groups       Array<{    Experiment groups for this study.
 *     id:    ObjectId
 *     label: string
 *     index: 1|2|3|4
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
      groups: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['id', 'label', 'index'],
          properties: {
            id: { bsonType: 'objectId' },
            label: { bsonType: 'string' },
            index: { bsonType: 'int', minimum: 1, maximum: 4 },
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

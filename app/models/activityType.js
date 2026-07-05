/**
 * Activity Type model — MongoDB collection 'activity_types'.
 *
 * Schema:
 *   _id        ObjectId   Auto-generated
 *   key        string     Required. Unique snake_case identifier (e.g. "swimming").
 *   label_en   string     Required. English display label.
 *   label_de   string     Optional. German display label.
 *   label_ja   string     Optional. Japanese display label.
 *   isDefault  boolean    Required. Whether included in the platform-wide default behavior list.
 *   createdAt  Date       Required.
 */

export const COLLECTION = 'activity_types';

/** MongoDB JSON Schema validator for the activity_types collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['key', 'label_en', 'isDefault', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      key: { bsonType: 'string' },
      label_en: { bsonType: 'string' },
      label_de: { bsonType: 'string' },
      label_ja: { bsonType: 'string' },
      isDefault: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the activity_types collection.
 * Safe to call multiple times — createIndex is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { key: 1 },
    { unique: true, name: 'activity_types_key_unique' }
  );
  await col.createIndex({ isDefault: 1 }, { name: 'activity_types_isDefault' });
}

/**
 * Built-in activity types seeded on first startup.
 * These mirror the previous hardcoded BEHAVIOR_OPTIONS in app/utils/srhi.js.
 */
export const SEED_ACTIVITY_TYPES = [
  {
    key: 'walking',
    label_en: 'Walking',
    label_de: 'Spazieren gehen',
    label_ja: 'ウォーキング',
    isDefault: true,
  },
  {
    key: 'light_jogging',
    label_en: 'Light jogging',
    label_de: 'Leichtes Joggen',
    label_ja: '軽いジョギング',
    isDefault: true,
  },
  {
    key: 'cycling',
    label_en: 'Cycling',
    label_de: 'Radfahren',
    label_ja: 'サイクリング',
    isDefault: true,
  },
  {
    key: 'structured_calisthenics',
    label_en: 'Structured calisthenics',
    label_de: 'Kalisteniktraining',
    label_ja: '自重トレーニング',
    isDefault: true,
  },
  {
    key: 'yoga',
    label_en: 'Yoga',
    label_de: 'Yoga',
    label_ja: 'ヨガ',
    isDefault: true,
  },
];

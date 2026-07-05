// app/services/activityTypeService.js
import { COLLECTION, SEED_ACTIVITY_TYPES } from '../models/activityType.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'activityTypeService' });

/**
 * Seed the built-in activity types on first startup.
 * Uses upsert semantics so re-running is safe.
 * @param {import('mongodb').Db} db
 */
export async function seedActivityTypes(db) {
  const col = db.collection(COLLECTION);
  for (const at of SEED_ACTIVITY_TYPES) {
    await col.updateOne(
      { key: at.key },
      { $setOnInsert: { ...at, createdAt: new Date() } },
      { upsert: true }
    );
  }
  log.info('Activity types seeded');
}

/**
 * Return all activity types, ordered by creation time (built-ins first).
 * @param {import('mongodb').Db} db
 * @returns {Promise<Array>}
 */
export async function listActivityTypes(db) {
  return db
    .collection(COLLECTION)
    .find(
      {},
      {
        projection: {
          _id: 0,
          key: 1,
          label_en: 1,
          label_de: 1,
          label_ja: 1,
          isDefault: 1,
          createdAt: 1,
        },
      }
    )
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Create a new activity type.
 * @param {import('mongodb').Db} db
 * @param {{ key: string, label_en: string, label_de?: string, label_ja?: string, isDefault?: boolean }} data
 */
export async function createActivityType(
  db,
  { key, label_en, label_de, label_ja, isDefault }
) {
  if (typeof key !== 'string' || !key)
    throw new TypeError('key must be a non-empty string');
  const existing = await db.collection(COLLECTION).findOne({ key });
  if (existing)
    return { error: 'Activity type with this key already exists', status: 409 };
  const doc = {
    key,
    label_en: String(label_en),
    label_de: label_de != null ? String(label_de) : '',
    label_ja: label_ja != null ? String(label_ja) : '',
    isDefault: Boolean(isDefault),
    createdAt: new Date(),
  };
  await db.collection(COLLECTION).insertOne(doc);
  return {
    key: doc.key,
    label_en: doc.label_en,
    label_de: doc.label_de,
    label_ja: doc.label_ja,
    isDefault: doc.isDefault,
  };
}

/**
 * Update an activity type (partial patch — only supplied fields change).
 * @param {import('mongodb').Db} db
 * @param {string} key
 * @param {{ label_en?: string, label_de?: string, label_ja?: string, isDefault?: boolean }} patch
 */
export async function updateActivityType(db, key, patch) {
  if (typeof key !== 'string' || !key)
    throw new TypeError('key must be a non-empty string');
  // Build an explicit $set document from the only fields this operation is
  // allowed to touch — prevents operator injection even if upstream validation
  // is bypassed.
  const $set = {};
  if (patch.label_en !== undefined) $set.label_en = String(patch.label_en);
  if (patch.label_de !== undefined)
    $set.label_de = patch.label_de != null ? String(patch.label_de) : '';
  if (patch.label_ja !== undefined)
    $set.label_ja = patch.label_ja != null ? String(patch.label_ja) : '';
  if (patch.isDefault !== undefined) $set.isDefault = Boolean(patch.isDefault);
  // Guard against an empty patch: MongoDB throws "'$set' is empty" if we pass
  // { $set: {} }. A no-op PATCH should just confirm the doc exists, not 500.
  if (Object.keys($set).length === 0) {
    const exists = await db
      .collection(COLLECTION)
      .findOne({ key }, { projection: { _id: 1 } });
    return exists ? { ok: true } : { notFound: true };
  }
  const result = await db.collection(COLLECTION).updateOne({ key }, { $set });
  if (result.matchedCount === 0) return { notFound: true };
  return { ok: true };
}

/**
 * Delete an activity type by key.
 * @param {import('mongodb').Db} db
 * @param {string} key
 */
export async function deleteActivityType(db, key) {
  if (typeof key !== 'string' || !key)
    throw new TypeError('key must be a non-empty string');
  const result = await db.collection(COLLECTION).deleteOne({ key });
  if (result.deletedCount === 0) return { notFound: true };
  return { deleted: true };
}

/**
 * Return the keys of all activity types marked as default.
 * Used by habitConfigService as fallback for users outside a study.
 * @param {import('mongodb').Db} db
 * @returns {Promise<string[]>}
 */
export async function getDefaultBehaviorKeys(db) {
  const docs = await db
    .collection(COLLECTION)
    .find({ isDefault: true }, { projection: { _id: 0, key: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map((d) => d.key);
}

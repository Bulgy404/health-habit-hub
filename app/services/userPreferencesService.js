// app/services/userPreferencesService.js
/**
 * Per-user preferences that aren't part of the study protocol — currently just
 * the §7.3 Information Overload opt-out. Stored in the `user_preferences`
 * collection, one document per user (keyed by userId), created lazily.
 */

export const COLLECTION = 'user_preferences';

/**
 * Read a user's preferences, with defaults for anything not yet set.
 * @param {{ db: object, userId: string }} deps
 * @returns {Promise<{ informationOverloadOptOut: boolean }>}
 */
export async function getPreferences({ db, userId }) {
  const doc = await db
    .collection(COLLECTION)
    .findOne({ userId: String(userId) });
  return {
    informationOverloadOptOut: doc?.informationOverloadOptOut === true,
  };
}

/**
 * Set the §7.3 Information Overload opt-out for a user (idempotent upsert).
 * @param {{ db: object, userId: string, optOut: boolean }} deps
 * @returns {Promise<{ informationOverloadOptOut: boolean }>}
 */
export async function setInformationOverloadOptOut({ db, userId, optOut }) {
  const value = optOut === true;
  await db.collection(COLLECTION).updateOne(
    { userId: String(userId) },
    {
      $set: { informationOverloadOptOut: value, updatedAt: new Date() },
      $setOnInsert: { userId: String(userId), createdAt: new Date() },
    },
    { upsert: true }
  );
  return { informationOverloadOptOut: value };
}

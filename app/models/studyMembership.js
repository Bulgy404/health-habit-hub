/**
 * StudyMembership model — MongoDB collection 'study_memberships'.
 *
 * Per-study researcher access. Until this existed the `researcher` role granted
 * access to EVERY study and every export, with no way to narrow it.
 *
 * Rolled out deliberately narrowly: scoping is enforced only where
 * `identity.researcherScoping === 'scoped'`, which `resolveIdentityConfig`
 * forces on for verified studies and leaves 'open' everywhere else. Turning it
 * on globally would break every existing researcher on the day it shipped;
 * this gets the protection exactly where identity data exists and nowhere else.
 *
 * Schema:
 *   _id        ObjectId
 *   userId     string    Keycloak `sub` of the researcher
 *   username   string    Denormalised for display; not authoritative
 *   studyId    ObjectId  Ref to studies._id
 *   role       string    'researcher' | 'lead'
 *   scope      string    'read' | 'export' — export is strictly more than read
 *   createdAt  Date
 *   createdBy  string
 */

export const COLLECTION = 'study_memberships';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'studyId', 'role', 'scope', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'string' },
      username: { bsonType: ['string', 'null'] },
      studyId: { bsonType: 'objectId' },
      role: { bsonType: 'string', enum: ['researcher', 'lead'] },
      scope: { bsonType: 'string', enum: ['read', 'export'] },
      createdAt: { bsonType: 'date' },
      createdBy: { bsonType: ['string', 'null'] },
    },
  },
};

export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { userId: 1, studyId: 1 },
    { unique: true, name: 'study_memberships_user_study_unique' }
  );
  await col.createIndex({ studyId: 1 }, { name: 'study_memberships_studyId' });
}

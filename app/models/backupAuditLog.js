/**
 * Backup audit log model — MongoDB collection 'backup_audit_log'.
 *
 * Append-only record of every trigger/restore/upload action taken through
 * the admin Backups page. Written *before* the action is attempted (not
 * after it completes) so a crash mid-restore still leaves a record of who
 * initiated it.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   byUserId     string     Required. Keycloak `sub` of the acting admin.
 *   byUsername   string     Required. Keycloak preferred_username, for
 *                            human-readable display (denormalized; not a
 *                            live reference).
 *   action       string     Required. One of 'trigger' | 'restore' | 'upload'.
 *   filename     string     Optional. Target/result backup filename, when
 *                            applicable (restore target, upload result).
 *   result       string     Required. One of 'requested' | 'succeeded' | 'failed'.
 *                            'requested' is written up front; a later entry
 *                            is not created — result is left as 'requested'
 *                            if the process crashes before it can update it,
 *                            which is itself a meaningful audit signal.
 *   detail       string     Optional. Error message or extra context.
 *   createdAt    Date       Required.
 */

export const COLLECTION = 'backup_audit_log';

/** MongoDB JSON Schema validator for the backup_audit_log collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['byUserId', 'byUsername', 'action', 'result', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      byUserId: { bsonType: 'string' },
      byUsername: { bsonType: 'string' },
      action: { bsonType: 'string', enum: ['trigger', 'restore', 'upload'] },
      filename: { bsonType: ['string', 'null'] },
      result: {
        bsonType: 'string',
        enum: ['requested', 'succeeded', 'failed'],
      },
      detail: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the backup_audit_log collection.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { createdAt: -1 },
    { name: 'backup_audit_log_createdAt' }
  );
}

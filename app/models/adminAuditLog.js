/**
 * Admin action audit log model — MongoDB collection 'admin_audit_log'.
 *
 * Append-only record of every mutating request (POST/PUT/PATCH/DELETE) made
 * through the admin API, written by app/middleware/auditAdminActions.js.
 * Deliberately separate from 'backup_audit_log' (see backupAuditLog.js),
 * which has its own richer job-lifecycle semantics tied to async
 * trigger/restore polling — mixing the two would muddy both.
 *
 * Schema:
 *   _id          ObjectId   Auto-generated
 *   byUserId     string     Required. Keycloak `sub` of the acting admin.
 *   byUsername   string     Required. Keycloak preferred_username, for
 *                            human-readable display (denormalized; not a
 *                            live reference).
 *   method       string     Required. HTTP method (POST/PUT/PATCH/DELETE).
 *   action       string     Required. Human-readable label — either set by
 *                            the route handler via res.locals.auditAction,
 *                            or a generic "METHOD /path" fallback.
 *   resourceType string     Optional. e.g. 'study', 'participant',
 *                            'questionnaire'. Set via res.locals.auditResourceType.
 *   resourceId   string     Optional. Set via res.locals.auditResourceId.
 *   statusCode   number     Required. The response status code.
 *   result       string     Required. 'succeeded' | 'failed', derived from
 *                            statusCode < 400.
 *   detail       string     Optional. Error message, when result is 'failed'.
 *   createdAt    Date       Required.
 */

export const COLLECTION = 'admin_audit_log';

/** MongoDB JSON Schema validator for the admin_audit_log collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'byUserId',
      'byUsername',
      'method',
      'action',
      'statusCode',
      'result',
      'createdAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      byUserId: { bsonType: 'string' },
      byUsername: { bsonType: 'string' },
      method: { bsonType: 'string' },
      action: { bsonType: 'string' },
      resourceType: { bsonType: ['string', 'null'] },
      resourceId: { bsonType: ['string', 'null'] },
      statusCode: { bsonType: 'int' },
      result: { bsonType: 'string', enum: ['succeeded', 'failed'] },
      detail: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the admin_audit_log collection.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { createdAt: -1 },
    { name: 'admin_audit_log_createdAt' }
  );
  await col.createIndex(
    { resourceType: 1, resourceId: 1 },
    { name: 'admin_audit_log_resource' }
  );
}

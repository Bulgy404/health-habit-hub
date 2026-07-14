/**
 * Notification Campaign model — MongoDB collection 'notification_campaigns'.
 *
 * Schema:
 *   _id            ObjectId   Auto-generated
 *   studyId        ObjectId   Optional. Reference to study.
 *   createdBy      string     Required. User ID of creator.
 *   title          string     Required. Max 65 characters.
 *   body           string     Required. Max 240 characters.
 *   targetType     string     Required. 'individual' | 'group' | 'all_enrolled'
 *   targetIds      Array<string>  Array of target user/group IDs.
 *   scheduledFor   Date       Optional. When to send the notification.
 *   sentAt         Date       Optional. When the notification was last sent.
 *   recipientCount int        Optional. Number of recipients from the most recent send.
 *   recurrence     { intervalDays: int, until: Date|null } | null
 *                              Optional. When set, this is a recurring "study update reminder":
 *                              after each send, sendCampaign reschedules it (status back to
 *                              'scheduled', scheduledFor advanced by intervalDays) instead of
 *                              leaving it 'sent' — until `until` (if set) has passed.
 *   sendCount      int        Optional. Number of times a recurring campaign has been sent.
 *   status         string     Required. 'draft' | 'scheduled' | 'sent' | 'failed' | 'cancelled'
 *   createdAt      Date       Required.
 */

export const COLLECTION = 'notification_campaigns';

/** MongoDB JSON Schema validator for the notification_campaigns collection. */
export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'createdBy',
      'title',
      'body',
      'targetType',
      'status',
      'createdAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      studyId: { bsonType: ['objectId', 'null'] },
      createdBy: { bsonType: 'string' },
      title: { bsonType: 'string', maxLength: 65 },
      body: { bsonType: 'string', maxLength: 240 },
      targetType: {
        bsonType: 'string',
        enum: ['individual', 'group', 'all_enrolled'],
      },
      targetIds: { bsonType: 'array', items: { bsonType: 'string' } },
      scheduledFor: { bsonType: ['date', 'null'] },
      sentAt: { bsonType: ['date', 'null'] },
      recipientCount: { bsonType: ['int', 'null'] },
      recurrence: {
        bsonType: ['object', 'null'],
        properties: {
          intervalDays: { bsonType: 'int', minimum: 1, maximum: 365 },
          until: { bsonType: ['date', 'null'] },
        },
      },
      sendCount: { bsonType: ['int', 'null'] },
      status: {
        bsonType: 'string',
        enum: ['draft', 'scheduled', 'sent', 'failed', 'cancelled'],
      },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Create indexes for the notification_campaigns collection.
 * Safe to call multiple times — uses createIndex which is idempotent.
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  await col.createIndex(
    { status: 1, scheduledFor: 1 },
    { name: 'campaigns_status_scheduledFor' }
  );
  await col.createIndex(
    { studyId: 1 },
    { name: 'campaigns_studyId', sparse: true }
  );
}

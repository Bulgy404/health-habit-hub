import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'seedProfileFields' });

const DEFAULT_PROFILE_FIELDS = [
  {
    fieldId: 'gender',
    label: 'Gender',
    type: 'select',
    options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    required: false,
    order: 0,
  },
  {
    fieldId: 'age_group',
    label: 'Age group',
    type: 'select',
    options: ['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'],
    required: false,
    order: 1,
  },
];

export async function seedDefaultProfileFields(db) {
  const collection = db.collection('profile_field_definitions');
  for (const field of DEFAULT_PROFILE_FIELDS) {
    const existing = await collection.findOne({ fieldId: field.fieldId });
    if (!existing) {
      await collection.insertOne({
        ...field,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      log.info(`[seed] Inserted default profile field: ${field.fieldId}`);
    }
  }
}

export async function runSeedDefaultProfileFields() {
  const getDb = makeGetDb();
  try {
    const db = await getDb();
    await seedDefaultProfileFields(db);
  } catch (err) {
    log.error({ err }, '[seed] Failed to seed default profile fields');
  }
}

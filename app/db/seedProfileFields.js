import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'seedProfileFields' });

// Library fields — shipped defaults, not editable/deletable from the admin
// UI (mirrors the questionnaire library's isLibrary flag). `value` on each
// option is a stable machine key (stored as the participant's answer and
// synced to Neo4j); `label` is what's shown, localized.
const DEFAULT_PROFILE_FIELDS = [
  {
    fieldId: 'gender',
    label: {
      en: 'Gender',
      de: 'Geschlecht',
      fr: 'Genre',
      ja: '性別',
      nl: 'Geslacht',
    },
    type: 'select',
    languages: ['en', 'de', 'fr', 'ja', 'nl'],
    options: [
      {
        value: 'male',
        label: {
          en: 'Male',
          de: 'Männlich',
          fr: 'Homme',
          ja: '男性',
          nl: 'Man',
        },
      },
      {
        value: 'female',
        label: {
          en: 'Female',
          de: 'Weiblich',
          fr: 'Femme',
          ja: '女性',
          nl: 'Vrouw',
        },
      },
      {
        value: 'non_binary',
        label: {
          en: 'Non-binary',
          de: 'Nicht-binär',
          fr: 'Non-binaire',
          ja: 'ノンバイナリー',
          nl: 'Non-binair',
        },
      },
      {
        value: 'prefer_not_to_say',
        label: {
          en: 'Prefer not to say',
          de: 'Keine Angabe',
          fr: 'Je préfère ne pas répondre',
          ja: '回答しない',
          nl: 'Zeg ik liever niet',
        },
      },
    ],
    required: false,
    order: 0,
  },
  {
    fieldId: 'age_group',
    label: {
      en: 'Age group',
      de: 'Altersgruppe',
      fr: "Tranche d'âge",
      ja: '年齢層',
      nl: 'Leeftijdsgroep',
    },
    type: 'select',
    languages: ['en', 'de', 'fr', 'ja', 'nl'],
    options: [
      {
        value: 'under_18',
        label: {
          en: 'Under 18',
          de: 'Unter 18',
          fr: 'Moins de 18 ans',
          ja: '18歳未満',
          nl: 'Onder de 18',
        },
      },
      {
        value: '18_24',
        label: {
          en: '18–24',
          de: '18–24',
          fr: '18–24',
          ja: '18〜24歳',
          nl: '18–24',
        },
      },
      {
        value: '25_34',
        label: {
          en: '25–34',
          de: '25–34',
          fr: '25–34',
          ja: '25〜34歳',
          nl: '25–34',
        },
      },
      {
        value: '35_44',
        label: {
          en: '35–44',
          de: '35–44',
          fr: '35–44',
          ja: '35〜44歳',
          nl: '35–44',
        },
      },
      {
        value: '45_54',
        label: {
          en: '45–54',
          de: '45–54',
          fr: '45–54',
          ja: '45〜54歳',
          nl: '45–54',
        },
      },
      {
        value: '55_64',
        label: {
          en: '55–64',
          de: '55–64',
          fr: '55–64',
          ja: '55〜64歳',
          nl: '55–64',
        },
      },
      {
        value: '65_plus',
        label: {
          en: '65+',
          de: '65+',
          fr: '65 ans et plus',
          ja: '65歳以上',
          nl: '65+',
        },
      },
    ],
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
        isLibrary: true,
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

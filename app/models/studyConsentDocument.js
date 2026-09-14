/**
 * StudyConsentDocument model — MongoDB collection 'study_consent_documents'.
 *
 * Study-specific consent documents (`identity.consentDocumentSlug`), authored
 * and edited in the admin portal.
 *
 * Why a collection and not just files: the shipped `consent-<slug>.md` files
 * are the seed, but a wording change agreed with an ethics committee mid-study
 * must not require a container rebuild and a redeploy. A database row for the
 * same (slug, lang) OVERRIDES the file; deleting the row falls back to it.
 * Which of the two is live is shown in the portal, because "I edited it and
 * nothing changed" is the failure this precedence creates if it is hidden.
 *
 * Deliberately NOT the home of the platform's own legal documents (privacy,
 * imprint, accessibility, consent). Those are binding texts under version
 * control with a CI consistency gate, and moving them into a database that any
 * admin can edit would remove that gate for no operational gain.
 *
 * Schema:
 *   _id           ObjectId
 *   slug          string    Study consent slug, e.g. 'habconnect-clinical'
 *   lang          string    'en'|'de'|'ja'|'fr'|'nl'
 *   body          string    Markdown source, front matter already stripped
 *   version       string    Semver, e.g. '1.0.0' — recorded on every acceptance
 *   effectiveDate string    YYYY-MM-DD
 *   bindingLanguage string  Which locale governs legally
 *   status        string    'draft' | 'published' — only published can be
 *                           attached to a study
 *   updatedAt     Date
 *   updatedBy     string    Keycloak `sub` of the editing admin
 */

export const COLLECTION = 'study_consent_documents';

export const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'slug',
      'lang',
      'body',
      'version',
      'effectiveDate',
      'status',
      'updatedAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      slug: { bsonType: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$' },
      lang: { bsonType: 'string', enum: ['en', 'de', 'ja', 'fr', 'nl'] },
      body: { bsonType: 'string' },
      version: { bsonType: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
      effectiveDate: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      bindingLanguage: { bsonType: ['string', 'null'] },
      status: { bsonType: 'string', enum: ['draft', 'published'] },
      updatedAt: { bsonType: 'date' },
      updatedBy: { bsonType: ['string', 'null'] },
    },
  },
};

export async function ensureIndexes(db) {
  const col = db.collection(COLLECTION);
  // One document per (slug, language). The unique index is what makes an
  // upsert-by-(slug,lang) safe against two admins saving at once.
  await col.createIndex(
    { slug: 1, lang: 1 },
    { unique: true, name: 'study_consent_documents_slug_lang_unique' }
  );
}

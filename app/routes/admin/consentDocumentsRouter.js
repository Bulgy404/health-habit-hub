import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { SUPPORTED_LANGS } from '../../utils/markdown.js';
import {
  listConsentDocumentSlugs,
  describeConsentDocument,
  checkConsentDocumentReadiness,
  studiesUsingSlug,
  getConsentDocumentForEdit,
  saveConsentDocument,
  deleteConsentDocumentOverride,
  validateConsentDocumentInput,
  isValidSlug,
} from '../../services/consentDocumentService.js';

const log = logger.child({ module: 'consentDocumentsRouter' });

/**
 * Study consent documents — the per-study consent a participant accepts in
 * addition to the platform one, authored here in every supported language.
 *
 * Admin-only throughout. An identity-manager runs the register; deciding what
 * a participant is asked to consent to is a different act, and it follows the
 * ethics approval rather than the roster.
 */
export function createConsentDocumentsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /admin/consent-documents:
   *   get:
   *     summary: List study consent documents and their per-language state
   *     description: >
   *       Covers every slug the deployment knows about — shipped as a file,
   *       stored in the database, or referenced by a study. A slug referenced
   *       by a study but written nowhere is the case this list exists to make
   *       visible.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Documents with per-language status and readiness
   *       403:
   *         description: Caller does not have admin role
   */
  router.get(
    '/consent-documents',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const database = await getDb();
        const slugs = await listConsentDocumentSlugs({ db: database });

        const documents = [];
        for (const slug of slugs) {
          const readiness = await checkConsentDocumentReadiness({
            db: database,
            slug,
          });
          documents.push({
            slug,
            ready: readiness.ready,
            reasons: readiness.reasons,
            languages: readiness.languages,
            studies: await studiesUsingSlug({ db: database, slug }),
          });
        }

        res.json({ languages: SUPPORTED_LANGS, documents });
      } catch (err) {
        log.error({ err }, 'failed to list consent documents');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/consent-documents/{slug}:
   *   get:
   *     summary: Per-language state of one study consent document
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Language rows plus readiness
   *       400:
   *         description: Invalid slug
   */
  router.get(
    '/consent-documents/:slug',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      const { slug } = req.params;
      if (!isValidSlug(slug)) {
        return res.status(400).json({ error: 'invalid_slug' });
      }
      try {
        const database = await getDb();
        const readiness = await checkConsentDocumentReadiness({
          db: database,
          slug,
        });
        res.json({
          slug,
          ready: readiness.ready,
          reasons: readiness.reasons,
          languages: await describeConsentDocument({ db: database, slug }),
          studies: await studiesUsingSlug({ db: database, slug }),
        });
      } catch (err) {
        log.error({ err, slug }, 'failed to read consent document');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/consent-documents/{slug}/{lang}:
   *   get:
   *     summary: Load one language of a study consent document for editing
   *     description: >
   *       Returns the live text and, separately, the text shipped with the
   *       image — so the editor can offer "restore the shipped wording" and an
   *       admin can see what a database override is overriding.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: lang
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Editable document
   *       400:
   *         description: Invalid slug or language
   */
  router.get(
    '/consent-documents/:slug/:lang',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      const { slug, lang } = req.params;
      if (!isValidSlug(slug) || !SUPPORTED_LANGS.includes(lang)) {
        return res.status(400).json({ error: 'invalid_slug_or_language' });
      }
      try {
        const database = await getDb();
        res.json(await getConsentDocumentForEdit({ db: database, slug, lang }));
      } catch (err) {
        log.error({ err, slug, lang }, 'failed to load consent document');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/consent-documents/{slug}/{lang}:
   *   put:
   *     summary: Create or replace one language of a study consent document
   *     description: >
   *       Writes a database override, which takes precedence over the file
   *       shipped with the image. Publishing a text that still contains ⟦…⟧
   *       placeholders is refused; saving it as a draft is not.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: lang
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Saved
   *       400:
   *         description: Validation failed
   */
  router.put(
    '/consent-documents/:slug/:lang',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      const { slug, lang } = req.params;
      if (!isValidSlug(slug) || !SUPPORTED_LANGS.includes(lang)) {
        return res.status(400).json({ error: 'invalid_slug_or_language' });
      }

      const { body, version, effectiveDate, bindingLanguage, status } =
        req.body ?? {};
      const problems = validateConsentDocumentInput({
        body,
        version,
        effectiveDate,
        status,
      });
      if (problems.length) {
        return res.status(400).json({ error: 'invalid_document', problems });
      }

      try {
        const database = await getDb();
        const saved = await saveConsentDocument({
          db: database,
          slug,
          lang,
          body,
          version,
          effectiveDate,
          bindingLanguage,
          status,
          updatedBy: req.user?.sub ?? null,
        });
        const readiness = await checkConsentDocumentReadiness({
          db: database,
          slug,
        });
        res.json({
          ...saved,
          ready: readiness.ready,
          reasons: readiness.reasons,
        });
      } catch (err) {
        log.error({ err, slug, lang }, 'failed to save consent document');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * @swagger
   * /admin/consent-documents/{slug}/{lang}:
   *   delete:
   *     summary: Drop the database override for one language
   *     description: >
   *       The file shipped with the image, if any, becomes live again — this is
   *       a revert, not a deletion of the document.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: lang
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Override removed (or there was none)
   *       400:
   *         description: Invalid slug or language
   */
  router.delete(
    '/consent-documents/:slug/:lang',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      const { slug, lang } = req.params;
      if (!isValidSlug(slug) || !SUPPORTED_LANGS.includes(lang)) {
        return res.status(400).json({ error: 'invalid_slug_or_language' });
      }
      try {
        const database = await getDb();
        const removed = await deleteConsentDocumentOverride({
          db: database,
          slug,
          lang,
        });
        res.json({
          removed,
          document: await getConsentDocumentForEdit({
            db: database,
            slug,
            lang,
          }),
        });
      } catch (err) {
        log.error({ err, slug, lang }, 'failed to revert consent document');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

export default createConsentDocumentsRouter;

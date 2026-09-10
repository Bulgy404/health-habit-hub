import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { logger } from '../utils/logger.js';
import { resolveConsentDocument } from '../services/consentDocumentService.js';
import { connect } from '../models/survey.js';

const log = logger.child({ module: 'consentController' });

/**
 * Render the study information & informed-consent document (HabConnect IC).
 * Public endpoint — participants must be able to read it BEFORE creating an
 * account. The `document` field carries version metadata so clients can
 * record exactly which consent version a participant accepted.
 */
export async function renderConsent(req, res, next) {
  try {
    // ?slug=<name> selects an ADDITIONAL consent document — a study-specific
    // one that a participant accepts alongside the platform document, not
    // instead of it. Absent means the platform document, exactly as before.
    //
    // The slug is pattern-checked rather than passed through: it becomes part
    // of a filename, and `../` in a query parameter must never be able to read
    // an arbitrary file off disk.
    const slug = req.query?.slug;

    if (slug != null) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(slug))) {
        return res.status(400).json({ error: 'invalid_slug' });
      }

      // Study consent documents resolve database-first, file-second: the
      // shipped markdown is the seed, and an edit made in the admin portal
      // must take effect without a redeploy. A database that is unreachable
      // must not take the shipped document down with it, so a connection
      // failure degrades to the file rather than failing the request.
      let db = null;
      try {
        db = await connect();
      } catch (err) {
        log.warn(
          { err, slug },
          'consent document: database unavailable, falling back to the shipped file'
        );
      }

      const doc = await resolveConsentDocument({
        db,
        lang: req.lang,
        slug: String(slug),
      });
      if (!doc) {
        log.warn(
          { lang: req.lang, slug },
          'consent document not found for slug'
        );
        return res.status(404).json({ error: 'consent_document_not_found' });
      }

      return res.json({
        status: 'ok',
        lang: req.lang,
        messages: getLanguageMessages(req.lang),
        content: doc.html,
        document: doc.meta,
        documentSlug: String(slug),
      });
    }

    const { html, meta } = await loadMarkdown(req.lang, 'consent');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
      document: meta,
      documentSlug: null,
    });
  } catch (err) {
    // A study configured with a slug whose document has not been written yet
    // is an operator error, not a server fault — say so clearly rather than
    // returning a 500 that looks like an outage.
    if (err?.code === 'ENOENT') {
      log.warn(
        { lang: req.lang, slug: req.query?.slug },
        'consent document not found'
      );
      return res.status(404).json({ error: 'consent_document_not_found' });
    }
    log.error({ err: err }, 'Error rendering consent document:');
    next(err);
  }
}

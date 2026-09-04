import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { logger } from '../utils/logger.js';

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
    let name = 'consent';
    if (slug != null) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(slug))) {
        return res.status(400).json({ error: 'invalid_slug' });
      }
      name = `consent-${slug}`;
    }

    const { html, meta } = await loadMarkdown(req.lang, name);
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
      document: meta,
      documentSlug: slug ?? null,
    });
  } catch (err) {
    // A study configured with a slug whose document has not been written yet
    // is an operator error, not a server fault — say so clearly rather than
    // returning a 500 that looks like an outage.
    if (err?.code === 'ENOENT') {
      log.warn(
        { lang: req.lang, slug: req.query?.slug },
        'consent document not found for slug'
      );
      return res.status(404).json({ error: 'consent_document_not_found' });
    }
    log.error({ err: err }, 'Error rendering consent document:');
    next(err);
  }
}

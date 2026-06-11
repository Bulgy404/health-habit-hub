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
    const { html, meta } = await loadMarkdown(req.lang, 'consent');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
      document: meta,
    });
  } catch (err) {
    log.error({ err: err }, 'Error rendering consent document:');
    next(err);
  }
}

import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'privacyController' });

export async function renderPrivacyPolicy(req, res, next) {
  try {
    const { html, meta } = await loadMarkdown(req.lang, 'privacy');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
      document: meta,
    });
  } catch (err) {
    log.error({ err: err }, 'Error rendering privacy policy:');
    next(err);
  }
}

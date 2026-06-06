import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'imprintController' });

export async function renderImprint(req, res, next) {
  try {
    const html = await loadMarkdown(req.lang, 'imprint');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
    });
  } catch (err) {
    log.error({ err: err }, 'Error rendering imprint:');
    next(err);
  }
}

import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { renderLegalPage } from '../utils/legalPage.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'imprintController' });

export async function renderImprint(req, res, next) {
  try {
    const { html, meta } = await loadMarkdown(req.lang, 'imprint');
    const messages = getLanguageMessages(req.lang);
    if (req.accepts(['json', 'html']) === 'html') {
      return res.type('html').send(
        renderLegalPage({
          title: messages?.imprint?.title || 'Imprint',
          lang: req.lang,
          pageName: 'imprint',
          contentHtml: html,
          meta,
          nonce: res.locals.cspNonce,
        })
      );
    }
    res.json({
      status: 'ok',
      lang: req.lang,
      messages,
      content: html,
      document: meta,
    });
  } catch (err) {
    log.error({ err: err }, 'Error rendering imprint:');
    next(err);
  }
}

import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { renderLegalPage } from '../utils/legalPage.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'accessibilityController' });

export async function renderAccessibility(req, res, next) {
  try {
    const { html, meta } = await loadMarkdown(req.lang, 'accessibility');
    const messages = getLanguageMessages(req.lang);
    if (req.accepts(['json', 'html']) === 'html') {
      return res.type('html').send(
        renderLegalPage({
          title: messages?.accessibility?.title || 'Accessibility Statement',
          lang: req.lang,
          pageName: 'accessibility',
          contentHtml: html,
          meta,
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
    log.error({ err: err }, 'Error rendering accessibility page:');
    next(err);
  }
}

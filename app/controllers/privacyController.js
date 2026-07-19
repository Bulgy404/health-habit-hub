import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';
import { renderLegalPage } from '../utils/legalPage.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'privacyController' });

export async function renderPrivacyPolicy(req, res, next) {
  try {
    const { html, meta } = await loadMarkdown(req.lang, 'privacy');
    const messages = getLanguageMessages(req.lang);
    // Browsers get a styled page; the mobile app (Accept: application/json or
    // */*) keeps the JSON contract. `['json','html']` order makes JSON the
    // default for wildcard/unspecified Accept, so only real browsers get HTML.
    if (req.accepts(['json', 'html']) === 'html') {
      return res.type('html').send(
        renderLegalPage({
          title: messages?.privacy?.title || 'Privacy Policy',
          lang: req.lang,
          pageName: 'privacy',
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
    log.error({ err: err }, 'Error rendering privacy policy:');
    next(err);
  }
}

import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';

export async function renderPrivacyPolicy(req, res, next) {
  try {
    const html = await loadMarkdown(req.lang, 'privacy');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
    });
  } catch (err) {
    console.error('Error rendering privacy policy:', err);
    next(err);
  }
}

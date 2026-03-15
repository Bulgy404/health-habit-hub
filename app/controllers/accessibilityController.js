import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';

export async function renderAccessibility(req, res, next) {
  try {
    const html = await loadMarkdown(req.lang, 'accessibility');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html,
    });
  } catch (err) {
    console.error('Error rendering accessibility page:', err);
    next(err);
  }
}

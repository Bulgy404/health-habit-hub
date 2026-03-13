import { loadMarkdown } from '../utils/markdown.js';
import { getLanguageMessages } from '../utils/localization.js';

export async function renderImprint(req, res, next) {
  try {
    const html = await loadMarkdown(req.lang, 'imprint');
    res.json({
      status: 'ok',
      lang: req.lang,
      messages: getLanguageMessages(req.lang),
      content: html
    });
  } catch (err) {
    console.error('Error rendering imprint:', err);
    next(err);
  }
}

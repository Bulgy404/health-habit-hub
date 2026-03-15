import { getLanguageMessages } from '../utils/localization.js';

export function renderThanksPage(req, res) {
  const messages = { ...getLanguageMessages(req.lang) };

  res.json({
    status: 'ok',
    lang: req.lang,
    messages,
  });
}

import { getLanguageMessages } from '../utils/localization.js';

export function renderLocalizedView(req, res, pageName, extraData = {}) {
  const messages = getLanguageMessages(req.lang);

  res.json({
    status: 'ok',
    lang: req.lang,
    page: pageName,
    messages,
    ...extraData
  });
}

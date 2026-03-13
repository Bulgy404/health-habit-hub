import { getLanguageMessages } from '../utils/localization.js';
import contexts from '../models/contexts.js';

export function renderAboutPage(req, res) {
  res.json({
    status: 'ok',
    lang: req.lang,
    messages: getLanguageMessages(req.lang),
    contexts
  });
}

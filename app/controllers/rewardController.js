import { getLanguageMessages } from '../utils/localization.js';

export function renderRewardPage(req, res) {
  res.json({
    status: 'ok',
    lang: req.lang,
    messages: getLanguageMessages(req.lang)
  });
}

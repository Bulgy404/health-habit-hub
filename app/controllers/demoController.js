import { logger } from '../utils/logger.js';
import { getLanguageMessages } from '../utils/localization.js';

const log = logger.child({ module: 'demoController' });

export function renderDemoPage(req, res) {
  res.json({
    status: 'ok',
    lang: req.lang,
    messages: getLanguageMessages(req.lang),
  });
}

export function saveDemoData(req, res) {
  console.log('Received demographics data:', req.body);
  res.cookie('demographicsCompleted', 'true');
  res.json({ status: 'ok', message: 'Demographics data saved.' });
}

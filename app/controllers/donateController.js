import contexts from '../models/contexts.js';
import { ExperimentGroup } from '../models/experimentGroup.js';
import { getLanguageMessages } from '../utils/localization.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'donateController' });

function getExperimentGroupFromQuery(req) {
  if (req.query.group) {
    try {
      return ExperimentGroup.fromString(req.query.group);
    } catch {
      log.error(
        `Ignoring invalid experiment group parameter "${req.query.group}".`
      );
      return null;
    }
  }
}

function getExperimentGroupFromCookie(req) {
  log.debug(`Request cookie: experimentGroup=${req.cookies.experimentGroup}`);

  if (req.cookies.experimentGroup) {
    try {
      return ExperimentGroup.fromString(req.cookies.experimentGroup);
    } catch {
      log.error(
        `Invalid experiment group cookie parameter "${req.cookies.experimentGroup}".`
      );
      return null;
    }
  } else {
    return null;
  }
}

// If query parameter 'group' is set, use it to determine experiment group.
// Else, if experiment group cookie is set, use matching experiment group.
// Else, select random experiment group and remember choice in session cookie.
function getExperimentGroup(req, res) {
  const experimentGroupFromQuery = getExperimentGroupFromQuery(req);
  if (experimentGroupFromQuery) {
    log.debug(`Using experiment group from query: ${experimentGroupFromQuery}`);
    return experimentGroupFromQuery;
  } else {
    const experimentGroupFromCookie = getExperimentGroupFromCookie(req);
    if (experimentGroupFromCookie) {
      log.debug(
        `Using experiment group from cookie: ${experimentGroupFromCookie}`
      );
      return experimentGroupFromCookie;
    } else {
      const randomExperimentGroup = ExperimentGroup.random();
      log.debug(
        `Using randomly selected experiment group: ${randomExperimentGroup}`
      );
      res.cookie('experimentGroup', randomExperimentGroup.toString());
      return randomExperimentGroup;
    }
  }
}

export function showDonateForm(req, res) {
  const experimentGroup = getExperimentGroup(req, res);
  res.json({
    status: 'ok',
    lang: req.lang,
    experimentGroup: experimentGroup,
    contexts: contexts,
    messages: getLanguageMessages(req.lang),
  });
}

export async function saveDonateData(req, res) {
  const userId = req.userId;
  console.log('[donateController] Received donate data:', {
    userId,
    body: req.body,
  });
  const { Neo4jSparqlDbClient } = await import('../utils/Neo4jDatabase.js');
  const dbClient = new Neo4jSparqlDbClient(config);
  const data = {
    ...req.body,
    habitStrength: req.body.habitStrength,
    experimentGroup: ExperimentGroup.fromObject(req.body.experimentGroup),
  };
  log.debug('Hier die Daten des Habits die an die DB weitergeleitet werden:');
  console.log(data);

  try {
    await dbClient.insertDonateData(data, userId);
    const redirectLang = req.body.language || req.lang || 'en';
    const basepath = req.app.get('basepath') || '/';
    const normalizedBasepath = basepath.endsWith('/')
      ? basepath
      : `${basepath}/`;

    console.log('Cookies empfangen:', req.cookies);
    log.debug(
      `Prüfe Cookie 'demographicsCompleted': Wert ist "${req.cookies.demographicsCompleted}"`
    );

    if (req.cookies.demographicsCompleted === 'true') {
      log.debug(
        'Entscheidung: Cookie ist gesetzt. Leite weiter zur Dankesseite.'
      );
      res.redirect(`${normalizedBasepath}${redirectLang}/thanks`);
    } else {
      log.debug(
        'Entscheidung: Cookie ist NICHT gesetzt oder falsch. Leite weiter zur Umfrage.'
      );
      res.redirect(`${normalizedBasepath}${redirectLang}/survey/1`);
    }
  } catch (error) {
    console.log('[donateController] Save failure context:', { data, userId });
    log.error({ err: error }, '[donateController] error');
    res.status(500).json({ error: 'Fehler beim Speichern der Daten.' });
  }
}

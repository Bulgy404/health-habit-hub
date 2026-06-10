import { logger } from '../utils/logger.js';
import { connect } from '../models/survey.js';

async function getSurveyDb(req) {
  const injectedDb = req.app?.get?.('db') || req.app?.locals?.db;
  return injectedDb || connect();
}

const log = logger.child({ module: 'surveyController' });

export async function renderSurvey(req, res) {
  try {
    const db = await getSurveyDb(req);
    const surveyId = req.params.id;
    log.debug(
      `Attempting to find survey with id: "${surveyId}" (Type: ${typeof surveyId})`
    );

    const survey = await db.collection('surveys').findOne({ id: surveyId });
    if (!survey) {
      log.error(`Survey with id "${surveyId}" not found in MongoDB.`);
      return res.status(404).json({ error: 'Survey not found' });
    }

    const { _id, ...surveyData } = survey;
    res.json({
      status: 'ok',
      survey: surveyData,
      locale: req.lang,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function submitSurvey(req, res) {
  try {
    const db = await getSurveyDb(req);
    const submission = {
      surveyId: req.params.id,
      data: req.body,
      submittedAt: new Date(),
      userId: req.userId,
    };
    await db.collection('results').insertOne(submission);
    console.log(
      '[survey] Recorded submission for surveyId:',
      submission.surveyId,
      'userId:',
      submission.userId
    );
    res.cookie('demographicsCompleted', 'true', {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    const basepath = req.app.get('basepath') || '/';
    const normalizedBasepath = basepath.endsWith('/')
      ? basepath
      : `${basepath}/`;
    res.redirect(`${normalizedBasepath}${req.lang}/thanks`);
  } catch (err) {
    log.error({ err: err }, 'unhandled route error');
    res.status(500).json({ error: 'Server error' });
  }
}

import { connect } from '../models/survey.js';

export async function renderSurvey(req, res) {
  try {
    const db = await connect();
    const surveyId = req.params.id;
    console.log(
      `Attempting to find survey with id: "${surveyId}" (Type: ${typeof surveyId})`
    );

    const survey = await db.collection('surveys').findOne({ id: surveyId });
    if (!survey) {
      console.error(`Survey with id "${surveyId}" not found in MongoDB.`);
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json({
      status: 'ok',
      survey,
      locale: req.lang,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function submitSurvey(req, res) {
  try {
    const db = await connect();
    const submission = {
      surveyId: req.params.id,
      data: req.body,
      submittedAt: new Date(),
      userId: req.userId,
    };
    await db.collection('results').insertOne(submission);
    console.log('Survey submission with user ID:', submission);
    res.cookie('demographicsCompleted', 'true', {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      path: '/',
    });
    const basepath = req.app.get('basepath') || '/';
    const normalizedBasepath = basepath.endsWith('/')
      ? basepath
      : `${basepath}/`;
    res.redirect(`${normalizedBasepath}${req.lang}/thanks`);
  } catch (err) {
    console.error('[route] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

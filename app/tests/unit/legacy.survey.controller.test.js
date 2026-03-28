// Unit tests for legacy surveyController.js (renderSurvey / submitSurvey)
// These test the error paths since MongoDB is not available in unit test environment.

// Reduce MongoDB connection timeout so tests run fast
process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = '200';
process.env.MONGO_SOCKET_TIMEOUT_MS = '200';

import { test } from 'node:test';
import assert from 'node:assert';
import {
  renderSurvey,
  submitSurvey,
} from '../../controllers/surveyController.js';

function makeReq(params = {}, body = {}, cookies = {}, db = null) {
  return {
    params,
    body,
    cookies,
    lang: 'en',
    app: {
      get: (key) => {
        if (key === 'db') return db;
        return '/';
      },
    },
    userId: 'test-user',
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    redirectUrl: null,
    cookieSet: {},
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.redirect = (url) => {
    res.redirectUrl = url;
    return res;
  };
  res.cookie = (name, value, opts) => {
    res.cookieSet[name] = { value, opts };
    return res;
  };
  return res;
}

test('renderSurvey returns 500 when database is unavailable', async () => {
  const req = makeReq(
    { id: 'survey-xyz' },
    {},
    {},
    {
      collection() {
        throw new Error('database unavailable');
      },
    }
  );
  const res = makeRes();

  await renderSurvey(req, res);

  // With no real MongoDB, connect() throws and the catch block runs
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.body && typeof res.body === 'object', 'body should be object');
});

test('submitSurvey returns 500 when database is unavailable', async () => {
  const req = makeReq(
    { id: 'survey-xyz' },
    { answer: 'yes' },
    {},
    {
      collection() {
        throw new Error('database unavailable');
      },
    }
  );
  const res = makeRes();

  await submitSurvey(req, res);

  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.body && typeof res.body === 'object', 'body should be object');
});

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createHabitDonationsRouter } from '../../routes/admin/habitDonationsRouter.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/roles.js';

// ── Minimal in-memory Mongo-like store ────────────────────────────────────────

function makeDb() {
  const donations = [];
  const formResponses = [];

  function collectionFor(name) {
    if (name === 'habit_donations') return donations;
    if (name === 'form_responses') return formResponses;
    throw new Error(`Unexpected collection: ${name}`);
  }

  return {
    donations,
    formResponses,
    collection(name) {
      const store = collectionFor(name);
      return {
        async findOne(query) {
          return (
            store.find((d) => {
              if (query.uuid !== undefined && d.uuid !== query.uuid)
                return false;
              if (
                query._id !== undefined &&
                d._id?.toString() !== query._id?.toString()
              )
                return false;
              return true;
            }) ?? null
          );
        },
      };
    },
  };
}

// ── Test server: real requireRole gate, req.user injected via a test header
// (mirrors how apiRouter.js's `authenticate` middleware would have already
// populated req.user by the time requireRole runs — no JWT machinery needed
// here since that flow is covered elsewhere, e.g. admin.participants.test.js) ──

let app, server, baseUrl, db, audioDir;

before(async () => {
  db = makeDb();
  audioDir = mkdtempSync(join(tmpdir(), 'hhh-audio-test-'));

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const roles = (req.get('x-test-roles') || '')
      .split(',')
      .filter(Boolean);
    req.user = { sub: 'test-admin', realm_access: { roles } };
    next();
  });
  app.use(
    '/api/v1/admin',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createHabitDonationsRouter({ db, audioStorageDir: audioDir })
  );
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  rmSync(audioDir, { recursive: true, force: true });
});

const ADMIN_HEADERS = { 'x-test-roles': 'admin' };
const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

test('GET /:uuid — 403 for a caller without admin/researcher role', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/${VALID_UUID}`,
    { headers: { 'x-test-roles': 'user' } }
  );
  assert.strictEqual(res.status, 403);
});

test('GET /:uuid — 404 for an unknown uuid', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/${VALID_UUID}`,
    { headers: ADMIN_HEADERS }
  );
  assert.strictEqual(res.status, 404);
});

test('GET /:uuid — returns the donation, linked questionnaire response, and no selfReport when not an accepted habit', async () => {
  const responseId = new ObjectId();
  db.formResponses.push({
    _id: responseId,
    userId: 'user-1',
    questionnaireSlug: 'post-donation',
    answers: { q1: 'yes' },
    submittedAt: new Date(),
    habitUuid: VALID_UUID,
  });
  db.donations.push({
    uuid: VALID_UUID,
    userId: 'user-1',
    studyId: null,
    groupId: null,
    inputMode: 'voice',
    isHabit: null,
    audioClip: null,
    transcript: 'I walk every morning',
    transcriptEdited: false,
    questionnaireSlug: 'post-donation',
    questionnaireResponseId: responseId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/${VALID_UUID}`,
    { headers: ADMIN_HEADERS }
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.transcript, 'I walk every morning');
  assert.strictEqual(body.questionnaireResponse.answers.q1, 'yes');
  assert.strictEqual(body.selfReport, null);
});

test('GET /:uuid/audio — refuses a malformed uuid before touching the filesystem', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/not-a-uuid/audio`,
    { headers: ADMIN_HEADERS }
  );
  assert.strictEqual(res.status, 400);
});

test('GET /:uuid/audio — 404 when the donation has no audio clip', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/${VALID_UUID}/audio`,
    { headers: ADMIN_HEADERS }
  );
  assert.strictEqual(res.status, 404);
});

test('GET /:uuid/audio — streams the file inline by default, attachment with ?download=1', async () => {
  const audioUuid = 'aaaaaaaa-1111-4562-b3fc-2c963f66afa6';
  writeFileSync(join(audioDir, `${audioUuid}.wav`), Buffer.from('fake-audio'));
  db.donations.push({
    uuid: audioUuid,
    userId: 'user-1',
    audioClip: {
      filename: `${audioUuid}.wav`,
      mimeType: 'audio/wav',
      sizeBytes: 10,
      durationSec: null,
      storedAt: new Date(),
    },
  });

  const inline = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/${audioUuid}/audio`,
    { headers: ADMIN_HEADERS }
  );
  assert.strictEqual(inline.status, 200);
  assert.strictEqual(inline.headers.get('content-type'), 'audio/wav');
  assert.strictEqual(inline.headers.get('content-disposition'), 'inline');
  assert.strictEqual(await inline.text(), 'fake-audio');

  const download = await fetch(
    `${baseUrl}/api/v1/admin/habit-donations/${audioUuid}/audio?download=1`,
    { headers: ADMIN_HEADERS }
  );
  assert.match(
    download.headers.get('content-disposition'),
    /^attachment; filename="/
  );
});

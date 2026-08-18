import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'voice-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

function base64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJwt(payload) {
  const header = { alg: 'RS256', kid: 'voice-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub = 'user-1', roles = ['user']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── In-memory mock DB (habit_donations only — that's all this router touches) ──

function createMockDb() {
  const habitDonations = [];
  return {
    collection(name) {
      if (name !== 'habit_donations') {
        throw new Error(`unexpected collection: ${name}`);
      }
      return {
        async insertOne(doc) {
          habitDonations.push({ ...doc });
          return { insertedId: 'mock-id' };
        },
        async findOne(query) {
          return (
            habitDonations.find((d) =>
              Object.entries(query).every(([k, v]) => d[k] === v)
            ) ?? null
          );
        },
        async updateOne(query, update) {
          const doc = habitDonations.find((d) =>
            Object.entries(query).every(([k, v]) => d[k] === v)
          );
          if (!doc) return { matchedCount: 0 };
          if (update.$set) Object.assign(doc, update.$set);
          return { matchedCount: 1 };
        },
      };
    },
    _seed(doc) {
      habitDonations.push({ ...doc });
    },
    _all() {
      return habitDonations;
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;
let mockDb;
let audioDir;

before(async () => {
  audioDir = await mkdtemp(path.join(tmpdir(), 'hhh-audio-test-'));
  mockDb = createMockDb();

  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/jwks')) {
      return { ok: true, json: async () => mockJwks };
    }
    return realFetch(url, options);
  };

  const testApp = express();
  testApp.use(express.json());
  const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
  const apiRouter = createApiRouter({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: mockDb,
    neo4jRun: async () => [],
    audioStorageDir: audioDir,
  });
  testApp.use('/api/v1', apiRouter);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${baseUrl}/api/v1/health`);
});

after(async () => {
  server.closeAllConnections();
  server.close();
  await rm(audioDir, { recursive: true, force: true });
});

function multipartAudioRequest(bytes, filename = 'recording.m4a') {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'audio/m4a' }), filename);
  return form;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST /habits/donations/:uuid/audio — rejects unauthenticated requests', async () => {
  const uuid = randomUUID();
  const res = await fetch(`${baseUrl}/api/v1/habits/donations/${uuid}/audio`, {
    method: 'POST',
    body: multipartAudioRequest(Buffer.from('fake-audio-bytes')),
  });
  assert.strictEqual(res.status, 401);
});

test('POST /habits/donations/:uuid/audio — rejects a malformed uuid', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/habits/donations/not-a-uuid/audio`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${makeToken('user-voice-1')}` },
      body: multipartAudioRequest(Buffer.from('fake-audio-bytes')),
    }
  );
  assert.strictEqual(res.status, 400);
});

test('POST /habits/donations/:uuid/audio — 404 when no matching habit_donations record exists', async () => {
  const uuid = randomUUID();
  const res = await fetch(`${baseUrl}/api/v1/habits/donations/${uuid}/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken('user-voice-2')}` },
    body: multipartAudioRequest(Buffer.from('fake-audio-bytes')),
  });
  assert.strictEqual(res.status, 404);
});

test('POST /habits/donations/:uuid/audio — stores exactly the uploaded bytes, not the raw multipart envelope', async () => {
  const uuid = randomUUID();
  mockDb._seed({ uuid, userId: 'user-voice-3', audioClip: null });

  const audioBytes = Buffer.from('this-is-definitely-not-a-real-m4a-file');
  const res = await fetch(`${baseUrl}/api/v1/habits/donations/${uuid}/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken('user-voice-3')}` },
    body: multipartAudioRequest(audioBytes),
  });
  assert.strictEqual(res.status, 201);

  const donation = mockDb
    ._all()
    .find((d) => d.uuid === uuid && d.userId === 'user-voice-3');
  assert.ok(donation.audioClip, 'audioClip should be set');
  assert.strictEqual(donation.audioClip.filename, `${uuid}.m4a`);
  assert.strictEqual(donation.audioClip.sizeBytes, audioBytes.length);

  // The critical regression check: the file on disk must be the raw audio
  // bytes exactly as uploaded — not the multipart envelope (boundaries +
  // part headers) wrapped around them.
  const stored = await readFile(path.join(audioDir, `${uuid}.m4a`));
  assert.ok(
    stored.equals(audioBytes),
    `stored file must equal the uploaded bytes exactly (got ${stored.length} bytes, expected ${audioBytes.length})`
  );
});

test('POST /habits/donations/:uuid/audio — 409 when audio is already attached', async () => {
  const uuid = randomUUID();
  mockDb._seed({
    uuid,
    userId: 'user-voice-4',
    audioClip: { filename: `${uuid}.m4a` },
  });

  const res = await fetch(`${baseUrl}/api/v1/habits/donations/${uuid}/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken('user-voice-4')}` },
    body: multipartAudioRequest(Buffer.from('more-fake-audio')),
  });
  assert.strictEqual(res.status, 409);
});

test('POST /habits/donations/:uuid/audio — 400 on an empty file part', async () => {
  const uuid = randomUUID();
  mockDb._seed({ uuid, userId: 'user-voice-5', audioClip: null });

  const res = await fetch(`${baseUrl}/api/v1/habits/donations/${uuid}/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken('user-voice-5')}` },
    body: multipartAudioRequest(Buffer.alloc(0)),
  });
  assert.strictEqual(res.status, 400);
});

test("POST /habits/donations/:uuid/audio — another user cannot attach audio to someone else's donation", async () => {
  const uuid = randomUUID();
  mockDb._seed({ uuid, userId: 'user-voice-owner', audioClip: null });

  const res = await fetch(`${baseUrl}/api/v1/habits/donations/${uuid}/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken('user-voice-attacker')}` },
    body: multipartAudioRequest(Buffer.from('fake-audio-bytes')),
  });
  assert.strictEqual(res.status, 404);
});

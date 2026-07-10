// UC-10 — Retrieve resolved habit config (GET /api/v1/me/habit-config)
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'hc-key-1';
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
  const header = { alg: 'RS256', kid: 'hc-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles = ['user'], sub = 'hc-user') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── In-memory mock DB ─────────────────────────────────────────────────────────

const cueId = new ObjectId();

function createMockDb({ enrollment } = {}) {
  return {
    collection(name) {
      if (name === 'studies') {
        return {
          findOne: async (q) => {
            if (enrollment && String(q._id) === enrollment.studyId.toString()) {
              return {
                _id: enrollment.studyId,
                recommenderEnabled: true,
                groups: [
                  {
                    id: enrollment.groupId,
                    label: 'Test Group',
                    index: 1,
                    cueConfig: enrollment.cueConfig ?? null,
                  },
                ],
              };
            }
            return null;
          },
        };
      }
      if (name === 'admin_settings') {
        return {
          find: () => ({
            toArray: async () => [
              { key: 'default_cue_count', value: 'single' },
              { key: 'default_cue_source', value: 'high_quality' },
            ],
          }),
        };
      }
      if (name === 'cue_pools') {
        return {
          aggregate: (pipeline) => ({
            toArray: async () => {
              const sampleStage = pipeline.find((s) => s.$sample);
              const n = sampleStage?.$sample?.size ?? 1;
              return Array.from({ length: n }, (_, i) => ({
                _id: i === 0 ? cueId : new ObjectId(),
                text: { en: `After dinner cue ${i + 1}` },
                languages: ['en'],
                quality: 'high',
              }));
            },
          }),
        };
      }
      return {
        findOne: async () => null,
        find: () => ({
          toArray: async () => [],
          sort: () => ({ toArray: async () => [] }),
        }),
        aggregate: () => ({ toArray: async () => [] }),
        insertOne: async () => ({}),
        updateOne: async () => ({ matchedCount: 0 }),
        countDocuments: async () => 0,
      };
    },
  };
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

const enrolledUser = 'hc-user';
const enrollmentFixture = {
  _id: new ObjectId(),
  userId: enrolledUser,
  studyId: new ObjectId(),
  groupId: new ObjectId(),
  cueConfig: {
    cueCount: 'multi',
    cueSource: 'high_quality',
    cuePoolId: null,
    behaviorOptions: ['walking', 'meditation'],
    maxHabits: 2,
  },
};

before(async () => {
  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('/jwks')) {
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
    db: createMockDb({ enrollment: enrollmentFixture }),
    neo4jRun: async (cypher, params) => {
      if (cypher.includes('ENROLLED_IN') && params.userId === enrolledUser) {
        return [
          {
            studyId: enrollmentFixture.studyId.toString(),
            groupId: enrollmentFixture.groupId.toString(),
            enrolledAt: null,
            studyCodeUsed: null,
          },
        ];
      }
      return [];
    },
  });
  testApp.use('/api/v1', apiRouter);
  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => server.close());

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}${path}`, { headers });
}

const HC = '/api/v1/me/habit-config';

// ── Auth enforcement ──────────────────────────────────────────────────────────

test('GET /me/habit-config returns 401 without token', async () => {
  const res = await get(HC);
  assert.strictEqual(res.status, 401);
});

// ── Resolved config for enrolled participant ─────────────────────────────────

test('returns the enrollment cueConfig for an enrolled participant', async () => {
  const res = await get(HC, makeToken(['user'], enrolledUser));
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.strictEqual(body.cueCount, 'multi');
  assert.strictEqual(body.cueSource, 'high_quality');
  assert.deepStrictEqual(body.behaviorOptions, ['walking', 'meditation']);
  assert.strictEqual(body.maxHabits, 2);
});

test('includes pre-rated assigned cues drawn from the pool (multi = 2 cues)', async () => {
  const res = await get(HC, makeToken(['user'], enrolledUser));
  const body = await res.json();

  assert.strictEqual(body.assignedCues.length, 2);
  for (const cue of body.assignedCues) {
    assert.strictEqual(cue.source, 'pre_rated');
    assert.ok(cue.text.length > 0);
    assert.ok(cue.cueId);
  }
});

test('includes the 12 SRHI items', async () => {
  const res = await get(HC, makeToken(['user'], enrolledUser));
  const body = await res.json();
  assert.strictEqual(body.srhiItems.length, 12);
});

// ── Free-entry public config for non-enrolled users ───────────────────────────

test('returns the free-entry public config when the user has no enrollment', async () => {
  const res = await get(HC, makeToken(['user'], 'not-enrolled-user'));
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  assert.strictEqual(body.cueCount, 'multi');
  assert.strictEqual(body.cueSource, 'self_selected');
  // Empty behaviorOptions signals free habit entry (no catalog picker),
  // and self-selected cues mean nothing is pre-assigned.
  assert.deepStrictEqual(body.behaviorOptions, []);
  assert.deepStrictEqual(body.assignedCues, []);
  assert.strictEqual(body.maxHabits, null);
});

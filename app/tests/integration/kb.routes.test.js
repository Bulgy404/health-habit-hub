// UC-25 — Knowledge base proxy (GET/POST/DELETE /api/v1/kb, admin only)
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { createApiRouter } from '../../routes/apiRouter.js';

// ── Key material ──────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'kb-key-1';
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
  const header = { alg: 'RS256', kid: 'kb-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(roles, sub = 'kb-user') {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({ sub, exp: now + 3600, iat: now, realm_access: { roles } });
}

// ── Mock upstream API-service ─────────────────────────────────────────────────

const upstreamCalls = [];
let upstreamServer;
let apiServiceUrl;

function startUpstream() {
  upstreamServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      upstreamCalls.push({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'] ?? null,
        bodyLength: Buffer.concat(chunks).length,
      });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') {
        res.end(JSON.stringify({ documents: [{ filename: 'paper.pdf' }] }));
      } else if (req.method === 'POST' && req.url.endsWith('/reindex')) {
        res.end(JSON.stringify({ status: 'reindexing' }));
      } else if (req.method === 'POST') {
        res.statusCode = 201;
        res.end(JSON.stringify({ status: 'queued' }));
      } else if (req.method === 'DELETE') {
        res.end(JSON.stringify({ status: 'deleted' }));
      }
    });
  });
  return new Promise((resolve) =>
    upstreamServer.listen(0, '127.0.0.1', () => {
      apiServiceUrl = `http://127.0.0.1:${upstreamServer.address().port}`;
      resolve();
    })
  );
}

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

const stubDb = {
  collection: () => ({
    findOne: async () => null,
    find: () => ({
      toArray: async () => [],
      sort: () => ({ toArray: async () => [] }),
    }),
    insertOne: async () => ({}),
    updateOne: async () => ({ matchedCount: 0 }),
    countDocuments: async () => 0,
  }),
};

before(async () => {
  await startUpstream();

  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('/jwks')) {
      return { ok: true, json: async () => mockJwks };
    }
    return realFetch(url, options);
  };

  const testApp = express();
  const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
  const apiRouter = createApiRouter({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: stubDb,
    neo4jRun: async () => [],
    apiServiceUrl,
  });
  testApp.use('/api/v1', apiRouter);
  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${baseUrl}/api/v1/health`);
});

after(() => {
  // closeAllConnections destroys any lingering keep-alive sockets first —
  // without it, close()'s callback (and thus process exit / progression to
  // the next test file) waits forever for connections that fetch()'s
  // undici agent doesn't proactively close.
  server.closeAllConnections();
  server.close();
  upstreamServer.close();
});

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const KB = '/api/v1/kb';

// ── Auth & role enforcement ───────────────────────────────────────────────────

test('GET /kb returns 401 without token', async () => {
  const res = await fetch(`${baseUrl}${KB}`);
  assert.strictEqual(res.status, 401);
});

test('GET /kb returns 403 for the user role (admin only)', async () => {
  const res = await fetch(`${baseUrl}${KB}`, {
    headers: authHeaders(makeToken(['user'])),
  });
  assert.strictEqual(res.status, 403);
});

test('GET /kb returns 403 for the researcher role (admin only)', async () => {
  const res = await fetch(`${baseUrl}${KB}`, {
    headers: authHeaders(makeToken(['researcher'])),
  });
  assert.strictEqual(res.status, 403);
});

// ── Proxy behaviour ───────────────────────────────────────────────────────────

test('GET /kb proxies the document list from the API-service', async () => {
  const res = await fetch(`${baseUrl}${KB}`, {
    headers: authHeaders(makeToken(['admin'])),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body.documents, [{ filename: 'paper.pdf' }]);
});

test('POST /kb forwards a multipart upload body and content-type upstream', async () => {
  upstreamCalls.length = 0;
  const boundary = 'testboundary';
  const multipart =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="file"; filename="doc.pdf"\r\n' +
    'Content-Type: application/pdf\r\n\r\n' +
    'PDFDATA\r\n' +
    `--${boundary}--\r\n`;

  const res = await fetch(`${baseUrl}${KB}`, {
    method: 'POST',
    headers: {
      ...authHeaders(makeToken(['admin'])),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: multipart,
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.status, 'queued');

  const upstream = upstreamCalls.find((c) => c.method === 'POST');
  assert.ok(upstream.contentType.startsWith('multipart/form-data'));
  assert.ok(upstream.bodyLength > 0);
});

test('DELETE /kb/:filename URL-encodes the filename for the upstream call', async () => {
  upstreamCalls.length = 0;
  const res = await fetch(`${baseUrl}${KB}/my%20paper.pdf`, {
    method: 'DELETE',
    headers: authHeaders(makeToken(['admin'])),
  });
  assert.strictEqual(res.status, 200);
  const upstream = upstreamCalls.find((c) => c.method === 'DELETE');
  assert.ok(upstream.url.includes('my%20paper.pdf'));
});

test('POST /kb/reindex proxies to the API-service reindex endpoint', async () => {
  const res = await fetch(`${baseUrl}${KB}/reindex`, {
    method: 'POST',
    headers: authHeaders(makeToken(['admin'])),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'reindexing');
});

// ── Upstream unavailable ──────────────────────────────────────────────────────

test('returns 502 when the API-service is unreachable', async () => {
  const deadApp = express();
  const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
  const deadRouter = createApiRouter({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
    db: stubDb,
    neo4jRun: async () => [],
    apiServiceUrl: 'http://127.0.0.1:1', // nothing listens here
  });
  deadApp.use('/api/v1', deadRouter);
  const deadServer = createServer(deadApp);
  await new Promise((resolve) => deadServer.listen(0, '127.0.0.1', resolve));
  const deadBase = `http://127.0.0.1:${deadServer.address().port}`;

  try {
    const res = await fetch(`${deadBase}/api/v1/kb`, {
      headers: authHeaders(makeToken(['admin'])),
    });
    assert.strictEqual(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /unavailable/i);
  } finally {
    deadServer.close();
  }
});

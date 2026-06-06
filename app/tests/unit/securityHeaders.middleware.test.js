import { test } from 'node:test';
import assert from 'node:assert';
import { securityHeaders } from '../../middleware/securityHeaders.js';

function makeRes() {
  const headers = {};
  const locals = {};
  return {
    locals,
    setHeader(name, value) { headers[name] = value; },
    _headers: headers,
  };
}

function makeNext() {
  let called = false;
  return { fn: () => { called = true; }, wasCalled: () => called };
}

test('securityHeaders sets X-Content-Type-Options', () => {
  const res = makeRes();
  const next = makeNext();
  securityHeaders({}, res, next.fn);
  assert.strictEqual(res._headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(next.wasCalled());
});

test('securityHeaders sets X-Frame-Options to DENY', () => {
  const res = makeRes();
  securityHeaders({}, res, () => {});
  assert.strictEqual(res._headers['X-Frame-Options'], 'DENY');
});

test('securityHeaders sets Referrer-Policy', () => {
  const res = makeRes();
  securityHeaders({}, res, () => {});
  assert.strictEqual(res._headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
});

test('securityHeaders sets Content-Security-Policy', () => {
  const res = makeRes();
  securityHeaders({}, res, () => {});
  const csp = res._headers['Content-Security-Policy'];
  assert.ok(typeof csp === 'string', 'CSP header must be a string');
  assert.ok(csp.includes("default-src 'self'"), 'CSP must include default-src self');
  assert.ok(csp.includes('https://unpkg.com'), 'CSP must allow unpkg.com for SurveyJS');
  assert.ok(csp.includes("object-src 'none'"), 'CSP must block object-src');
  assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must block framing');
});

test('securityHeaders generates a unique nonce per request', () => {
  const res1 = makeRes();
  const res2 = makeRes();
  securityHeaders({}, res1, () => {});
  securityHeaders({}, res2, () => {});

  const nonce1 = res1.locals.cspNonce;
  const nonce2 = res2.locals.cspNonce;
  assert.ok(typeof nonce1 === 'string' && nonce1.length > 0, 'nonce must be a non-empty string');
  assert.notStrictEqual(nonce1, nonce2, 'each request must get a different nonce');
});

test('securityHeaders embeds nonce in CSP script-src and style-src', () => {
  const res = makeRes();
  securityHeaders({}, res, () => {});
  const nonce = res.locals.cspNonce;
  const csp = res._headers['Content-Security-Policy'];
  assert.ok(csp.includes(`'nonce-${nonce}'`), 'CSP must contain the per-request nonce');
  assert.ok(csp.includes('script-src'), 'CSP must have script-src directive');
  assert.ok(csp.includes('style-src'), 'CSP must have style-src directive');
});

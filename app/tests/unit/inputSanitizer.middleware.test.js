import { test } from 'node:test';
import assert from 'node:assert';
import { sanitizeBody } from '../../middleware/inputSanitizer.js';

function makeReq(method, body) {
  return { method, body };
}

function runMiddleware(req) {
  return new Promise((resolve) => sanitizeBody(req, {}, resolve));
}

test('sanitizeBody: strips HTML tags from string fields on POST', async () => {
  const req = makeReq('POST', {
    title: '<b>Hello</b>',
    count: 5,
  });
  await runMiddleware(req);
  assert.strictEqual(req.body.title, 'Hello');
  assert.strictEqual(req.body.count, 5);
});

test('sanitizeBody: strips HTML tags on PUT', async () => {
  const req = makeReq('PUT', { value: '<b>bold</b>' });
  await runMiddleware(req);
  assert.strictEqual(req.body.value, 'bold');
});

test('sanitizeBody: strips HTML tags on PATCH', async () => {
  const req = makeReq('PATCH', { group: '<em>G1</em>' });
  await runMiddleware(req);
  assert.strictEqual(req.body.group, 'G1');
});

test('sanitizeBody: does not modify GET requests', async () => {
  const req = makeReq('GET', { title: '<b>unchanged</b>' });
  await runMiddleware(req);
  assert.strictEqual(req.body.title, '<b>unchanged</b>');
});

test('sanitizeBody: handles nested objects', async () => {
  const req = makeReq('POST', {
    outer: { inner: '<img src=x onerror=alert(1)>text' },
  });
  await runMiddleware(req);
  assert.strictEqual(req.body.outer.inner, 'text');
});

test('sanitizeBody: handles arrays of strings', async () => {
  const req = makeReq('POST', { tags: ['<b>a</b>', '<i>b</i>'] });
  await runMiddleware(req);
  assert.deepStrictEqual(req.body.tags, ['a', 'b']);
});

test('sanitizeBody: preserves non-string values', async () => {
  const req = makeReq('POST', { num: 42, flag: true, empty: null });
  await runMiddleware(req);
  assert.strictEqual(req.body.num, 42);
  assert.strictEqual(req.body.flag, true);
  assert.strictEqual(req.body.empty, null);
});

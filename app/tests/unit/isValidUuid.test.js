import { test } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { isValidUuid } from '../../utils/constants.js';

test('isValidUuid: accepts a real randomUUID() value', () => {
  assert.equal(isValidUuid(randomUUID()), true);
});

test('isValidUuid: accepts an uppercase UUID', () => {
  assert.equal(isValidUuid('550E8400-E29B-41D4-A716-446655440000'), true);
});

test('isValidUuid: rejects a non-UUID string', () => {
  assert.equal(isValidUuid('not-a-uuid'), false);
});

test('isValidUuid: rejects a path-traversal attempt', () => {
  assert.equal(isValidUuid('../../etc/passwd'), false);
});

test('isValidUuid: rejects a Mongo operator object', () => {
  assert.equal(isValidUuid({ $ne: null }), false);
});

test('isValidUuid: rejects null/undefined/numbers', () => {
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
  assert.equal(isValidUuid(12345), false);
});

test('isValidUuid: rejects an empty string', () => {
  assert.equal(isValidUuid(''), false);
});

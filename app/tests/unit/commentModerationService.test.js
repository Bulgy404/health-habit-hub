import { test } from 'node:test';
import assert from 'node:assert';
import { moderateComment } from '../../services/commentModerationService.js';

test('moderateComment: flags profanity', () => {
  const result = moderateComment({ text: 'this is fucking terrible' });
  assert.strictEqual(result.flagged, true);
  assert.match(result.reason, /profanity/i);
});

test('moderateComment: flags leetspeak-obfuscated profanity', () => {
  const result = moderateComment({ text: 'what a sh1t habit' });
  assert.strictEqual(result.flagged, true);
});

test('moderateComment: does not flag a clean comment', () => {
  const result = moderateComment({ text: 'Nice job, I do this too!' });
  assert.deepStrictEqual(result, { flagged: false, reason: null });
});

test('moderateComment: flags a link', () => {
  const result = moderateComment({
    text: 'check this out https://example.com/spam',
  });
  assert.strictEqual(result.flagged, true);
  assert.match(result.reason, /link/i);
});

test('moderateComment: flags an email address', () => {
  const result = moderateComment({ text: 'contact me at foo@example.com' });
  assert.strictEqual(result.flagged, true);
  assert.match(result.reason, /email/i);
});

test('moderateComment: flags a phone number', () => {
  const result = moderateComment({ text: 'call me at 555-123-4567' });
  assert.strictEqual(result.flagged, true);
  assert.match(result.reason, /phone/i);
});

test('moderateComment: does not flag short numeric runs (dates, counts)', () => {
  const result = moderateComment({
    text: 'I did this 3 times on 2026-01-05',
  });
  assert.strictEqual(result.flagged, false);
});

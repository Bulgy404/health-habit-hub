import { test } from 'node:test';
import assert from 'node:assert';
import {
  recoveryPhraseFromCredentials,
  credentialsFromRecoveryPhrase,
} from '../../utils/recoveryPhrase.js';

test('credentialsFromRecoveryPhrase round-trips recoveryPhraseFromCredentials', () => {
  const username = '11111111-2222-3333-4444-555555555555';
  const password = 'aabbccddeeff00112233445566778899';
  const phrase = recoveryPhraseFromCredentials(username, password);

  const decoded = credentialsFromRecoveryPhrase(phrase);
  assert.deepStrictEqual(decoded, { username, password });
});

test('credentialsFromRecoveryPhrase accepts a pre-split word array', () => {
  const username = 'abcdefab-1234-5678-9abc-def012345678';
  const password = '00000000000000000000000000000000';
  const phrase = recoveryPhraseFromCredentials(username, password);

  const decoded = credentialsFromRecoveryPhrase(phrase.split(' '));
  assert.deepStrictEqual(decoded, { username, password });
});

test('credentialsFromRecoveryPhrase returns null for the wrong word count', () => {
  assert.strictEqual(credentialsFromRecoveryPhrase('one two three'), null);
  assert.strictEqual(credentialsFromRecoveryPhrase(''), null);
  assert.strictEqual(credentialsFromRecoveryPhrase(null), null);
});

test('credentialsFromRecoveryPhrase returns null for a word outside the wordlist', () => {
  const words = new Array(24).fill('abandon');
  words[5] = 'not-a-real-bip39-word';
  assert.strictEqual(credentialsFromRecoveryPhrase(words.join(' ')), null);
});

test('credentialsFromRecoveryPhrase is case-insensitive on input words', () => {
  const username = '11111111-2222-3333-4444-555555555555';
  const password = 'aabbccddeeff00112233445566778899';
  const phrase = recoveryPhraseFromCredentials(username, password);
  const upper = phrase.toUpperCase();

  assert.deepStrictEqual(credentialsFromRecoveryPhrase(upper), {
    username,
    password,
  });
});

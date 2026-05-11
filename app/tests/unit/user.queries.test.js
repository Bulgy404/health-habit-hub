import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeUserAndHabits,
  createSubmissionWithScores,
  setUserProfileProperties,
} from '../../db/userQueries.js';

test('mergeUserAndHabits calls queryNeo4j with userId param', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => {
    calls.push({ cypher, params });
    return [];
  };
  await mergeUserAndHabits(mockRun, 'user-abc');
  assert.ok(calls.length > 0);
  assert.ok(calls.every((c) => c.params.userId === 'user-abc'));
});

test('createSubmissionWithScores passes all scores to queryNeo4j', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => {
    calls.push({ cypher, params });
    return [];
  };
  const answers = { sliq_diet: '2', sliq_activity: '3' };
  await createSubmissionWithScores(mockRun, 'user-abc', 'sliq', answers);
  const scoreCall = calls.find((c) => c.params.scores !== undefined);
  assert.ok(scoreCall, 'expected a call with scores param');
  assert.strictEqual(scoreCall.params.scores.length, 2);
  assert.ok(scoreCall.params.scores.every((s) => typeof s.value === 'number'));
});

test('setUserProfileProperties merges user and sets props on User node', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => {
    calls.push({ cypher, params });
    return [];
  };
  const fields = [
    { questionId: 'birthday', value: new Date('1990-05-15'), type: 'date' },
    { questionId: 'gender', value: 'female', type: 'select' },
    { questionId: 'score', value: 3.5, type: 'number' },
  ];
  await setUserProfileProperties(mockRun, 'user-xyz', fields);
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].cypher.includes('SET u +='));
  assert.strictEqual(calls[0].params.userId, 'user-xyz');
  assert.strictEqual(calls[0].params.props.birthday, '1990-05-15');
  assert.strictEqual(calls[0].params.props.gender, 'female');
  assert.strictEqual(calls[0].params.props.score, 3.5);
});

test('setUserProfileProperties skips fields with null or undefined value', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => {
    calls.push({ cypher, params });
    return [];
  };
  await setUserProfileProperties(mockRun, 'user-xyz', [
    { questionId: 'birthday', value: null, type: 'date' },
  ]);
  assert.strictEqual(
    calls.length,
    0,
    'Should not call Neo4j when no valid fields'
  );
});

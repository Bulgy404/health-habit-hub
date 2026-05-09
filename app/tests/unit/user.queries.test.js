import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeUserAndHabits, createSubmissionWithScores } from '../../db/userQueries.js';

test('mergeUserAndHabits calls queryNeo4j with userId param', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => { calls.push({ cypher, params }); return []; };
  await mergeUserAndHabits(mockRun, 'user-abc');
  assert.ok(calls.length > 0);
  assert.ok(calls.every(c => c.params.userId === 'user-abc'));
});

test('createSubmissionWithScores passes all scores to queryNeo4j', async () => {
  const calls = [];
  const mockRun = async (cypher, params) => { calls.push({ cypher, params }); return []; };
  const answers = { sliq_diet: '2', sliq_activity: '3' };
  await createSubmissionWithScores(mockRun, 'user-abc', 'sliq', answers);
  const scoreCall = calls.find(c => c.params.scores !== undefined);
  assert.ok(scoreCall, 'expected a call with scores param');
  assert.strictEqual(scoreCall.params.scores.length, 2);
  assert.ok(scoreCall.params.scores.every(s => typeof s.value === 'number'));
});

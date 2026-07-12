import { test } from 'node:test';
import assert from 'node:assert';
import { isTerminalFailure } from '../../lib/habitQueue.js';
import { bullmqJobsFailedTotal } from '../../middleware/metrics.js';

test('isTerminalFailure: false on a retryable (non-final) attempt', () => {
  assert.strictEqual(
    isTerminalFailure({ attemptsMade: 1, opts: { attempts: 3 } }),
    false
  );
  assert.strictEqual(
    isTerminalFailure({ attemptsMade: 2, opts: { attempts: 3 } }),
    false
  );
});

test('isTerminalFailure: true once attemptsMade reaches the configured max', () => {
  assert.strictEqual(
    isTerminalFailure({ attemptsMade: 3, opts: { attempts: 3 } }),
    true
  );
});

test('isTerminalFailure: true if attemptsMade somehow exceeds max', () => {
  assert.strictEqual(
    isTerminalFailure({ attemptsMade: 4, opts: { attempts: 3 } }),
    true
  );
});

test('isTerminalFailure: defaults to terminal (max attempts = 1) when opts are missing', () => {
  assert.strictEqual(isTerminalFailure({}), true);
  assert.strictEqual(isTerminalFailure(undefined), true);
});

test('bullmqJobsFailedTotal counter is registered with the queue label', async () => {
  bullmqJobsFailedTotal.reset();
  bullmqJobsFailedTotal.inc({ queue: 'habit-donations' });
  const metric = await bullmqJobsFailedTotal.get();
  assert.strictEqual(metric.name, 'bullmq_jobs_failed_total');
  assert.strictEqual(metric.values[0].value, 1);
  assert.strictEqual(metric.values[0].labels.queue, 'habit-donations');
});

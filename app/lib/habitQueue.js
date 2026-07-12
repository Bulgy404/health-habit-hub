import { Queue, Worker, Job } from 'bullmq';
import { shareHabit } from '../services/habitDonationService.js';
import { translateHabit, translateTerm } from '../utils/translate.js';
import { logger } from '../utils/logger.js';
import { bullmqJobsFailedTotal } from '../middleware/metrics.js';

const log = logger.child({ module: 'habitQueue' });
const QUEUE_NAME = 'habit-donations';

function redisConnection() {
  return { url: process.env.REDIS_URL || 'redis://localhost:6379' };
}

let _queue = null;
let _worker = null;

// Defer Queue construction until first use so importing this module does not
// attempt a Redis connection at load time (which breaks tests without Redis).
export function getHabitQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400 },
        removeOnFailed: { age: 86400 },
      },
    });
  }
  return _queue;
}

/**
 * Close the queue and worker's Redis connections, if they were ever created.
 * Called on graceful shutdown (SIGTERM/SIGINT) — a no-op in test mode, where
 * neither is ever instantiated.
 */
export async function closeHabitQueue() {
  await Promise.all([_worker?.close(), _queue?.close()]);
}

/**
 * Look up a job's status from Redis via BullMQ.
 * Returns null if the job does not exist or has expired.
 *
 * @param {string} jobId - UUID used as the BullMQ job ID
 * @param {Queue} [queue] - Queue to query; defaults to the shared singleton.
 *   Callers in test mode (no Redis) should not call this with a null queue.
 * @returns {Promise<{ jobId, status, uuid, userID, failReason? } | null>}
 */
export async function getJobStatus(jobId, queue = getHabitQueue()) {
  const job = await Job.fromId(queue, jobId);
  if (!job) return null;

  const state = await job.getState();
  const status = state === 'completed' ? 'done' : state;

  return {
    jobId,
    status,
    uuid: job.returnvalue?.uuid ?? null,
    userID: job.data.userID,
    ...(state === 'failed' ? { failReason: job.failedReason } : {}),
  };
}

/**
 * Whether a BullMQ 'failed' event represents a terminal (retries-exhausted)
 * failure rather than an attempt that will still be retried. BullMQ fires
 * 'failed' on every failed attempt, not just the last one.
 *
 * @param {{ attemptsMade?: number, opts?: { attempts?: number } }} job
 * @returns {boolean}
 */
export function isTerminalFailure(job) {
  const maxAttempts = job?.opts?.attempts ?? 1;
  return (job?.attemptsMade ?? maxAttempts) >= maxAttempts;
}

/**
 * Start the BullMQ worker that processes queued habit donations.
 * Call once on app startup. Pass neo4jRun=true to skip (test mode).
 *
 * @param {{ queryNeo4j: Function, getDb: Function, apiBase: string, translateUrl: string }} deps
 */
export function startHabitWorker({ queryNeo4j, getDb, apiBase, translateUrl }) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const {
        uuid,
        sentence,
        language,
        userID,
        studyId,
        frequency,
        duration,
        healthBenefit,
        wellbeingImpact,
      } = job.data;

      // Classification now happens here rather than synchronously in the
      // route handler, so /habits/share can respond as soon as the job is
      // enqueued instead of waiting on the classifier LLM call.
      const result = await shareHabit({
        uuid,
        sentence,
        language,
        userID,
        studyId,
        frequency,
        duration,
        healthBenefit,
        wellbeingImpact,
        queryNeo4j,
        getDb,
        apiBase,
        translate: translateHabit,
        translateTerm,
        translateUrl,
      });

      // Return value is stored in job.returnvalue in Redis.
      return { uuid: result.uuid ?? uuid, is_habit: result.is_habit };
    },
    { connection: redisConnection(), concurrency: 3 }
  );

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.data?.uuid, err: err.message },
      'habit donation job failed'
    );
    // Only count terminal failures toward the alert-facing metric (default:
    // 3 attempts, see defaultJobOptions above) — a job that fails once then
    // succeeds on retry must not trigger a critical alert.
    if (isTerminalFailure(job)) {
      bullmqJobsFailedTotal.inc({ queue: QUEUE_NAME });
    }
  });

  _worker = worker;
  return worker;
}

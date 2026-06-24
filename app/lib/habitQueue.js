import { Queue, Worker, Job } from 'bullmq';
import { processAcceptedHabit } from '../services/habitDonationService.js';
import { translateHabit } from '../utils/translate.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'habitQueue' });
const QUEUE_NAME = 'habit-donations';

function redisConnection() {
  return { url: process.env.REDIS_URL || 'redis://localhost:6379' };
}

export const habitQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    // Keep completed/failed jobs in Redis for 24 h so the status endpoint works.
    removeOnComplete: { age: 86400 },
    removeOnFailed: { age: 86400 },
  },
});

/**
 * Look up a job's status from Redis via BullMQ.
 * Returns null if the job does not exist or has expired.
 *
 * @param {string} jobId - UUID used as the BullMQ job ID
 * @returns {Promise<{ jobId, status, uuid, userID, failReason? } | null>}
 */
export async function getJobStatus(jobId) {
  const job = await Job.fromId(habitQueue, jobId);
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
        frequency,
        duration,
        healthBenefit,
        wellbeingImpact,
      } = job.data;

      const result = await processAcceptedHabit({
        uuid,
        sentence,
        language,
        userID,
        frequency,
        duration,
        healthBenefit,
        wellbeingImpact,
        queryNeo4j,
        getDb,
        apiBase,
        translate: translateHabit,
        translateUrl,
      });

      // Return value is stored in job.returnvalue in Redis.
      return { uuid: result.uuid };
    },
    { connection: redisConnection(), concurrency: 3 }
  );

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.data?.uuid, err: err.message },
      'habit donation job failed'
    );
  });

  return worker;
}

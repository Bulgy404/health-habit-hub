import { Queue, Worker, Job } from 'bullmq';
import { redisConnection, isTerminalFailure } from './habitQueue.js';
import { logger } from '../utils/logger.js';
import { bullmqJobsFailedTotal } from '../middleware/metrics.js';

const log = logger.child({ module: 'transcribeQueue' });
const QUEUE_NAME = 'audio-transcriptions';

let _queue = null;
let _worker = null;

// Deferred construction, same rationale as getHabitQueue(): importing this
// module must not touch Redis (tests build routers without a queue).
export function getTranscribeQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        // SCADS.AI (the STT provider) is occasionally slow/flaky under load
        // — this is the whole reason the route was moved off a single
        // blocking HTTP call, so retry a couple of times before giving up.
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        // Short-lived: a transcript is only ever read once, right after
        // recording, so there is no reason to keep completed jobs around as
        // long as the habit-donation queue does.
        removeOnComplete: { age: 3600 },
        removeOnFailed: { age: 3600 },
      },
    });
  }
  return _queue;
}

export async function closeTranscribeQueue() {
  await Promise.all([_worker?.close(), _queue?.close()]);
}

/**
 * Look up a transcription job's status from Redis via BullMQ.
 * Returns null if the job does not exist or has expired.
 *
 * @param {string} jobId
 * @param {Queue} [queue]
 * @returns {Promise<{ jobId, status, text, userID, failReason? } | null>}
 */
export async function getTranscribeJobStatus(
  jobId,
  queue = getTranscribeQueue()
) {
  const job = await Job.fromId(queue, jobId);
  if (!job) return null;

  const state = await job.getState();
  const status = state === 'completed' ? 'done' : state;

  return {
    jobId,
    status,
    text: job.returnvalue?.text ?? null,
    userID: job.data.userID,
    ...(state === 'failed' ? { failReason: job.failedReason } : {}),
  };
}

/**
 * Start the BullMQ worker that proxies queued audio clips to the
 * API-service's STT endpoint. Call once on app startup.
 *
 * @param {{ apiServiceUrl: string }} deps
 */
export function startTranscribeWorker({ apiServiceUrl }) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { audioBase64, mimeType, filename } = job.data;
      const form = new FormData();
      form.append(
        'file',
        new Blob([Buffer.from(audioBase64, 'base64')], { type: mimeType }),
        filename
      );

      const res = await fetch(`${apiServiceUrl}/api/v1/llm/transcribe-audio`, {
        method: 'POST',
        headers: {
          'x-service-auth-token': process.env.API_SERVICE_SECRET || '',
        },
        body: form,
        // Bounded so a wedged STT call fails the job (and lets BullMQ retry)
        // instead of tying up a worker slot forever.
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || `STT HTTP ${res.status}`);
      }

      // Stored in job.returnvalue in Redis — this IS the "see what got
      // transcribed" record: inspect it via Bull Board (/queues) or
      // RedisInsight while the job's removeOnComplete TTL (1h) hasn't
      // expired yet.
      return { text: data.transcript ?? '' };
    },
    { connection: redisConnection(), concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'transcription job failed');
    if (isTerminalFailure(job)) {
      bullmqJobsFailedTotal.inc({ queue: QUEUE_NAME });
    }
  });

  _worker = worker;
  return worker;
}

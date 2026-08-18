import express from 'express';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { isValidUuid } from '../../utils/constants.js';

const log = logger.child({ module: 'voiceTranscribeRouter' });

// Generous but bounded — mirrors API-service's own _MAX_AUDIO_BYTES; guards
// against buffering an oversized body into memory before forwarding/storing.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Only /donations/:uuid/audio needs this — it writes the file part's bytes
// straight to disk, so it must actually parse the multipart envelope rather
// than store it verbatim (unlike /share/transcribe below, which forwards
// the whole raw body to a downstream multipart-aware endpoint untouched).
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
});

/**
 * Voice input for habit donation: stateless transcription + (once a
 * donation is actually submitted) persisted audio storage, linked to the
 * habit_donations record created in habitsCrudRouter's handleShareHabit.
 *
 * Routes (mounted under /api/v1/habits by habitsRouter):
 *   POST /share/transcribe       — transcribe a recorded clip, nothing persisted
 *   POST /donations/:uuid/audio  — attach the clip to an already-submitted donation
 *
 * @param {{ getDb: Function, apiServiceUrl?: string, audioStorageDir?: string }} opts
 */
export function createVoiceRouter({
  getDb,
  apiServiceUrl,
  audioStorageDir,
} = {}) {
  const router = express.Router();
  const serviceUrl =
    apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';
  const storageDir =
    audioStorageDir ||
    process.env.AUDIO_STORAGE_DIR ||
    '/data/audio-recordings';

  function serviceHeaders(extra = {}) {
    return {
      'x-service-auth-token': process.env.API_SERVICE_SECRET || '',
      ...extra,
    };
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) {
        throw Object.assign(new Error('Audio file too large'), {
          status: 413,
        });
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // POST /share/transcribe — stateless proxy to the API-service STT
  // endpoint. A participant can record/re-record/abandon freely; nothing is
  // written to disk or Mongo until an actual donation is submitted (see
  // /donations/:uuid/audio below) — no orphan-cleanup bookkeeping needed.
  router.post('/share/transcribe', async (req, res) => {
    try {
      const body = await readBody(req);
      if (body.length === 0) {
        return res.status(400).json({ error: 'Empty audio upload' });
      }
      const upstream = await fetch(
        `${serviceUrl}/api/v1/llm/transcribe-audio`,
        {
          method: 'POST',
          headers: serviceHeaders({
            'content-type': req.headers['content-type'],
          }),
          body,
        }
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      if (err.status === 413) {
        return res.status(413).json({ error: err.message });
      }
      log.error({ err }, 'transcribe proxy failed');
      res.status(502).json({ error: 'Transcription service unavailable' });
    }
  });

  // POST /donations/:uuid/audio — persist the recorded clip for a donation
  // that has already been submitted via POST /habits/share. Requires a
  // matching, not-yet-attached habit_donations record owned by the caller —
  // this is the only point at which audio is ever written to disk.
  router.post(
    '/donations/:uuid/audio',
    uploadAudio.single('file'),
    async (req, res) => {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { uuid } = req.params;
      // Validate the shape before `uuid` is trusted for anything sensitive —
      // it's used both in a Mongo query and (via `filename`) in a filesystem
      // path below, and a habit_donations lookup alone isn't a recognised
      // sanitizer for either of those.
      if (!isValidUuid(uuid)) {
        return res.status(400).json({ error: 'Invalid donation id' });
      }

      const file = req.file;
      if (!file || file.buffer.length === 0) {
        return res.status(400).json({ error: 'Empty audio upload' });
      }

      try {
        const database = await getDb();
        const donation = await database
          .collection('habit_donations')
          .findOne({ uuid, userId });
        if (!donation) {
          return res.status(404).json({ error: 'Donation not found' });
        }
        if (donation.audioClip) {
          return res.status(409).json({ error: 'Audio already attached' });
        }

        const mimeType = file.mimetype || 'audio/m4a';
        const ext = mimeType.includes('wav')
          ? 'wav'
          : mimeType.includes('mp4') || mimeType.includes('m4a')
            ? 'm4a'
            : 'bin';
        const filename = `${uuid}.${ext}`;

        await mkdir(storageDir, { recursive: true });
        await writeFile(path.join(storageDir, filename), file.buffer);

        const audioClip = {
          filename,
          mimeType,
          sizeBytes: file.buffer.length,
          durationSec: null,
          storedAt: new Date(),
        };
        await database
          .collection('habit_donations')
          .updateOne(
            { uuid, userId },
            { $set: { audioClip, updatedAt: new Date() } }
          );

        res.status(201).json({ ok: true });
      } catch (err) {
        log.error({ err, uuid }, 'audio attach failed');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // multer surfaces an oversized upload as a middleware error before the
  // route handler above ever runs — catch it here for a specific 413
  // instead of falling through to a generic 500.
  router.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Audio file exceeds the ${MAX_AUDIO_BYTES / (1024 * 1024)}MB limit.`,
      });
    }
    next(err);
  });

  return router;
}

export default createVoiceRouter;

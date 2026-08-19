import express from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import { isValidUuid } from '../../utils/constants.js';
import { logger } from '../../utils/logger.js';
import { makeGetDb } from '../../utils/getDb.js';

const log = logger.child({ module: 'habitDonationsRouter' });

/**
 * Admin-only read access to a single habit donation's full record — the
 * voice transcript, the recorded audio clip (playback/download), and the
 * linked post-donation questionnaire response — for researchers who
 * previously had to reach these by `docker exec`/`mongosh` directly on the
 * server. Mounted under /api/v1/admin by adminRouter.js, behind the same
 * requireRole(ADMIN, RESEARCHER) gate apiRouter.js applies to all of /admin.
 *
 * Routes:
 *   GET /habit-donations/:uuid        — donation + questionnaire response + Neo4j self-report fields
 *   GET /habit-donations/:uuid/audio  — streams the recorded audio clip (?download=1 forces attachment)
 *
 * @param {{ db: object, neo4jRun?: Function, audioStorageDir?: string }} deps
 */
export function createHabitDonationsRouter({
  db,
  neo4jRun,
  audioStorageDir,
} = {}) {
  const router = express.Router();
  const storageDir =
    audioStorageDir ||
    process.env.AUDIO_STORAGE_DIR ||
    '/data/audio-recordings';

  const getDb = makeGetDb(db);

  /**
   * Fetches a Habit node's donation-form self-report answers from Neo4j.
   * Only meaningful for an accepted donation (isHabit === true) — a
   * rejected/pending one never had a Habit node created for it.
   */
  async function getHabitSelfReport(uuid) {
    if (!neo4jRun) return null;
    const rows = await neo4jRun(
      `MATCH (h:Habit {uuid: $uuid})
       RETURN h.frequency AS frequency, h.duration AS duration,
              h.health_benefit AS healthBenefit,
              h.wellbeing_impact AS wellbeingImpact`,
      { uuid }
    );
    if (rows.length === 0) return null;
    const { frequency, duration, healthBenefit, wellbeingImpact } = rows[0];
    return {
      frequency: frequency ?? null,
      duration: duration ?? null,
      healthBenefit: healthBenefit ?? null,
      wellbeingImpact: wellbeingImpact ?? null,
    };
  }

  // GET /api/v1/admin/habit-donations/:uuid
  router.get('/habit-donations/:uuid', async (req, res) => {
    try {
      const { uuid } = req.params;
      if (!isValidUuid(uuid)) {
        return res.status(400).json({ error: 'Invalid donation id' });
      }

      const database = await getDb();
      const donation = await database
        .collection('habit_donations')
        .findOne({ uuid });
      if (!donation) {
        return res.status(404).json({ error: 'Donation not found' });
      }

      let questionnaireResponse = null;
      if (donation.questionnaireResponseId) {
        questionnaireResponse = await database
          .collection('form_responses')
          .findOne({ _id: new ObjectId(donation.questionnaireResponseId) });
      }

      const selfReport =
        donation.isHabit === true ? await getHabitSelfReport(uuid) : null;

      res.json({
        uuid: donation.uuid,
        userId: donation.userId,
        studyId: donation.studyId,
        groupId: donation.groupId,
        inputMode: donation.inputMode,
        isHabit: donation.isHabit,
        transcript: donation.transcript,
        transcriptEdited: donation.transcriptEdited,
        audioClip: donation.audioClip,
        questionnaireSlug: donation.questionnaireSlug,
        questionnaireResponse,
        selfReport,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt,
      });
    } catch (err) {
      log.error({ err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/admin/habit-donations/:uuid/audio — streams the clip.
  // ?download=1 (or "true") forces Content-Disposition: attachment.
  router.get('/habit-donations/:uuid/audio', async (req, res) => {
    try {
      const { uuid } = req.params;
      // Validated before `uuid` (or anything derived from the donation doc
      // it looks up) is trusted for a filesystem path — same rule as
      // voiceTranscribeRouter's upload side.
      if (!isValidUuid(uuid)) {
        return res.status(400).json({ error: 'Invalid donation id' });
      }

      const database = await getDb();
      const donation = await database
        .collection('habit_donations')
        .findOne({ uuid });
      if (!donation || !donation.audioClip?.filename) {
        return res.status(404).json({ error: 'Audio not found' });
      }

      // The filename comes from the stored Mongo doc (server-generated at
      // upload time — see voiceTranscribeRouter.js), never from the request,
      // but is still resolved defensively: reject anything that would
      // escape storageDir before opening it.
      const resolvedDir = path.resolve(storageDir) + path.sep;
      const filePath = path.resolve(storageDir, donation.audioClip.filename);
      if (!filePath.startsWith(resolvedDir)) {
        log.warn(
          { uuid, filename: donation.audioClip.filename },
          'audioClip.filename resolved outside storageDir'
        );
        return res.status(404).json({ error: 'Audio not found' });
      }

      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        return res.status(404).json({ error: 'Audio file missing on disk' });
      }

      const download =
        req.query.download === '1' || req.query.download === 'true';
      res.set({
        'Content-Type':
          donation.audioClip.mimeType || 'application/octet-stream',
        'Content-Length': fileStat.size,
        'Content-Disposition': download
          ? `attachment; filename="${donation.audioClip.filename}"`
          : 'inline',
      });
      createReadStream(filePath).pipe(res);
    } catch (err) {
      log.error({ err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createHabitDonationsRouter;

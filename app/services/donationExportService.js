import AdmZip from 'adm-zip';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import { fetchDonatedHabits, donationsCSV } from './adminHabitService.js';

// Use a resolved path for both playback and exports, including symlink checks.
export async function donationAudioPath(storageDir, filename) {
  const root = await realpath(storageDir);
  const target = await realpath(path.resolve(root, filename));
  if (!target.startsWith(root + path.sep))
    throw new Error('Invalid audio path');
  return target;
}

export async function buildDonationZip(options) {
  const { db, neo4jRun, audioStorageDir } = options;
  const storageDir =
    audioStorageDir ||
    process.env.AUDIO_STORAGE_DIR ||
    '/data/audio-recordings';
  const habits = await fetchDonatedHabits(options);
  const zip = new AdmZip();
  zip.addFile('donations.csv', Buffer.from(donationsCSV(habits)));
  const records = [];
  for (const habit of habits) {
    const donation = await db
      .collection('habit_donations')
      .findOne({ uuid: habit.id });
    // A mismatched record must never bridge study boundaries.
    const record =
      donation && String(donation.studyId ?? '') === String(habit.studyId ?? '')
        ? donation
        : null;
    const entry = {
      ...habit,
      donation: record,
      questionnaireResponse: null,
      selfReport: null,
      audioFile: null,
      audioStatus: 'not_recorded',
    };
    if (record?.questionnaireResponseId) {
      entry.questionnaireResponse = await db
        .collection('form_responses')
        .findOne({
          _id: new ObjectId(record.questionnaireResponseId),
          habitUuid: habit.id,
        });
    }
    const rows = await neo4jRun(
      `MATCH (h:Habit {uuid: $uuid}) RETURN h.frequency AS frequency, h.duration AS duration, h.health_benefit AS healthBenefit, h.wellbeing_impact AS wellbeingImpact`,
      { uuid: habit.id }
    );
    entry.selfReport = rows[0] ?? null;
    if (record?.audioClip?.filename) {
      try {
        const filename = await donationAudioPath(
          storageDir,
          record.audioClip.filename
        );
        // UUID comes from graph data; basename prevents archive path traversal.
        entry.audioFile = `audio/${path.basename(habit.id)}${path.extname(filename)}`;
        zip.addFile(entry.audioFile, await readFile(filename));
        entry.audioStatus = 'included';
      } catch (err) {
        if (
          !['ENOENT', 'ENOTDIR'].includes(err.code) &&
          err.message !== 'Invalid audio path'
        )
          throw err;
        entry.audioFile = null;
        entry.audioStatus = 'missing';
      }
    }
    records.push(entry);
  }
  zip.addFile('donations.json', Buffer.from(JSON.stringify(records, null, 2)));
  zip.addFile(
    'README.txt',
    Buffer.from(
      'All donations matching the selected filters, across every page.\nCSV: habit summary with donation and study IDs.\nJSON: donation records, transcripts, questionnaires, self-report answers and audio manifest.\nAudio: original recordings where available; audioStatus reports missing files.\n'
    )
  );
  return zip.toBufferPromise();
}

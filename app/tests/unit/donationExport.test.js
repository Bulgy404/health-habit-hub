import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { donationScope } from '../../services/donationAccessService.js';
import { buildDonationZip } from '../../services/donationExportService.js';
import { getHabitsFeed } from '../../services/adminHabitService.js';
const id = '123456789012345678901234';
const user = { sub: 'r', realm_access: { roles: ['researcher'] } };
const dbFor = (scope) => ({
  collection: () => ({
    find: () => ({ toArray: async () => [{ studyId: id, scope }] }),
  }),
});
test('export scope is required, including all-studies exports', async () => {
  assert.deepEqual(await donationScope(dbFor('read'), user), [id]);
  await assert.rejects(donationScope(dbFor('read'), user, id, true), {
    status: 403,
  });
  await assert.rejects(donationScope(dbFor('read'), user, undefined, true), {
    status: 403,
  });
  assert.deepEqual(await donationScope(dbFor('export'), user, id, true), [id]);
  await assert.rejects(
    donationScope(dbFor('export'), user, 'abcdefabcdefabcdefabcdef'),
    { status: 403 }
  );
});
test('feed excludes unassigned and unscoped donations; ZIP includes all pages and original audio', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'donation-export-'));
  try {
    await writeFile(path.join(dir, 'sample.wav'), 'original audio');
    const rows = Array.from({ length: 51 }, (_, n) => ({
      id: `donation-${n}`,
      studyId: id,
      habitName: `Walk ${n}`,
    }));
    rows.push(
      { id: 'private', studyId: 'abcdefabcdefabcdefabcdef' },
      { id: 'unscoped', studyId: null }
    );
    const db = {
      collection: (name) => ({
        find: () => ({ project: () => ({ toArray: async () => [] }) }),
        findOne: async (q) =>
          name === 'habit_donations'
            ? {
                uuid: q.uuid,
                studyId: id,
                transcript: 'Walk',
                audioClip: { filename: 'sample.wav' },
              }
            : null,
      }),
    };
    const neo4jRun = async (cypher) =>
      cypher.includes('DONATED') ? rows : [{ frequency: 'daily' }];
    const opts = { db, neo4jRun, studyIds: [id], audioStorageDir: dir };
    const feed = await getHabitsFeed({ ...opts, limit: 50 });
    assert.equal(feed.total, 51);
    assert.equal(feed.results.length, 50);
    const zip = new AdmZip(await buildDonationZip(opts));
    const records = JSON.parse(zip.readAsText('donations.json'));
    assert.equal(records.length, 51);
    assert.equal(zip.readAsText(records[50].audioFile), 'original audio');
    assert.equal(records[0].donation.transcript, 'Walk');
    assert.equal(records[0].selfReport.frequency, 'daily');
    assert.ok(!zip.readAsText('donations.csv').includes('private'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

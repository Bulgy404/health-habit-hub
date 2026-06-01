// app/routes/studyExportRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import {
  buildSrhiCsv,
  buildDailyLogsCsv,
  buildDropoutCsv,
} from '../services/exportService.js';

export function createStudyExportRouter({ db } = {}) {
  const router = express.Router({ mergeParams: true });
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const { id: studyId } = req.params;
      const [srhiCsv, logsCsv, dropoutCsv] = await Promise.all([
        buildSrhiCsv({ db: database, studyId }),
        buildDailyLogsCsv({ db: database, studyId }),
        buildDropoutCsv({ db: database, studyId }),
      ]);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="study-${studyId}-export.zip"`
      );
      const { default: AdmZip } = await import('adm-zip');
      const zip = new AdmZip();
      zip.addFile('srhi_trajectories.csv', Buffer.from(srhiCsv, 'utf8'));
      zip.addFile('daily_logs.csv', Buffer.from(logsCsv, 'utf8'));
      zip.addFile('dropout.csv', Buffer.from(dropoutCsv, 'utf8'));
      res.end(zip.toBuffer());
    } catch (err) {
      console.error('[export] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

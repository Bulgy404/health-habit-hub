// app/routes/notificationCampaignRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import {
  createCampaign,
  listCampaigns,
  cancelCampaign,
  sendCampaign,
} from '../services/notificationCampaignService.js';

export function createNotificationCampaignRouter({ db, fcmSend } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  const send =
    fcmSend ??
    (async (tokens, title, body) => {
      const { getFirebaseMessaging } = await import(
        '../services/notificationService.js'
      );
      const messaging = await getFirebaseMessaging();
      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
      });
      return result.successCount;
    });

  router.get('/', async (req, res) => {
    try {
      const { studyId, status, page, limit } = req.query;
      const database = await getDb();
      const result = await listCampaigns({
        db: database,
        studyId,
        status,
        page: parseInt(page ?? '1', 10),
        limit: parseInt(limit ?? '20', 10),
      });
      res.json(result);
    } catch (err) {
      console.error('[notifications] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { studyId, title, body, targetType, targetIds, scheduledFor } =
        req.body;
      if (!title || !body || !targetType)
        return res
          .status(400)
          .json({ error: 'title, body, targetType required' });
      if (title.length > 65)
        return res.status(400).json({ error: 'title max 65 chars' });
      if (body.length > 240)
        return res.status(400).json({ error: 'body max 240 chars' });
      const database = await getDb();
      const campaign = await createCampaign({
        db: database,
        createdBy: req.user.sub,
        studyId: studyId ?? null,
        title,
        body,
        targetType,
        targetIds: targetIds ?? [],
        scheduledFor: scheduledFor ?? null,
      });
      if (!scheduledFor) {
        await sendCampaign({ db: database, id: campaign.id, send: send });
      }
      res.status(201).json(campaign);
    } catch (err) {
      console.error('[notifications] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await cancelCampaign({ db: database, id: req.params.id });
      if (result.notFound)
        return res
          .status(404)
          .json({ error: 'Campaign not found or already sent' });
      res.json({ cancelled: true });
    } catch (err) {
      console.error('[notifications] DELETE /:id:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

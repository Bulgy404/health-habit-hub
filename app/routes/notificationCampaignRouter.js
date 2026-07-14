// app/routes/notificationCampaignRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { createNotificationCampaignSchema } from '../schemas/adminSchemas.js';
import {
  createCampaign,
  listCampaigns,
  cancelCampaign,
  sendCampaign,
} from '../services/notificationCampaignService.js';

const log = logger.child({ module: 'notificationCampaignRouter' });

export function createNotificationCampaignRouter({
  db,
  fcmSend,
  neo4jRun,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  const send =
    fcmSend ??
    (async (tokens, title, body) => {
      const { fcmSendMulticast } = await import(
        '../services/notificationService.js'
      );
      const database = await getDb();
      // Handles unconfigured Firebase (returns 0 + logs) and prunes tokens
      // Firebase reports as permanently invalid.
      return fcmSendMulticast({ db: database, tokens, title, body });
    });

  // Builds a human-readable explanation when a send reaches nobody, so the
  // admin sees *why* instead of a bare "Sent to 0 participants".
  function deliveryWarningFor({
    recipientCount,
    resolvedUserCount,
    tokenCount,
  }) {
    if (recipientCount > 0) return null;
    if (resolvedUserCount === 0)
      return 'No participants are enrolled in the selected study/group yet.';
    if (tokenCount === 0)
      return `${resolvedUserCount} participant(s) enrolled, but none have a registered device — they may not have opened the app or granted notification permission.`;
    return `${tokenCount} device(s) targeted but every push failed — check the backend Firebase credentials (FIREBASE_SERVICE_ACCOUNT_JSON).`;
  }

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
      log.error({ err: err }, '[notifications] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post(
    '/',
    validate(createNotificationCampaignSchema),
    async (req, res) => {
      try {
        const {
          studyId,
          title,
          body,
          targetType,
          targetIds,
          scheduledFor,
          recurrence,
        } = req.body;
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
          recurrence: recurrence ?? null,
        });
        if (!scheduledFor) {
          // Merge the real send result back onto the response — createCampaign's
          // doc is a pre-send snapshot with recipientCount: null, so without
          // this the admin UI always reports "sent to 0 participants"
          // regardless of how many were actually reached.
          const sendResult = await sendCampaign({
            db: database,
            id: campaign.id,
            send: send,
            neo4jRun,
          });
          if (!sendResult.notFound) {
            campaign.recipientCount = sendResult.recipientCount;
            campaign.resolvedUserCount = sendResult.resolvedUserCount;
            campaign.tokenCount = sendResult.tokenCount;
            campaign.sentAt = sendResult.sentAt;
            campaign.status = 'sent';
            campaign.deliveryWarning = deliveryWarningFor(sendResult);
            log.info(
              {
                campaignId: campaign.id,
                targetType,
                recipientCount: sendResult.recipientCount,
                resolvedUserCount: sendResult.resolvedUserCount,
                tokenCount: sendResult.tokenCount,
              },
              campaign.deliveryWarning
                ? `[notifications] campaign reached nobody: ${campaign.deliveryWarning}`
                : '[notifications] campaign sent'
            );
          }
        }
        res.status(201).json(campaign);
      } catch (err) {
        log.error({ err: err }, '[notifications] error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

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
      log.error({ err: err }, '[notifications] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

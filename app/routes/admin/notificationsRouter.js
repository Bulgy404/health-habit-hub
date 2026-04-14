import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import {
  getFirebaseMessaging,
  sendStudyNotification,
  COLLECTION_SCHEDULED,
} from '../../services/notificationService.js';

export function createNotificationsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /admin/notifications/send:
   *   post:
   *     summary: Send push notification immediately to study participants
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [studyId, title, body]
   *             properties:
   *               studyId: { type: string }
   *               groupId: { type: string, description: Optional group filter }
   *               title: { type: string }
   *               body: { type: string }
   *               data: { type: object }
   *     responses:
   *       200:
   *         description: Notification dispatched
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 sent: { type: integer }
   *                 failed: { type: integer }
   *       400:
   *         description: Missing required fields
   */
  router.post('/notifications/send', async (req, res) => {
    try {
      const { studyId, groupId, title, body, data } = req.body;
      if (!studyId || !title || !body) {
        return res
          .status(400)
          .json({ error: 'studyId, title, and body are required' });
      }

      const database = await getDb();
      const messaging = await getFirebaseMessaging();
      const result = await sendStudyNotification({
        db: database,
        messaging,
        studyId,
        groupId: groupId || undefined,
        title,
        body,
        data,
      });

      res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/schedule:
   *   post:
   *     summary: Schedule a push notification for future delivery
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [studyId, title, body, scheduledAt]
   *             properties:
   *               studyId: { type: string }
   *               groupId: { type: string }
   *               title: { type: string }
   *               body: { type: string }
   *               data: { type: object }
   *               scheduledAt: { type: string, format: date-time }
   *     responses:
   *       201:
   *         description: Notification scheduled
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id: { type: string }
   *       400:
   *         description: Missing required fields or invalid scheduledAt
   */
  router.post('/notifications/schedule', async (req, res) => {
    try {
      const { studyId, groupId, title, body, data, scheduledAt } = req.body;
      if (!studyId || !title || !body || !scheduledAt) {
        return res.status(400).json({
          error: 'studyId, title, body, and scheduledAt are required',
        });
      }

      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res
          .status(400)
          .json({ error: 'scheduledAt must be a valid ISO 8601 date' });
      }

      const { ObjectId: OId } = await import('mongodb');

      let studyOid;
      try {
        studyOid = new OId(studyId);
      } catch {
        return res.status(400).json({ error: 'Invalid studyId' });
      }
      let groupOid = null;
      if (groupId) {
        try {
          groupOid = new OId(groupId);
        } catch {
          return res.status(400).json({ error: 'Invalid groupId' });
        }
      }

      const database = await getDb();
      const doc = {
        studyId: studyOid,
        groupId: groupOid,
        title,
        body,
        data: data || null,
        scheduledAt: scheduledDate,
        sent: false,
        createdAt: new Date(),
      };

      const result = await database
        .collection(COLLECTION_SCHEDULED)
        .insertOne(doc);

      res.status(201).json({ id: result.insertedId.toString() });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/scheduled:
   *   get:
   *     summary: List pending scheduled notifications
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Array of pending scheduled notifications
   */
  router.get('/notifications/scheduled', async (req, res) => {
    try {
      const database = await getDb();
      const docs = await database
        .collection(COLLECTION_SCHEDULED)
        .find({ sent: false })
        .sort({ scheduledAt: 1 })
        .toArray();

      res.json(
        docs.map((d) => ({
          id: d._id.toString(),
          studyId: d.studyId.toString(),
          groupId: d.groupId ? d.groupId.toString() : null,
          title: d.title,
          body: d.body,
          data: d.data,
          scheduledAt: d.scheduledAt,
          createdAt: d.createdAt,
        }))
      );
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/notifications/scheduled/{id}:
   *   delete:
   *     summary: Cancel a pending scheduled notification
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Notification cancelled
   *       404:
   *         description: Notification not found or already sent
   */
  router.delete('/notifications/scheduled/:id', async (req, res) => {
    try {
      const { ObjectId: OId } = await import('mongodb');
      let oid;
      try {
        oid = new OId(req.params.id);
      } catch {
        return res.status(404).json({ error: 'Not found' });
      }

      const database = await getDb();
      const result = await database
        .collection(COLLECTION_SCHEDULED)
        .deleteOne({ _id: oid, sent: false });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Not found or already sent' });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

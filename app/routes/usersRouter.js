import express from 'express';
import { randomBytes } from 'node:crypto';
import { makeGetDb } from '../utils/getDb.js';
import { COLLECTION as HABIT_COMMENTS_COLLECTION } from '../models/habitComment.js';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import { mintTokenForUser } from '../services/keycloakRopcClient.js';
import {
  recoveryPhraseFromCredentials,
  recoveryPhrasesEnabled,
} from '../utils/recoveryPhrase.js';
import { logger } from '../utils/logger.js';
import { revokeLink as revokeIdentityLink } from '../services/identityLinkClient.js';

const log = logger.child({ module: 'usersRouter' });

const SUPPORTED_LANGUAGES = ['en', 'de', 'ja', 'fr', 'nl'];

// neo4jRun is accepted (and still injected by apiRouter) for interface
// stability, but no route here touches Neo4j anymore: account deletion
// retains all graph data (comments, enrollment) — see DELETE /me below.
export function createUsersRouter({ db, keycloak, neo4jRun } = {}) {
  void neo4jRun;
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Production fallback (mirrors adminRouter/habitsRouter): when not
  // injected (tests inject mocks), create a real client so account deletion
  // ALWAYS erases the Keycloak identity.
  // Resolved once here (not per-request) so the admin token cache
  // (55s TTL, see keycloakAdminClient.js) is actually reused across requests.
  const kcAdmin = keycloak || createKeycloakAdminClient();
  const getKeycloak = () => kcAdmin;
  const kcBase = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  const kcRealm = process.env.KEYCLOAK_REALM || 'hhh';

  // GET /api/v1/users/me – return caller's user record (creates default if absent)
  router.get('/me', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);
      const doc = await database.collection('users').findOne({ userId });
      if (doc) {
        const { _id, ...rest } = doc;
        return res.json(rest);
      }
      // Return default without persisting
      return res.json({ userId, preferredLanguage: 'en' });
    } catch (err) {
      log.error({ err: err }, '[usersRouter] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/users/me – update user fields (currently preferredLanguage)
  router.put('/me', async (req, res) => {
    try {
      const { preferredLanguage } = req.body || {};
      if (
        preferredLanguage !== undefined &&
        !SUPPORTED_LANGUAGES.includes(preferredLanguage)
      ) {
        return res.status(400).json({
          error: `preferredLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
        });
      }
      const database = await getDb();
      const userId = String(req.user.sub);
      const update = {};
      if (preferredLanguage !== undefined)
        update.preferredLanguage = preferredLanguage;
      await database
        .collection('users')
        .updateOne(
          { userId },
          { $set: { userId, ...update } },
          { upsert: true }
        );
      const doc = await database.collection('users').findOne({ userId });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/users/me/consent – latest recorded consent for the caller.
  //
  // ?documentSlug=<slug> selects an additional consent document (e.g. a
  // study-specific one). Omitting it means the platform-wide document —
  // deliberately NOT "whichever record is newest". Once a second document
  // exists, "latest overall" would let a study consent satisfy the app's
  // platform re-consent check, and vice versa.
  //
  // Legacy records predate the field entirely; Mongo's `null` equality also
  // matches missing fields, so they resolve as platform consents unchanged.
  router.get('/me/consent', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);
      const slug = req.query.documentSlug;
      const filter = {
        userId,
        documentSlug: slug ? String(slug) : null,
      };
      const doc = await database
        .collection('consents')
        .find(filter)
        .sort({ consentedAt: -1 })
        .limit(1)
        .toArray();
      if (!doc.length)
        return res.status(404).json({ error: 'No consent recorded' });
      const { _id, ...rest } = doc[0];
      res.json(rest);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] consent read error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/users/me/consent – record acceptance of the informed-consent
  // document (append-only audit trail; one record per accepted version).
  router.post('/me/consent', async (req, res) => {
    try {
      const { consentVersion, locale, documentSlug } = req.body || {};
      if (!consentVersion || typeof consentVersion !== 'string') {
        return res.status(400).json({ error: 'consentVersion is required' });
      }
      // Matches the collection validator's pattern. Rejected rather than
      // coerced: a typo'd slug would silently record consent against a
      // document nothing ever reads back, which is the worst outcome for an
      // append-only legal audit trail.
      if (
        documentSlug != null &&
        (typeof documentSlug !== 'string' ||
          !/^[a-z0-9][a-z0-9-]{0,63}$/.test(documentSlug))
      ) {
        return res.status(400).json({ error: 'Invalid documentSlug' });
      }
      const database = await getDb();
      const userId = String(req.user.sub);
      const record = {
        userId,
        consentVersion: String(consentVersion),
        documentSlug: documentSlug ?? null,
        locale: typeof locale === 'string' ? locale : null,
        consentedAt: new Date(),
      };
      await database.collection('consents').insertOne(record);
      const { _id, ...rest } = record;
      res.status(201).json(rest);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] consent write error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Collections that hold documents linked to a participant's userId. Used
  // by the GDPR Art. 20 export below. Account deletion (DELETE /me) does NOT
  // erase these: contributed study data is retained pseudonymously — the
  // linking userId is a random UUID whose Keycloak identity is deleted, so
  // the data can no longer be attributed to a person (see informed-consent
  // and privacy-statement documents, which the deletion dialog links to).
  const USER_COLLECTIONS = [
    'users',
    'profiles',
    'implementation_intentions',
    'daily_behavior_logs',
    'srhi_responses',
    'form_responses',
    'recommendations',
    'recommendation_feedback',
    'deviceTokens',
    'consents',
    HABIT_COMMENTS_COLLECTION,
  ];

  // GET /api/v1/users/me/export – GDPR Art. 20 data portability.
  // Returns every document linked to the caller across all participant
  // collections as a single JSON download (same scope as account deletion).
  //
  // The identity register is deliberately NOT included. A participant in a
  // verified study can hold identifying data there, but this endpoint is
  // authenticated only by the participant's own token — and that token proves
  // control of an account, not of an identity. Returning a name here would let
  // anyone who obtained a session read the person behind it, bypassing the
  // approval workflow entirely. Such requests go through the study site, which
  // holds the register; the response below says so rather than silently
  // omitting it.
  router.get('/me/export', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);

      const data = {};
      for (const name of USER_COLLECTIONS) {
        const docs = await database.collection(name).find({ userId }).toArray();
        data[name] = docs.map(({ _id, ...rest }) => ({
          id: String(_id),
          ...rest,
        }));
      }

      const payload = {
        format: 'health-habit-hub-export/v1',
        exportedAt: new Date().toISOString(),
        userId,
        note:
          'Donated habits are stored anonymously in the habit graph and are ' +
          'not attributable to this account (see the informed-consent document).',
        // Named rather than silently omitted: an Art. 20 response that leaves
        // out a category without saying so is itself a compliance problem.
        identityRegisterNote:
          'If you take part in a study that verifies participant identity, ' +
          'your name and contact details are held separately by the study ' +
          'site, not by this app, and are not included here. Request them ' +
          'from the study team.',
        data,
      };

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="health-habit-hub-export.json"'
      );
      res.json(payload);
    } catch (err) {
      log.error({ err: err }, '[usersRouter] export error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/users/me/rotate-credentials — recovery-passphrase rotation.
  // Resets the Keycloak password only (the username/account stays the same),
  // then re-authenticates so the participant gets a fresh token pair without
  // being signed out. Returns the same shape as POST /onboard so the mobile
  // app can re-derive the 24-word phrase with its existing encoder.
  router.post('/me/rotate-credentials', async (req, res) => {
    try {
      const userId = String(req.user.sub);
      const kc = getKeycloak();

      const token = await kc.getAdminToken();
      const userRes = await fetch(
        `${kcBase}/admin/realms/${kcRealm}/users/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!userRes.ok) {
        return res.status(502).json({ error: 'Failed to look up account.' });
      }
      const kcUser = await userRes.json();
      const username = kcUser.username;

      // Same generation as onboarding (16 bytes → 12 recovery-phrase words).
      const newPassword = randomBytes(16).toString('hex');
      await kc.resetPassword(userId, newPassword);

      const tokenResult = await mintTokenForUser({
        username,
        password: newPassword,
      });
      if (!tokenResult.ok) {
        return res
          .status(502)
          .json({ error: 'Failed to obtain token after credential rotation.' });
      }
      const tokenData = tokenResult.data;

      try {
        const database = await getDb();
        await database.collection('participants').updateOne(
          { userId },
          {
            $set: {
              recoveryPhrase: recoveryPhrasesEnabled()
                ? recoveryPhraseFromCredentials(username, newPassword)
                : null,
            },
          }
        );
      } catch (dbErr) {
        log.warn(
          { err: dbErr?.message },
          '[usersRouter] rotate-credentials: failed to update stored recovery phrase'
        );
      }

      log.info({ userId }, '[usersRouter] credentials rotated');
      res.json({
        username,
        password: newPassword,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      });
    } catch (err) {
      log.error({ err: err }, '[usersRouter] rotate-credentials error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/users/me – App Store Guideline 5.1.1(v) account removal.
  //
  // Removes the participant's *identity*, not their contributed study data:
  //   - the Keycloak account is deleted (nobody can sign in as, or be
  //     identified through, this participant again),
  //   - push device tokens are deleted (a deleted account must not keep
  //     receiving notifications),
  //   - the stored recovery phrase is cleared (credential material for the
  //     now-deleted identity).
  //
  // All study contributions (profiles, logs, questionnaire answers, comments,
  // enrollment, donated habits) are retained: they are keyed only by a random
  // UUID whose identity record no longer exists, so they cannot be traced
  // back to a person. This retention model is what the in-app deletion dialog
  // states, with links to the privacy statement and imprint.
  router.delete('/me', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);

      // Art. 17 now spans two systems. Sever the identity register's ability
      // to resolve this account to a person, before anything else — a
      // deletion that leaves a live link behind is the compliance failure.
      // Never throws: see revokeLink's contract.
      const linkRevocation = await revokeIdentityLink(userId);

      // Stop push notifications to this account's devices.
      const tokensResult = await database
        .collection('deviceTokens')
        .deleteMany({ userId });

      // Clear stored credential material; keep the participant document so
      // study statistics stay intact, but mark when the account was removed.
      try {
        await database
          .collection('participants')
          .updateOne(
            { userId },
            { $set: { recoveryPhrase: null, accountDeletedAt: new Date() } }
          );
      } catch (err) {
        log.warn({ err }, '[usersRouter] participant record update failed');
      }

      const kc = getKeycloak();
      if (kc?.deleteUser) {
        await kc.deleteUser(userId);
      } else {
        log.warn(
          '[usersRouter] no Keycloak admin client available — identity not deleted'
        );
      }

      log.info(
        {
          userId,
          deviceTokensDeleted: tokensResult?.deletedCount ?? 0,
          // Surfaced so a failed revocation is greppable and can be
          // reconciled by an identity-manager erasing the subject directly.
          identityLinkRevoked: linkRevocation?.revoked ?? false,
          identityLinkRevocationFailed: linkRevocation?.failed ?? false,
        },
        '[usersRouter] account identity removed (contributed data retained anonymously)'
      );
      res.status(200).json({ ok: true, identityRemoved: true });
    } catch (err) {
      log.error({ err: err }, '[usersRouter] account deletion error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createUsersRouter;

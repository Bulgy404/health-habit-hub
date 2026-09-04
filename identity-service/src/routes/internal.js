/**
 * Internal API — the ONLY surface HHH talks to.
 *
 * Served on its own port with no Traefik label, so it is unreachable from
 * outside the Docker network. Separate ports rather than path prefixes,
 * deliberately: a Traefik misconfiguration cannot then expose it.
 *
 * NO ROUTE HERE RETURNS PERSONAL DATA. That is a structural property, not a
 * policy — there is simply no handler that decrypts a name. A full compromise
 * of the HHH backend plus the shared secret therefore yields no identities.
 */

import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  reserveCode,
  confirmReservation,
  releaseReservation,
  LinkError,
} from '../services/linkService.js';

/**
 * Constant-time shared-secret check, mirroring app/middleware/requireServiceToken.js.
 * A length-varying compare would leak the secret's length and, over enough
 * requests, its content.
 */
function requireServiceToken(expected) {
  const expectedBuf = Buffer.from(expected, 'utf8');
  return function serviceTokenGuard(req, res, next) {
    const given = req.get('X-Service-Auth-Token');
    if (!given) return res.status(401).json({ error: 'missing_service_token' });
    const givenBuf = Buffer.from(given, 'utf8');
    if (
      givenBuf.length !== expectedBuf.length ||
      !timingSafeEqual(givenBuf, expectedBuf)
    ) {
      return res.status(401).json({ error: 'invalid_service_token' });
    }
    return next();
  };
}

export function createInternalRouter({ db, keys, config, auditor }) {
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  router.use(requireServiceToken(config.serviceSecret));

  router.post('/v1/codes/reserve', async (req, res) => {
    try {
      const out = await reserveCode({
        db,
        keys,
        code: req.body?.code,
        reservationTtlMinutes: config.reservationTtlMinutes,
      });
      void auditor.record({
        actorSub: 'hhh-backend',
        actorRoles: ['service'],
        action: 'reserve_code',
        sensitivity: 'write',
        subjectCode: out.subjectCode,
        route: '/internal/v1/codes/reserve',
        statusCode: 200,
      });
      res.json(out);
    } catch (err) {
      if (err instanceof LinkError) {
        return res
          .status(err.status)
          .json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  router.post('/v1/codes/confirm', async (req, res) => {
    try {
      const out = await confirmReservation({
        db,
        keys,
        reservationId: req.body?.reservationId,
        keycloakSub: req.body?.keycloakSub,
        hhhGroupId: req.body?.hhhGroupId,
      });
      void auditor.record({
        actorSub: 'hhh-backend',
        actorRoles: ['service'],
        action: 'confirm_enrolment',
        sensitivity: 'write',
        subjectCode: out.subjectCode,
        route: '/internal/v1/codes/confirm',
        statusCode: 200,
      });
      res.json(out);
    } catch (err) {
      if (err instanceof LinkError) {
        return res
          .status(err.status)
          .json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  router.post('/v1/codes/release', async (req, res) => {
    // Runs on HHH's error path, so it must never fail loudly enough to mask
    // the original error.
    const out = await releaseReservation({
      db,
      reservationId: req.body?.reservationId,
    });
    res.json(out);
  });

  router.get('/v1/studies/:studyId/linked-count', async (req, res) => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS count
         FROM subject_account_links l
         JOIN subjects s ON s.id = l.subject_id
         JOIN study_registers r ON r.id = s.register_id
        WHERE r.hhh_study_id = $1 AND l.superseded_at IS NULL`,
      [req.params.studyId]
    );
    res.json({ count: rows[0].count });
  });

  return router;
}

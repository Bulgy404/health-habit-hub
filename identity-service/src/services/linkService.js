/**
 * The reserve / confirm / release protocol.
 *
 * This is the only path by which the research platform and the identity
 * register talk to each other, and the invariant it must uphold is simple:
 *
 *   NO PERSONAL DATA CROSSES THIS BOUNDARY. EVER.
 *
 * The only values returned toward HHH are `{ reservationId, hhhStudyId,
 * subjectCode, expiresAt }`. There is deliberately no route on the internal
 * API that returns a name, so even a full compromise of the HHH backend plus
 * the shared service secret yields no identities.
 *
 * Why three steps rather than one:
 *
 *   HHH must create a Neo4j enrolment and a Mongo mirror before the code can
 *   be considered spent, but those live in a different database with no shared
 *   transaction. A single-phase "redeem" would burn the code first and leave a
 *   participant unable to enrol if enrolment then failed — the worse failure,
 *   because it needs a nurse to issue a replacement.
 *
 *   Reserving instead leaves a recoverable state. A crash between reserve and
 *   confirm strands a reservation, which the sweeper returns to 'issued' after
 *   the TTL. That window is the accepted cost, and the sweeper must ship WITH
 *   this code, not after it.
 */

import { blindIndex } from '../crypto/blindIndex.js';
import { encryptField } from '../crypto/envelope.js';
import { normalizeEnrollmentCode } from './codes.js';

export class LinkError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Step 1 — atomically claim a code.
 *
 * The UPDATE ... WHERE status='issued' is the concurrency control: two
 * simultaneous redemptions of the same code, whether from a double-tap or a
 * retry, cannot both match. Postgres serialises them and the loser sees zero
 * rows.
 *
 * @param {{ db, keys, code, reservationTtlMinutes }} deps
 * @returns {Promise<{reservationId, hhhStudyId, subjectCode, expiresAt}>}
 */
export async function reserveCode({ db, keys, code, reservationTtlMinutes }) {
  const normalized = normalizeEnrollmentCode(code);
  if (!normalized) throw new LinkError('invalid_code', 'Code is required');

  const codeHash = blindIndex(keys.peppers.code, normalized);

  const { rows } = await db.query(
    `UPDATE enrollment_codes ec
        SET status = 'reserved',
            reservation_id = gen_random_uuid(),
            reserved_at = now()
      WHERE ec.code_hash = $1
        AND ec.status = 'issued'
        AND (ec.expires_at IS NULL OR ec.expires_at > now())
      RETURNING ec.id,
                ec.reservation_id,
                ec.subject_id,
                ec.expires_at`,
    [codeHash]
  );

  if (rows.length === 0) {
    // Deliberately one generic error for "no such code", "already redeemed",
    // "reserved by someone else" and "expired". Distinguishing them would let
    // an attacker probe which codes exist.
    throw new LinkError(
      'code_not_redeemable',
      'This code is not valid, has already been used, or has expired.',
      404
    );
  }

  const reservation = rows[0];

  const { rows: subjectRows } = await db.query(
    `SELECT s.subject_code, r.hhh_study_id
       FROM subjects s
       JOIN study_registers r ON r.id = s.register_id
      WHERE s.id = $1`,
    [reservation.subject_id]
  );
  if (subjectRows.length === 0) {
    throw new LinkError('subject_missing', 'Subject not found', 500);
  }

  // Exactly these four fields. Adding anything person-identifying here would
  // silently defeat the boundary, so the shape is asserted in tests.
  return {
    reservationId: reservation.reservation_id,
    hhhStudyId: subjectRows[0].hhh_study_id,
    subjectCode: subjectRows[0].subject_code,
    expiresAt: reservation.expires_at,
  };
}

/**
 * Step 2 — HHH has enrolled the participant; record the link.
 *
 * A subject may accumulate several links over time: losing the 24-word
 * passphrase means a new Keycloak `sub`, and that participant must not appear
 * in the research data as two people. The previous link is superseded rather
 * than deleted, so the history stays auditable.
 */
export async function confirmReservation({
  db,
  keys,
  reservationId,
  keycloakSub,
  hhhGroupId,
}) {
  if (!reservationId)
    throw new LinkError('invalid_request', 'reservationId is required');
  if (!keycloakSub)
    throw new LinkError('invalid_request', 'keycloakSub is required');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, subject_id FROM enrollment_codes
        WHERE reservation_id = $1 AND status = 'reserved'
        FOR UPDATE`,
      [reservationId]
    );
    if (rows.length === 0) {
      throw new LinkError(
        'reservation_not_found',
        'No active reservation with that id. It may have been swept after timing out.',
        409
      );
    }
    const { id: codeId, subject_id: subjectId } = rows[0];

    // Supersede any existing live link before inserting the new one — the
    // partial unique index allows only one un-superseded link per subject.
    await client.query(
      `UPDATE subject_account_links
          SET superseded_at = now()
        WHERE subject_id = $1 AND superseded_at IS NULL`,
      [subjectId]
    );

    await client.query(
      `INSERT INTO subject_account_links
         (subject_id, keycloak_sub_ct, keycloak_sub_bi, hhh_group_id)
       VALUES ($1, $2, $3, $4)`,
      [
        subjectId,
        encryptField({
          key: await deriveSubjectDek({ db: client, keys, subjectId }),
          subjectId,
          fieldName: 'keycloak_sub',
          plaintext: keycloakSub,
        }),
        blindIndex(keys.peppers.keycloakSub, keycloakSub),
        hhhGroupId ?? null,
      ]
    );

    await client.query(
      `UPDATE enrollment_codes
          SET status = 'redeemed', redeemed_at = now()
        WHERE id = $1`,
      [codeId]
    );
    await client.query(
      `UPDATE subjects SET status = 'enrolled', updated_at = now() WHERE id = $1`,
      [subjectId]
    );

    const { rows: codeRows } = await client.query(
      `SELECT subject_code FROM subjects WHERE id = $1`,
      [subjectId]
    );

    await client.query('COMMIT');
    return { ok: true, subjectCode: codeRows[0].subject_code };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Step 3 — HHH's enrolment failed; hand the code back immediately.
 *
 * Idempotent, and never throws for an unknown reservation: this runs on the
 * error path, and a failure here must not mask the original error that caused
 * the rollback.
 */
export async function releaseReservation({ db, reservationId }) {
  if (!reservationId) return { released: false };
  const { rowCount } = await db.query(
    `UPDATE enrollment_codes
        SET status = 'issued', reservation_id = NULL, reserved_at = NULL
      WHERE reservation_id = $1 AND status = 'reserved'`,
    [reservationId]
  );
  return { released: rowCount > 0 };
}

/**
 * Reclaim reservations abandoned mid-protocol.
 *
 * Ships WITH the protocol, not after it: without this a crash between reserve
 * and confirm permanently burns a code, and the participant needs a nurse to
 * issue a replacement.
 */
export async function sweepStaleReservations({ db, ttlMinutes = 10 }) {
  const { rowCount } = await db.query(
    `UPDATE enrollment_codes
        SET status = 'issued', reservation_id = NULL, reserved_at = NULL
      WHERE status = 'reserved'
        AND reserved_at < now() - ($1 || ' minutes')::interval`,
    [String(ttlMinutes)]
  );
  return { reclaimed: rowCount };
}

/** Unwrap the register's DEK for the register owning this subject. */
async function deriveSubjectDek({ db, keys, subjectId }) {
  const { rows } = await db.query(
    `SELECT r.id, r.dek_wrapped, r.kek_version
       FROM study_registers r
       JOIN subjects s ON s.register_id = r.id
      WHERE s.id = $1`,
    [subjectId]
  );
  if (rows.length === 0) {
    throw new LinkError('register_missing', 'Register not found', 500);
  }
  const { unwrapDek } = await import('../crypto/envelope.js');
  return unwrapDek({
    kek: keys.kek,
    registerId: rows[0].id,
    kekVersion: rows[0].kek_version,
    wrapped: rows[0].dek_wrapped,
  });
}

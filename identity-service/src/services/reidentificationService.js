/**
 * Re-identification: turning a subject code back into a person.
 *
 * This is the capability the whole design exists to control, so it is
 * deliberately expensive to use:
 *
 *   REQUEST   a stated legal basis and a substantive reason (>= 50 chars,
 *             enforced by a database CHECK, not just here)
 *   APPROVE   by a DIFFERENT principal — the four-eyes rule is a database
 *             trigger, so it survives a refactor of this file
 *   REVEAL    only the requester, only inside the TTL, only that subject, only
 *             the fields asked for, and every reveal is logged un-deduplicated
 *
 * There is NO bulk reveal, and no endpoint that accepts a list of subject
 * codes. That absence is the property that makes "quietly de-anonymise the
 * cohort" not something the software can do, regardless of who is logged in.
 *
 * Stated plainly for the DPIA: this is non-repudiation, not prevention. A
 * Keycloak realm admin can always mint a principal. What the controls
 * guarantee is that doing so is visible, not that it is impossible.
 */

import { decryptField } from '../crypto/envelope.js';
import { blindIndex } from '../crypto/blindIndex.js';
import { registerDek, PII_FIELDS } from './subjectService.js';

export class ReidError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Fields a request may ask for. Anything else is rejected outright. */
export const REVEALABLE_FIELDS = Object.freeze(Object.keys(PII_FIELDS));

const SAFETY_BASES = Object.freeze([
  'sae',
  'safety_report',
  'regulatory_inspection',
]);

export const LEGAL_BASES = Object.freeze([
  ...SAFETY_BASES,
  'participant_request',
  'data_correction',
  'other',
]);

export function isSafetyBasis(basis) {
  return SAFETY_BASES.includes(basis);
}

/**
 * Raise a request.
 *
 * `deanonymize_account` (sub → person, "who is user 8f3a…?") is a separate
 * request type rather than a variant, so the audit log can distinguish "we
 * needed to contact subject 0042" from "we needed to find out who this account
 * belongs to". Those are very different acts, and only the second is
 * restricted to safety bases.
 */
export async function createRequest({
  db,
  keys,
  registerId,
  actorSub,
  requestType = 'identify_subject',
  subjectCode = null,
  keycloakSub = null,
  legalBasis,
  reason,
  fieldsRequested,
  approversRequired = 1,
}) {
  if (!['identify_subject', 'deanonymize_account'].includes(requestType)) {
    throw new ReidError('invalid_request_type', 'Unknown request type');
  }
  if (![1, 2].includes(approversRequired)) {
    throw new ReidError(
      'invalid_approver_count',
      'approversRequired must be 1 or 2'
    );
  }
  if (!LEGAL_BASES.includes(legalBasis)) {
    throw new ReidError('invalid_legal_basis', 'Unknown legal basis');
  }
  if (typeof reason !== 'string' || reason.trim().length < 50) {
    throw new ReidError(
      'reason_too_short',
      'A re-identification reason must be at least 50 characters. It is read ' +
        'by the approver and by any later auditor.'
    );
  }
  if (!Array.isArray(fieldsRequested) || fieldsRequested.length === 0) {
    throw new ReidError(
      'no_fields_requested',
      'At least one field must be requested'
    );
  }
  const unknown = fieldsRequested.filter((f) => !REVEALABLE_FIELDS.includes(f));
  if (unknown.length > 0) {
    throw new ReidError(
      'unknown_field',
      `Not revealable: ${unknown.join(', ')}`
    );
  }
  if (requestType === 'deanonymize_account' && !isSafetyBasis(legalBasis)) {
    throw new ReidError(
      'basis_not_permitted',
      'Reverse lookup from an account to a person is restricted to safety and ' +
        'regulatory bases.'
    );
  }
  if (requestType === 'identify_subject' && !subjectCode) {
    throw new ReidError('missing_target', 'subjectCode is required');
  }
  if (requestType === 'deanonymize_account' && !keycloakSub) {
    throw new ReidError('missing_target', 'keycloakSub is required');
  }

  const { rows } = await db.query(
    `INSERT INTO reidentification_requests
       (register_id, subject_code, keycloak_sub_bi, request_type, legal_basis,
        reason, fields_requested, approvers_required, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, status, requested_at`,
    [
      registerId,
      requestType === 'identify_subject' ? subjectCode : null,
      requestType === 'deanonymize_account'
        ? blindIndex(keys.peppers.keycloakSub, keycloakSub)
        : null,
      requestType,
      legalBasis,
      reason.trim(),
      fieldsRequested,
      approversRequired,
      actorSub,
    ]
  );
  return {
    id: rows[0].id,
    status: rows[0].status,
    requestedAt: rows[0].requested_at,
  };
}

/**
 * Approve or reject.
 *
 * The four-eyes rule is NOT checked here — it is a BEFORE INSERT trigger on
 * reidentification_approvals. Enforcing it in the database means it cannot be
 * dropped by a later refactor of this service, and it is the constraint an
 * auditor will ask to see.
 */
export async function decide({
  db,
  requestId,
  approverSub,
  decision,
  note = null,
  revealTtlMinutes = 60,
}) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ReidError(
      'invalid_decision',
      'decision must be approved or rejected'
    );
  }
  if (
    !Number.isInteger(revealTtlMinutes) ||
    revealTtlMinutes < 5 ||
    revealTtlMinutes > 1440
  ) {
    throw new ReidError(
      'invalid_reveal_ttl',
      'revealTtlMinutes must be an integer from 5 to 1440'
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status, approvers_required FROM reidentification_requests
        WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (rows.length === 0) {
      throw new ReidError('request_not_found', 'Request not found', 404);
    }
    if (rows[0].status !== 'pending') {
      throw new ReidError(
        'already_decided',
        `Request is already ${rows[0].status}`,
        409
      );
    }

    try {
      await client.query(
        `INSERT INTO reidentification_approvals (request_id, approver_sub, decision, note)
         VALUES ($1,$2,$3,$4)`,
        [requestId, approverSub, decision, note]
      );
    } catch (err) {
      if (/four-eyes/i.test(err.message)) {
        throw new ReidError(
          'four_eyes_violation',
          'You cannot approve your own re-identification request.',
          403
        );
      }
      if (/one_decision_per_approver|unique/i.test(err.message)) {
        throw new ReidError(
          'already_voted',
          'You have already decided on this request',
          409
        );
      }
      throw err;
    }

    if (decision === 'rejected') {
      await client.query(
        `UPDATE reidentification_requests
            SET status = 'rejected', decided_at = now() WHERE id = $1`,
        [requestId]
      );
      await client.query('COMMIT');
      return { status: 'rejected' };
    }

    const { rows: counts } = await client.query(
      `SELECT count(*)::int AS n FROM reidentification_approvals
        WHERE request_id = $1 AND decision = 'approved'`,
      [requestId]
    );

    if (counts[0].n >= rows[0].approvers_required) {
      await client.query(
        `UPDATE reidentification_requests
            SET status = 'approved',
                decided_at = now(),
                reveal_expires_at = now() + ($2 || ' minutes')::interval
          WHERE id = $1`,
        [requestId, String(revealTtlMinutes)]
      );
      await client.query('COMMIT');
      return { status: 'approved', approvals: counts[0].n };
    }

    await client.query('COMMIT');
    return {
      status: 'pending',
      approvals: counts[0].n,
      required: rows[0].approvers_required,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reveal — the only path that returns plaintext identity.
 *
 * Five conditions, all required: approved, unexpired, the original requester,
 * that one subject, and only the fields named in the request.
 */
export async function reveal({ db, keys, requestId, actorSub }) {
  const { rows } = await db.query(
    `SELECT id, register_id, subject_code, keycloak_sub_bi, request_type,
            legal_basis, fields_requested, status, requested_by,
            reveal_expires_at, reveal_count
       FROM reidentification_requests WHERE id = $1`,
    [requestId]
  );
  if (rows.length === 0) {
    throw new ReidError('request_not_found', 'Request not found', 404);
  }
  const req = rows[0];

  if (req.requested_by !== actorSub) {
    throw new ReidError(
      'not_requester',
      'Only the original requester may view an approved reveal.',
      403
    );
  }
  if (req.status !== 'approved') {
    throw new ReidError('not_approved', `Request is ${req.status}`, 403);
  }
  if (!req.reveal_expires_at || new Date(req.reveal_expires_at) < new Date()) {
    // Mark it expired so the state is durable, not merely computed.
    await db.query(
      `UPDATE reidentification_requests SET status = 'expired' WHERE id = $1`,
      [requestId]
    );
    throw new ReidError(
      'reveal_expired',
      'The approval window has closed.',
      403
    );
  }

  const subject = await loadTargetSubject({ db, req });
  const dek = await registerDek({ db, keys, registerId: req.register_id });

  // ONLY the requested fields. Asking for a phone number does not also hand
  // over an address.
  const revealed = {};
  for (const field of req.fields_requested) {
    const column = `${PII_FIELDS[field]}_ct`;
    revealed[field] = decryptField({
      key: dek,
      subjectId: subject.id,
      fieldName: PII_FIELDS[field],
      ciphertext: subject[column] ?? null,
    });
  }

  // RETURNING the new value rather than computing it: two concurrent reveals
  // must not both report the same count, and this row is the authority.
  const { rows: counted } = await db.query(
    `UPDATE reidentification_requests
        SET reveal_count = reveal_count + 1
      WHERE id = $1
      RETURNING reveal_count`,
    [requestId]
  );

  return {
    subjectCode: subject.subject_code,
    fields: revealed,
    // Returned so the caller can attribute the reveal accurately in the
    // audit trail and the DPO alert without a second query.
    legalBasis: req.legal_basis,
    revealCount: counted[0].reveal_count,
    expiresAt: req.reveal_expires_at,
  };
}

async function loadTargetSubject({ db, req }) {
  const columns = `id, subject_code, ${Object.values(PII_FIELDS)
    .map((f) => `${f}_ct`)
    .join(', ')}`;

  if (req.request_type === 'identify_subject') {
    const { rows } = await db.query(
      `SELECT ${columns} FROM subjects WHERE register_id = $1 AND subject_code = $2`,
      [req.register_id, req.subject_code]
    );
    if (rows.length === 0) {
      // Also the Art. 17 case: the person was erased, so there is nothing to
      // reveal. That is the intended outcome, not an error to work around.
      throw new ReidError(
        'subject_not_found',
        'No such subject. It may have been erased under Art. 17.',
        404
      );
    }
    return rows[0];
  }

  const { rows } = await db.query(
    `SELECT ${columns
      .split(', ')
      .map((c) => `s.${c}`)
      .join(', ')}
       FROM subjects s
       JOIN subject_account_links l ON l.subject_id = s.id
      WHERE s.register_id = $1 AND l.keycloak_sub_bi = $2
      ORDER BY l.linked_at DESC LIMIT 1`,
    [req.register_id, req.keycloak_sub_bi]
  );
  if (rows.length === 0) {
    throw new ReidError(
      'account_not_linked',
      'That account is not linked to a subject',
      404
    );
  }
  return rows[0];
}

/** A monitor may revoke an approved-but-unused grant. */
export async function revoke({ db, requestId }) {
  const { rowCount } = await db.query(
    `UPDATE reidentification_requests
        SET status = 'revoked'
      WHERE id = $1 AND status = 'approved'`,
    [requestId]
  );
  return { revoked: rowCount > 0 };
}

/** Background sweep so an unused grant does not stay open indefinitely. */
export async function expireStaleApprovals({ db }) {
  const { rowCount } = await db.query(
    `UPDATE reidentification_requests
        SET status = 'expired'
      WHERE status = 'approved' AND reveal_expires_at < now()`
  );
  return { expired: rowCount };
}

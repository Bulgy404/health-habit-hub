/**
 * The ONLY coupling between the research platform and the identity register.
 *
 * Deliberately tiny: two environment variables and this file are the entire
 * relocation cost if the register ever moves to university hosting.
 *
 * Nothing here can return personal data — the internal API has no route that
 * does. That is enforced on the far side rather than trusted here, but call
 * sites should still treat anything beyond `{reservationId, hhhStudyId,
 * subjectCode}` as a bug.
 */

import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'identityLinkClient' });

/** Identity-mode enrolment is only reachable when BOTH of these are set. */
export function identityServiceConfigured() {
  return Boolean(
    process.env.IDENTITY_SERVICE_URL && process.env.IDENTITY_SERVICE_SECRET
  );
}

class IdentityServiceError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(path, body, { timeoutMs = 8000 } = {}) {
  if (!identityServiceConfigured()) {
    throw new IdentityServiceError(
      'identity_service_unconfigured',
      'Identity service is not configured',
      503
    );
  }
  const base = process.env.IDENTITY_SERVICE_URL.replace(/\/+$/, '');

  // A bounded timeout matters here: this sits in the participant's enrolment
  // path, and a hung register must surface as a clear failure rather than a
  // spinner the participant stares at.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth-Token': process.env.IDENTITY_SERVICE_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!res.ok) {
      throw new IdentityServiceError(
        payload?.error ?? 'identity_service_error',
        payload?.message ?? `Identity service returned ${res.status}`,
        res.status
      );
    }
    return payload;
  } catch (err) {
    if (err instanceof IdentityServiceError) throw err;
    if (err.name === 'AbortError') {
      throw new IdentityServiceError(
        'identity_service_timeout',
        'Identity service did not respond in time',
        504
      );
    }
    throw new IdentityServiceError(
      'identity_service_unreachable',
      'Identity service is unreachable',
      503
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Step 1 — claim the code. Returns routing data only, never PII. */
export function reserve(code) {
  return call('/internal/v1/codes/reserve', { code });
}

/** Step 2 — enrolment succeeded; record the link. */
export function confirm({ reservationId, keycloakSub, hhhGroupId }) {
  return call('/internal/v1/codes/confirm', {
    reservationId,
    keycloakSub,
    hhhGroupId,
  });
}

/**
 * Step 3 — enrolment failed; hand the code back.
 *
 * Never throws. This runs on the error path, and a failure here must not mask
 * the original error. A lost release is recoverable: the register's sweeper
 * reclaims the reservation after its TTL.
 */
export async function release(reservationId) {
  try {
    return await call('/internal/v1/codes/release', { reservationId });
  } catch (err) {
    log.warn(
      { err, reservationId },
      'failed to release identity reservation; the sweeper will reclaim it'
    );
    return { released: false };
  }
}

export { IdentityServiceError };

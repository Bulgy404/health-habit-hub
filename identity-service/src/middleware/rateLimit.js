/**
 * Rate limiting.
 *
 * Mirrors `app/middleware/rateLimiter.js` so there is one idiom across the
 * platform, with two differences that matter here.
 *
 * **The internal API is limited too.** It is reachable only by the HHH backend
 * over a shared secret, so at first glance a limiter buys nothing. It buys the
 * one thing that matters: `POST /internal/v1/codes/reserve` takes an enrolment
 * code and looks it up by keyed digest, so a compromised backend — or anything
 * that obtains the service token — could otherwise walk the `HHV-` keyspace at
 * full speed. A code is a bearer credential that enrols someone *as a specific
 * identified subject*; guessing one is worth slowing down. The limit is
 * generous enough that a real enrolment burst at a study site never reaches it.
 *
 * **Reveal is limited separately and far more tightly.** Every reveal already
 * needs an approved, time-limited grant, so this is not the primary control —
 * but the endpoint returns plaintext identity, and an endpoint that does that
 * should not also be the one place with a three-figure budget.
 */

import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

/**
 * Prefer the authenticated subject over the IP.
 *
 * Study sites are behind institutional NAT, so several nurses working a clinic
 * afternoon share one address. Keying on the IP alone would let one busy
 * colleague exhaust everyone else's budget.
 */
function userOrIpKey(req) {
  return req.user?.sub || ipKeyGenerator(req.ip);
}

const json429 = (message) => (_req, res) =>
  res.status(429).json({ error: 'rate_limited', message });

/**
 * Broad limiter for the public API, mounted BEFORE authentication so that
 * failed token verification is covered too — otherwise the one path an
 * unauthenticated caller can reach is the one path with no limit.
 *
 * `/api/v1/health` is exempt: Prometheus polls it on a timer, and counting a
 * monitoring probe against an abuse budget would 429 the register during an
 * incident, which is precisely when it needs to be reachable.
 */
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: (req) => req.path === '/api/v1/health',
  handler: json429('Too many requests. Please try again shortly.'),
});

/**
 * The only endpoint that returns plaintext identity.
 *
 * Deliberately not "per approved request" — a limit that resets with each new
 * approval would not be a limit. Keyed on the actor.
 */
export const revealLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: json429(
    'Too many re-identifications in one hour. This limit is deliberate: ' +
      'if you genuinely need more, that is a conversation to have with the ' +
      'data protection officer rather than a threshold to raise quietly.'
  ),
});

/**
 * The internal API. One caller (the HHH backend), so the key is the IP and the
 * budget is per-instance rather than per-participant.
 *
 * Sized for a study site enrolling a cohort in an afternoon — several hundred
 * redemptions is fine — while still bounding a keyspace walk against
 * `codes/reserve`.
 */
export const internalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  skip: (req) => req.path === '/internal/v1/health',
  handler: json429('Too many requests from the backend.'),
});

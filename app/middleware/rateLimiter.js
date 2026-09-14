import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

function userOrIpKey(req) {
  return req.user?.sub || ipKeyGenerator(req.ip);
}

/**
 * General API rate limiter: max 100 requests per 15 minutes per user/IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  // The admin System-health dashboard polls these read-only, admin-gated
  // endpoints on a timer. Counting a background monitoring widget against the
  // general 100-req/15-min abuse budget would exhaust it and 429 the whole
  // portal, so exempt GETs under /admin/system/ (still behind auth + role).
  skip: (req) => req.method === 'GET' && req.path.startsWith('/admin/system/'),
  handler(_req, res) {
    res
      .status(429)
      .json({ error: 'Too many requests, please try again later.' });
  },
});

/**
 * Rate limiter for the internal service-to-service routes.
 *
 * These are mounted before `authenticate` and carry no JWT, so under the
 * general limiter they keyed on IP — and every call comes from one container,
 * which put the whole deployment's recommendations under a single
 * 100-request/15-minute budget. `API-service` makes roughly three of these
 * calls per recommendation, so that ceiling was about 33 recommendations per
 * quarter hour for all participants combined. Before the IP key generator was
 * fixed the limiter silently never fired, which is why this was never felt.
 *
 * These callers are already authenticated by a shared secret, so an abuse
 * budget is the wrong control here. What is still worth having is a backstop
 * against a runaway retry loop, which is what this is: a rate no healthy
 * caller reaches and no loop stays under. Keyed on the service rather than the
 * IP, because the address a container presents is an accident of networking.
 */
export const serviceRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'internal-service',
  handler(_req, res) {
    res.status(429).json({
      error: 'Internal service rate limit exceeded.',
    });
  },
});

/**
 * Rate limiter for habit share/donate: max 200 submissions per hour per user.
 */
export const habitShareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler(_req, res) {
    res.status(429).json({
      error:
        'Habit donation rate limit exceeded. You can submit up to 200 habits per hour.',
    });
  },
});

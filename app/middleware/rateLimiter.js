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

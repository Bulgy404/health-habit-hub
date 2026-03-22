import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

/**
 * Rate limiter: max 100 requests per 15 minutes per authenticated token (sub claim).
 * Falls back to IP address if no JWT sub is present (e.g., unauthenticated health endpoint).
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    return req.user?.sub || ipKeyGenerator(req);
  },
  handler(_req, res) {
    res
      .status(429)
      .json({ error: 'Too many requests, please try again later.' });
  },
});

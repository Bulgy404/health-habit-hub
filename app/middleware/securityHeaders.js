import { randomBytes } from 'node:crypto';

/**
 * Attach baseline HTTP security headers and a per-request CSP nonce.
 *
 * The nonce is stored on res.locals.cspNonce so that any route that
 * generates an HTML response (e.g. the survey embed) can inject it into
 * inline <script> and <style> tags without relaxing script-src to 'unsafe-inline'.
 */
export function securityHeaders(_req, res, next) {
  const nonce = randomBytes(16).toString('base64url');
  res.locals.cspNonce = nonce;

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://unpkg.com`,
    `style-src 'self' 'nonce-${nonce}' https://unpkg.com`,
    `img-src 'self' data:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
}

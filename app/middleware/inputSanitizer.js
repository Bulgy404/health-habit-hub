/**
 * Input sanitization middleware.
 * Recursively strips HTML tags from all string values in req.body.
 * Applied to all POST/PUT requests.
 */

// Bounded HTML tag regex (avoids unbounded backtracking / ReDoS risk).
const HTML_TAG_RE = /<[^>]{0,2000}>/g;

function stripHtml(value) {
  if (typeof value === 'string') {
    // Strip tags first, then any bare angle brackets left over from
    // truncated/incomplete tag sequences (e.g. "</", "<", ">").
    return value.replace(HTML_TAG_RE, '').replace(/[<>]/g, '');
  }
  if (Array.isArray(value)) return value.map(stripHtml);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = stripHtml(value[k]);
    }
    return out;
  }
  return value;
}

export function sanitizeBody(req, _res, next) {
  if (
    (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') &&
    req.body
  ) {
    req.body = stripHtml(req.body);
  }
  next();
}

/**
 * Input sanitization middleware.
 * Recursively strips HTML tags from all string values in req.body.
 * Applied to all POST/PUT requests.
 */

const HTML_TAG_RE = /<[^>]*>/g;

function stripHtml(value) {
  if (typeof value === 'string') return value.replace(HTML_TAG_RE, '');
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

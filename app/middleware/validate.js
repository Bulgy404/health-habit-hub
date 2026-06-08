/**
 * Express middleware factory for Zod request-body validation.
 *
 * Usage:
 *   router.post('/studies', validate(createStudySchema), handler)
 *
 * On parse failure the response is 400 JSON:
 *   { error: 'Validation failed', details: [{ path, message }, ...] }
 *
 * @param {import('zod').ZodTypeAny} schema
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Create a middleware that allows access only if the authenticated user holds at least one of the specified roles.
 * @param {...string} roles - One or more Keycloak realm roles to check.
 * @returns {import('express').RequestHandler} Middleware that responds 403 if the user lacks all given roles.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const userRoles = req.user?.realm_access?.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));
    if (!hasRole) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

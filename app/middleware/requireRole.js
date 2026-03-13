export function requireRole(...roles) {
  return (req, res, next) => {
    const userRoles = req.user?.realm_access?.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));
    if (!hasRole) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

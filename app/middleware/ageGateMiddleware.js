import path from 'path';
const contextPath = process.env.APP_BASE_PATH || '/';

export function requireAgeConsent(req, res, next) {
  console.log('🛂 Age consent middleware check:', req.originalUrl);

  const consentGiven = req.cookies.ageConfirmed === 'true';

  if (
    req.originalUrl.includes('/disclaimer') ||
    req.originalUrl.includes('/imprint') ||
    req.originalUrl.includes('/privacy') ||
    req.originalUrl.includes('/accessibility')
  ) {
    return next();
  }

  if (!consentGiven) {
    const redirectUrl = path.join(contextPath, req.lang, 'disclaimer');

    console.log('🔴 No consent — redirecting to:', redirectUrl);
    return res.redirect(302, redirectUrl);
  }

  console.log('🟢 Age consent passed');
  next();
}

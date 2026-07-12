# Security Policy

Health Habit Hub is a proprietary research platform operated by TU Dresden
(Chair of Business Informatics, esp. Health Informatics). It processes
personal health-related study data, so security reports are taken seriously.

## Supported Versions

Only the latest deployed version (`main` branch / production at
https://habit.wiwi.tu-dresden.de) receives security fixes.

## Reporting a Vulnerability

Please report vulnerabilities **privately** — do not open a public GitHub issue.

- Email: **felix.reinsch@tu-dresden.de** (subject: `[SECURITY] Health Habit Hub`)
- Include: affected component (`app/`, `admin/`, `API-service/`, `mobile/`, infrastructure), reproduction steps, and impact assessment.

You can expect an acknowledgement within 5 working days. Please allow a
reasonable disclosure window before sharing details publicly.

## Scope Notes

- Authentication and authorization are handled by Keycloak (OIDC); role
  enforcement lives in `app/middleware/` and `admin/src/middleware.ts`.
- Account recovery uses a one-time passphrase (`app/utils/recoveryPhrase.js`)
  that re-encodes the Keycloak username/password with no server-side secret
  or KDF, so brute-force resistance relies entirely on the per-IP rate limit
  in `app/routes/restoreRouter.js` (5/hour) and admin review of flagged IPs
  in the restore-attempts view. Report any bypass of that rate limit, or any
  way to enumerate valid recovery phrases, as a vulnerability.
- Secrets are provided via `.env` (git-ignored) — see `.env.example`.
  Never commit credentials.
- Current, open findings are tracked in [BUG_AUDIT.md](BUG_AUDIT.md); past
  audits (resolved) are archived under [docs/archive/](docs/archive/).

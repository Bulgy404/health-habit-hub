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
- Secrets are provided via `.env` (git-ignored) — see `.env.example`.
  Never commit credentials.
- Past findings and resolutions are tracked in [AUDIT.md](AUDIT.md).

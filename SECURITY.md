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

## Data Protection Model (rationale)

This records the deliberate design and why it is considered adequate for the
data we hold. **This is the current model; we are keeping it for now.**

- **Anonymous accounts.** No name, email, or phone number is collected.
  Identity is a random UUID (Keycloak `sub`). All behaviour/study data is
  *pseudonymous*, keyed to that UUID — there is no real-world identifier to
  leak in the first place.
- **On-device passphrase.** At account creation the app generates a random
  credential (UUID + 16-byte / 128-bit CSPRNG password) and encodes it as a
  24-word BIP39 recovery phrase (`app/utils/recoveryPhrase.js`). The phrase is
  produced **on the device**, shown **once**, and is not retained server-side
  in any recoverable form — losing it means the account cannot be recovered by
  anyone, including operators.
- **Why "no KDF" is acceptable here.** A KDF (Argon2id/bcrypt/PBKDF2) exists to
  make *low-entropy, human-chosen* secrets expensive to brute-force. Our
  underlying secret is a 128-bit random password, so brute-forcing the phrase
  is computationally infeasible regardless of KDF. The per-IP restore rate
  limit (5/hour, `app/routes/restoreRouter.js`) is defense-in-depth, not the
  primary control. ⚠️ **If the password is ever shortened or made
  human-memorable, a KDF becomes mandatory.**
- **In transit.** All public endpoints are TLS-only (Let's Encrypt via
  Traefik).
- **At rest.** Stored secrets (e.g. participant passwords) are bcrypt-hashed.
  There is **no application-level field encryption**: researchers require
  plaintext access to export and analyse study data, so participant-only /
  end-to-end encryption is intentionally out of scope — it would be
  incompatible with the platform's core research-export function.
  TODO: confirm and document disk/volume-level encryption-at-rest on the TU
  Dresden storage backing MongoDB/Neo4j (infra-level; no app change required).
- **Authorization.** Keycloak OIDC roles (participant/researcher/admin),
  enforced in `app/middleware/` and `admin/src/middleware.ts`.

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

## Verified Identity Mode (optional, per study)

An **opt-in, per-study** mode for clinical studies that must identify their
participants. It does **not** change the model above — it adds a second,
separate one alongside it.

- **Anonymous studies are unaffected.** `identity.mode` is absent on every
  existing study and defaults to `anonymous`; the code path is never entered,
  exports are unchanged, and the register need not be deployed at all.
- **PII never enters the research databases.** Names, dates of birth and
  contact details live only in a separate service with its own PostgreSQL
  database, its own credentials and its own key. MongoDB and Neo4j hold a
  study-local **subject code** (e.g. `TUD-DFG01-0042`) and nothing else.
- **The "no application-level field encryption" rationale above stays true for
  the research databases and is deliberately INVERTED for the register.** Every
  identifying field there is AES-256-GCM encrypted under a per-register data
  key, with the AAD bound to both the row id and the column name — so
  ciphertext cannot be moved between rows or between fields by an attacker
  holding `UPDATE` but not the key.
- **Keys.** One 32-byte master key, mounted as a `0400` **file** rather than an
  environment variable (env leaks via `docker inspect`, `/proc/<pid>/environ`
  and crash dumps). Everything else is HKDF-derived. Key-encryption and
  blind-index versions rotate independently.
- **Separation of duties, enforced at runtime.** An account holding
  `researcher` may never hold an identity role — the person analysing the
  pseudonymous data cannot resolve the pseudonyms. Re-identification requires a
  stated legal basis, a second approver (enforced by a database trigger), and a
  time-limited grant; every reveal is recorded permanently and is never
  deduplicated. There is no bulk-reveal endpoint and none that accepts a list
  of subject codes.
- **Network isolation.** The register shares no Docker network with `mongo` or
  `neo4j`, asserted by a CI test against `docker-compose.yml`.

**Honest limitation, stated for the DPIA:** these controls give
**non-repudiation, not prevention**. A Keycloak realm administrator can always
mint a principal; what is guaranteed is that doing so is visible in an audit
trail no HHH admin can alter. Blind indexes are deterministic and therefore
reveal *equality* — that a value is shared between two rows — though not the
value itself without the pepper.

See [`docs/identity-mode-plan.md`](docs/identity-mode-plan.md) for the design
and [`docs/identity-register.md`](docs/identity-register.md) for the operator
runbook.

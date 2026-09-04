# Identity Service

The identity register for verified-identity studies. Holds the
`subject code ↔ person` mapping for clinical studies that must identify
participants, in **its own database, encrypted, isolated from the research
platform**.

See [`docs/identity-mode-plan.md`](../docs/identity-mode-plan.md) for the full
design and the decisions behind it.

## The invariant

> PII exists in exactly one process, one database, and one backup destination.
> HHH learns a study-local subject code and nothing else. The `researcher` role
> can never reach PII.

Anonymous studies are entirely unaffected. `identity.mode` is absent on every
existing study and defaults to `anonymous`; if no verified study is ever run,
this service need not be deployed at all.

## Why Postgres

Using a **different engine** from the research databases makes it structurally
impossible for this register to be swept into `mongodump`
(`backup-service/backup.sh`) or into `studyExportService`'s collection loop.
That mistake would require a code change, not a mis-set connection string.

All encryption happens **in Node, never in Postgres** — no `pgcrypto` for
crypto. The database never sees a key, so a stolen dump is inert on its own.

## Key management

One 32-byte master key is the only secret. Everything else is derived from it
with HKDF-SHA256 (`src/crypto/keys.js`).

```bash
openssl rand -base64 32
```

Mount it as a **file with mode 0400**, never an environment variable —
env leaks via `docker inspect`, `/proc/<pid>/environ` and crash dumps.

KEK version and blind-index version rotate **independently**: rotating the KEK
only rewraps per-register DEKs (cheap, no plaintext touched), whereas rotating
a pepper invalidates every blind index and requires re-indexing every subject.

## What is deliberately absent

- **No searchable name index.** No n-gram, prefix or substring index over
  names. At clinical-study scale a trigram index over German surnames is
  trivially frequency-analysable — it would hand an attacker a substitution
  cipher with a publicly known plaintext distribution. Nurse name search
  decrypts the register in memory instead.
- **No bulk reveal endpoint**, and no endpoint that accepts a list of subject
  codes. Re-identification is one subject, one approved request, at a time.
- **No route on the internal API that returns PII**, so even a full compromise
  of the HHH backend plus the shared secret yields no names.

## Known, accepted leak

Blind indexes are deterministic, so they reveal **equality**: an attacker with
read access to the database can tell that two rows share an email address, and
with the pepper could confirm a guess. Without the pepper — which lives in the
key file, not the database — it is a keyed PRF and confirms nothing. This
belongs in the DPIA rather than being discovered by a reviewer.

## Tests

```bash
npm test
```

# Identity Register — Operator and Site Runbook

Operational guide for **verified-identity studies**: studies where participants
are identified, as clinical research requires. For the design and the reasoning
behind it, see [`identity-mode-plan.md`](identity-mode-plan.md).

> **Anonymous studies are unaffected by everything in this document.**
> `identity.mode` defaults to `anonymous` on every study, the code path is
> never entered, and the service need not be deployed at all.

---

## The one-sentence model

> The research databases know a subject code. The identity register knows who
> that is. Nothing knows both except a person holding an approved, time-limited
> re-identification grant — and every such grant is recorded permanently.

---

## Roles

A realm role says **what** someone may do. An assignment in the register says
**where**. A `study-nurse` with no assignment row sees no roster at all.

| Role | Can | Cannot |
|---|---|---|
| `identity-manager` | register config, roster CRUD and CSV import, mint/revoke codes, send invites, raise re-identification requests | approve their own request; see research data |
| `study-nurse` | read the roster for assigned sites, print code sheets, mark in-person verification, issue replacement codes | edit register config, import CSV, raise requests |
| `monitor` | subject codes, verification status, all audit logs, audit export, **approve** re-identification | plaintext PII outside an approved reveal; research data |
| `researcher` | **nothing here** | — |
| `admin` | set `identity.mode` on a study; may hold `monitor` | `identity-manager`, `study-nurse` |

**Two combinations are refused at runtime**, not merely discouraged:

- `researcher` + any identity role → `403 role_separation_violation`.
  This is the property that makes the research data genuinely pseudonymous:
  the person analysing it cannot resolve the pseudonyms.
- `admin` + `identity-manager`/`study-nurse` → `403 admin_role_separation_violation`.
  An admin may approve, never request.

### What this does and does not guarantee

**Stated plainly, because a DPIA reviewer will ask.** These controls provide
**non-repudiation, not prevention**. A Keycloak realm administrator can always
create an account and grant it any role. What the design guarantees is that
doing so is *visible*: role grants land in `admin_audit_log`, and every reveal
is recorded permanently in the register's own database, which no HHH admin can
alter.

Operating two accounts to both raise and approve a request is therefore
possible and is an accepted, documented arrangement — not a loophole someone
found. Closing it properly requires the approver role to be issued by an
identity provider the operator does not control; see the plan's §5.

---

## Setting up a study

1. **Ethics approval first.** This is not a technical step, but nothing below
   should happen without it.
2. Deploy the register: `docker compose --profile identity up -d`.
3. **Create the master key**, once, on the host:
   ```bash
   openssl rand -base64 32 | sudo tee "$HHH_DATA_DIR/identity-master-key" >/dev/null
   sudo chmod 0400 "$HHH_DATA_DIR/identity-master-key"
   ```
   Store a copy in a password manager and a sealed printed copy in a safe.
   **Losing it means subject codes can never be resolved to people again.** The
   pseudonymous research data is unaffected and stays fully analysable — that
   asymmetry is deliberate.
4. In the admin portal, set the study's **Identity** tab to `verified` and
   choose a subject-code prefix (e.g. `TUD-DFG01`).
5. Create the register, then assign staff to it.

> `mode` and `subjectCodePrefix` **freeze once the first participant enrols**
> (HTTP 409 thereafter). Flipping to anonymous would orphan live subject links;
> changing the prefix would break the correspondence between a stored subject
> code and the register that issued it.

---

## Enrolling participants

```
roster import  →  subject codes  →  enrolment codes  →  delivery  →  redemption
```

1. **Import the roster** — CSV upload or one subject at a time. German headers
   (`Vorname`, `Nachname`, `Geburtsdatum`, `Telefon`) are recognised, as is
   Excel's BOM. The import report is keyed by **row number and subject code**
   and never echoes the submitted data back.
   Probable duplicates are **warned about, never rejected**: two people can
   genuinely share a name and a date of birth.
2. **Mint enrolment codes** — `HHV-XXXXX-XXXXX`, single use, 90-day default
   expiry. The alphabet excludes I, L, O and U because those are what get
   misread off a printed sheet.
3. **Deliver** — print the code sheet, or send an invite. The sheet is
   generated on demand and **never stored**; printing it is an audited
   `pii_read` naming every subject on it.
4. **Verify identity** — a human checks the identity document at the site. The
   app never sees an ID document; this is a clinical procedure, not a software
   feature.
5. The participant redeems the code in the app exactly where an anonymous
   study code would go.

### When something goes wrong

| Situation | What to do |
|---|---|
| Participant lost their phone **and** passphrase | Issue a **replacement code**. Redeeming it links the new account to the same subject and supersedes the old link — they remain one subject in the research data. |
| Participant lost their phone but has the passphrase | Nothing. Restore recovers the same account, so the link is untouched. |
| Code typed but enrolment failed | Nothing. The code is released automatically and can be used again; a crash is swept back within ten minutes. |
| Participant withdraws | Mark them `withdrawn`. For full erasure see below. |
| Code lost before delivery | Revoke it and mint a new one. |

---

## Re-identification

The workflow exists to make this **deliberate and visible**, not to make it
hard for a legitimate clinical need. In practice it takes a couple of minutes
and does not slow down an actual emergency.

1. **Request** — pick the subject code, a legal basis (`sae`,
   `safety_report`, `regulatory_inspection`, `participant_request`,
   `data_correction`, `other`) and write a reason of at least 50 characters.
   Request only the fields you need: asking for a phone number does not also
   return an address.
2. **Approve** — a *different* person holding `monitor`. Enforced by a database
   trigger, so it cannot be bypassed by a change to application code.
3. **Reveal** — the requester, within the window (60 minutes by default), sees
   only the requested fields for that one subject. Every view is recorded and
   **never deduplicated**.

There is **no bulk reveal** and **no endpoint that accepts a list of subject
codes**. That absence is what makes "quietly de-anonymise the cohort" not
something the software can do, regardless of who is logged in.

Reverse lookup ("who is account `8f3a…`?") is a **separate request type**,
restricted to safety and regulatory bases, so the audit log distinguishes it
from an ordinary contact request. Those are different acts.

---

## Why there is no name search index

Someone will eventually propose adding one. The answer is written down here so
it does not have to be rediscovered.

Nurse name search **decrypts the roster in memory** rather than querying an
index. A deterministic n-gram or prefix index over names would be trivially
frequency-analysable at this scale: German surname trigram distributions are
public, so such an index is a substitution cipher with a known plaintext
distribution. Decrypting a bounded roster costs one key unwrap plus a few
milliseconds and leaks nothing at rest.

If a register ever exceeds ~20 000 subjects, revisit with a short-TTL in-memory
cache — **not** with a searchable index.

### The leak we do accept

Blind indexes (email, external ID, account link) are deterministic, so they
reveal **equality**: someone with read access to the database can tell that two
rows share an email address. Without the pepper — which lives in the key file,
never in the database — it is a keyed PRF and confirms nothing. **This belongs
in the DPIA**, stated rather than discovered by a reviewer.

---

## Data subject requests

**Art. 15 (access)** now spans two systems: the register holds the identity,
HHH holds the pseudonymous study data, joined by subject code.

**Art. 17 (erasure)** is deliberately **not** a single cascade:

- Deleting a subject removes the identity and leaves a tombstone carrying only
  the subject code. Re-identification is severed permanently.
- The pseudonymous research data in HHH is **retained** and stays analysable.

That asymmetry is the correct and defensible outcome for research data, and it
must appear verbatim in the consent document participants sign.

---

## Backups

The register is **not** included in the nightly backup by default
(`BACKUP_INCLUDE_IDENTITY=false`). Turn it on only for a deployment actually
running a verified study.

> ⚠️ Field encryption makes a stolen dump inert **on its own**. A dump **plus**
> the master key file is a total compromise, and by default both live on the
> same host. Offsite copies of this component need a key the local operator
> does not hold.

Run a restore drill before the study starts. An untested backup is not a
backup, and this is the one component outside the pipeline you already trust.

## Key rotation

| Key | Cost | When |
|---|---|---|
| KEK (`IDENTITY_KEK_VERSION`) | Cheap — rewraps per-register data keys, no plaintext touched | Annually |
| Blind-index pepper (`IDENTITY_BI_VERSION`) | Expensive — decrypt and re-index every subject | Only on suspected pepper compromise |

The two version counters are **independent** precisely so a routine KEK
rotation never triggers the expensive one.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every enrolment fails with `identity_service_unavailable` | `IDENTITY_SERVICE_URL`/`IDENTITY_SERVICE_SECRET` unset on the HHH backend, or the container is down |
| `403 not_assigned_to_register` for a user who has the right role | They hold the realm role but have no assignment row — a role says *what*, an assignment says *where* |
| `403 role_separation_violation` | The account holds `researcher` alongside an identity role. Working as intended: use separate accounts |
| Valid `HHV-` code rejected in the app | The mobile build predates the widened format. Ship the app update **before** minting any HHV codes |
| Service refuses to start: "must not be used in production" | The master key was supplied as an environment variable. Mount it as a file and set `IDENTITY_MASTER_KEY_FILE` |
| A code is stuck `reserved` | A crash between reserve and confirm. The sweeper reclaims it within `IDENTITY_RESERVATION_TTL_MINUTES` (default 10) |

## See also

- [`identity-mode-plan.md`](identity-mode-plan.md) — design and decisions
- [`../identity-service/README.md`](../identity-service/README.md) — service internals
- [`../SECURITY.md`](../SECURITY.md) — how this fits the platform's data protection model
- [`runbook.md`](runbook.md) — general operations

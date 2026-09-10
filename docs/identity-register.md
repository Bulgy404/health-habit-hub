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

## Where things are in the admin portal

| Page | Who sees it | What it does |
| --- | --- | --- |
| Study → **Identity** tab | `admin` | Turn verified mode on, set the subject-code prefix, consent slug, approver count and reveal window — and name the researchers who may read or export the study |
| **Identity register** | identity roles | Create the register, assign staff to it, import the roster, add subjects, issue codes, mark verification, print the sheet, send invites, erase a subject |
| **Re-identification** | `identity-manager`, `monitor` | Raise, approve/reject and reveal — the queue |
| **Identity audit** | `identity-manager`, `monitor` | Every recorded action, filterable to reveals, exportable as CSV |
| **Consent documents** | `admin` | Write and publish the study consent text, per language — see below |

`admin` configures the study but has no standing access to the register
itself; the identity roles have access to the register but cannot change the
study's configuration. That split is deliberate.

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
5. On the **Identity register** page, enter the study id and choose **Create
   register**. The prefix must match the one set in step 4 — it is frozen at
   creation, because every subject code issued embeds it.
6. Assign staff on the same page, under *Who may work in this register*. Until
   someone is assigned they see nothing, whatever realm role they hold — the
   creator is assigned automatically so the register is never orphaned, and
   removing the last `identity-manager` is refused for the same reason.
7. On a verified study, researchers are **scoped**: name them under *Researcher
   access* on the study's Identity tab, choosing read or read + export. Without
   an entry the `researcher` role grants nothing on that study.

> A consent slug with no matching document 404s the participant **after** they
> have enrolled. Attaching one that is not ready is therefore **refused**
> (`409 consent_document_not_ready`) — see *The consent document* below.

> `mode` and `subjectCodePrefix` **freeze once the first participant enrols**
> (HTTP 409 thereafter). Flipping to anonymous would orphan live subject links;
> changing the prefix would break the correspondence between a stored subject
> code and the register that issued it.

---

## The consent document

The additional consent a participant accepts after redeeming their code, on top
of the platform's own. Written and published in the admin portal under
**Consent Documents**.

A study consent document exists in two places, deliberately:

| Source | What it is |
| --- | --- |
| `app/language/<lang>/consent-<slug>.md` | Shipped with the image, in version control, gated by `scripts/checkLegalDocs.mjs` |
| `study_consent_documents` in Mongo | Edited in the portal — **overrides** the file for that language |

The database wins where a row exists. That ordering is the point: a wording
change agreed with an ethics committee mid-study must not need a redeploy, but
a fresh deployment with an empty database must still serve the text that
shipped with it. The portal shows which of the two is live per language, and
offers **Restore shipped text** to drop the override.

### Ready, and why a document might not be

A document can be attached to a study only when it is:

- **present in all five languages** (`en`, `de`, `ja`, `fr`, `nl`) — `req.lang`
  picks the file, so a document written only in German 404s a Dutch
  participant;
- **published**, not a draft;
- **free of `⟦…⟧` placeholders** — these mark the things software cannot know:
  the recruiting institution, the ethics reference, the retention period;
- **at one version across every language** — `consents.consentVersion` is a
  bare semver, so mismatched locales make an acceptance record ambiguous about
  which text was actually read.

Anything else and `PUT /admin/studies/:id` returns **409
`consent_document_not_ready`** with the specific reasons. This is the point of
the check: the error lands on the person configuring the study, not on a
participant who has already enrolled.

Publishing a text that still contains placeholders is refused; saving it as a
**draft** is not. Draft is the normal working state.

### What ships today

`consent-habconnect-clinical` — the clinical-arm consent for HabConnect, in all
five languages, **as a draft**. It is filled in from the study's real details
(TU Dresden, Digital Health research group, the contacts and supervisory
authority from the platform consent) and carries three placeholders only the
ethics submission can resolve:

- ⟦the cooperating clinical institution⟧
- ⟦the ethics approval reference and date⟧
- ⟦the retention period for the register entry⟧

`consent-verified-template.md` remains as a pattern for a *different* study;
`*-template` files are skipped by both CI and the portal and are never served.

> **Read the "What changes compared with the general consent" section against
> your ethics approval.** The platform consent states that no name or date of
> birth is stored — for a verified arm that is not true, and the document says
> so explicitly rather than leaving two documents to contradict each other.
> That contradiction has to be resolved in the ethics submission, not only in
> the text.

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
3. **Deliver** — print the code sheet, or use **Send by email** on the code
   just issued. The sheet is generated on demand and **never stored**;
   printing it is an audited `pii_read` naming every subject on it. The email
   goes to the address held in the register — nobody can type a different one —
   and the service reports only whether it went, never to where. Sending needs
   `SMTP_HOST` configured.
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

## Researcher access to a verified study

Verified studies are **scoped**: the `researcher` role alone is not enough, and
a researcher must be an explicit member of the study to read it. Membership
also distinguishes *read* from *export* — downloading a study bundle is
materially more than viewing a page.

Anonymous studies stay **open**, exactly as before, so nothing existing changed
the day this shipped. Admins always pass: scoping limits researchers to their
own studies, it does not lock operators out of the platform they run.

Members are managed under *Researcher access* on the study's **Identity** tab.
Adding someone to an anonymous study is allowed and simply has no effect yet;
the panel says so rather than letting it look as though nothing happened.

Study existence is deliberately **not** secret — a non-member sees the study in
the list and a 403 on its detail. Hiding it would make the studies page look
broken for no security gain; the sensitive thing is the data, not the name.

## Alerting

Every reveal sends a mail to `IDENTITY_DPO_ALERT_EMAIL` — on **every** reveal,
not on a threshold. A re-identification nobody noticed is the failure mode that
ends studies.

The alert carries the subject code, who performed it, the legal basis and the
field **names**. It never carries the revealed values: the point is that
someone was identified, not who they are.

Leaving it unset disables alerting, which is defensible for a pilot but should
not survive into a real study.

## Data subject requests

**Art. 15 (access)** now spans two systems: the register holds the identity,
HHH holds the pseudonymous study data, joined by subject code.

**Art. 17 (erasure)** is deliberately **not** a single cascade:

- Deleting a subject (**Erase** on the roster, behind a typed confirmation)
  deletes the register row outright, taking the account link and any issued
  codes with it. Nothing of the person is kept — not even an empty row
  recording that one existed. The only trace is an audit entry naming the
  subject code, which is what makes the erasure accountable, and the subject
  code itself can never be reissued because the register mints codes from a
  counter rather than from a row count. Re-identification is severed
  permanently.
- The pseudonymous research data in HHH is **retained** and stays analysable.

That asymmetry is the correct and defensible outcome for research data, and it
must appear verbatim in the consent document participants sign.

---

## Backups

The register is **not** included in the nightly backup by default
(`BACKUP_INCLUDE_IDENTITY=false`). Turn it on only for a deployment actually
running a verified study.

When enabled, the backup container receives `IDENTITY_DB_*` directly and joins
`hhh-identity-net` solely for `pg_dump`/`pg_restore`. Keycloak does not receive
these backup settings. Validate the effective wiring before the first study:

```bash
docker compose --profile identity config --quiet
docker compose --profile identity exec backup pg_isready -h identity-db -U identity
```

> ⚠️ Field encryption makes a stolen dump inert **on its own**. A dump **plus**
> the master key file is a total compromise, and by default both live on the
> same host. Offsite copies of this component need a key the local operator
> does not hold.

Run a restore drill before the study starts. An untested backup is not a
backup, and this is the one component outside the pipeline you already trust.

## Token validation

Production startup requires `KEYCLOAK_JWT_AUDIENCE`, and every accepted access
token must carry a numeric, unexpired `exp` claim, the configured issuer and
audience, a subject, and an `RS256` signature from the configured JWKS. Leaving
the audience empty is a startup error rather than permission to accept tokens
minted for unrelated clients.

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
| `403 not_assigned_to_register` for a user who has the right role | They hold the realm role but have no assignment row — a role says *what*, an assignment says *where*. Fix it under *Who may work in this register* |
| The roster is empty and no error is shown | Either no register exists for that study, or you are not assigned to it. The page says which, above the table |
| `404 register_not_found` from the app on enrolment | The study is verified but its register was never created. Create it on the Identity register page |
| Invite reports `sent: false` | Either no email is held for that subject, or SMTP is not configured on the identity service |
| `403 role_separation_violation` | The account holds `researcher` alongside an identity role. Working as intended: use separate accounts |
| Valid `HHV-` code rejected in the app | The mobile build predates the widened format. Ship the app update **before** minting any HHV codes |
| Service refuses to start: "must not be used in production" | The master key was supplied as an environment variable. Mount it as a file and set `IDENTITY_MASTER_KEY_FILE` |
| A code is stuck `reserved` | A crash between reserve and confirm. The sweeper reclaims it within `IDENTITY_RESERVATION_TTL_MINUTES` (default 10) |
| `409 consent_document_not_ready` when saving a study | The named consent document is missing a language, is still a draft, still has `⟦…⟧` placeholders, or its languages sit at different versions. The response names which |
| Edited the consent text in the portal, participants still see the old one | Only the language you edited is overridden. Check the **Source** column — the others still read the shipped file |

## See also

- [`identity-mode-plan.md`](identity-mode-plan.md) — design and decisions
- [`../identity-service/README.md`](../identity-service/README.md) — service internals
- [`../SECURITY.md`](../SECURITY.md) — how this fits the platform's data protection model
- [`runbook.md`](runbook.md) — general operations

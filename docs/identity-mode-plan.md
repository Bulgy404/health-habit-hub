<!--
  Design document — APPROVED, NOT YET IMPLEMENTED (as of 2026-09-03).
  Status: planning complete; no code written. Phase 0 items are independently
  shippable bug fixes that stand on their own merits.
  See also: SECURITY.md, docs/architecture.md, docs/data-model.md.
-->

# Verified Identity Mode — optional per-study patient identification

## Context

A university partner wants to run a clinical study on Health Habit Hub. Clinical research needs two things the platform deliberately cannot do today: **verify that a participant is who they claim to be**, and **know which identified patient produced which data** (for adverse-event follow-up, site monitoring, regulatory inspection, and participant-initiated data requests).

HHH is built the opposite way on purpose. Identity is a random UUID (Keycloak `sub`), there is no name, email or phone anywhere, and `SECURITY.md` documents the deliberate absence of app-level field encryption because researchers need plaintext research data. That model is correct and must not be weakened for the studies that use it.

So this is not a change to the identity model — it is a **second, optional model that sits beside it**, enabled per study. The guiding invariant:

> PII exists in exactly one process, one database, and one backup destination. HHH learns a study-local subject code and nothing else. The `researcher` role can never reach PII.

**Anonymous studies are completely unaffected.** `identity.mode` is absent on every existing study and defaults to `anonymous`; the new code path is never entered, exports are unchanged, and the mobile flow is identical. If no verified study is ever run, the new container need not be deployed at all.

### Decisions made with the user

| | |
|---|---|
| Register location | Separate service + separate **Postgres** DB + own key, deployed alongside HHH on TU infra; designed to relocate to university hosting by changing a URL and moving a key |
| Keycloak | Auth and new roles only. **No PII in Keycloak** — its `sub` is the research pseudonym, so a name on the same user object would collapse the separation |
| UI | All in the existing Next.js admin portal, calling the identity API directly |
| Roster | CSV upload **and** manual single entry, **plus a printable PDF sheet** of subjects + codes for the nurse |
| Verification | In-person at site (nurse hands out code) **and** verified email/SMS invite |
| Code delivery | Identity service sends mail itself via its own SMTP credentials |
| Governance | Full: separation of duties, re-identification request/approval workflow, read auditing, per-study researcher scoping — all per-study configurable, audit viewable and exportable in the portal |
| Export identifier | Study-local subject code (`TUD-DFG01-0042`), not the raw UUID |
| Key custody | TU holds the master key (so TU **can** re-identify); mounted as a `0400` file so custody can be shared with or handed to the university later with no code change. Backup key is separate and university-held |
| Admin separation of duties | `admin` may approve but is denied the requesting roles at runtime; the user operates two accounts to do both, which the audit trail records. Non-repudiation, not prevention — see §5 |
| Approver notification | Email (role-derived recipients **plus** optional per-study extras) + in-portal badge + escalation on safety bases only. No PII in any notification — see §5 |
| Roles vs assignment | Global realm roles created once at deploy; per-study access is data in the identity service. Roles granted on the portal's `/team` page so grants are audited. Site scoping in the schema, study-level in the UI |
| Documentation | A reader-facing README subsection and a DOCUMENTATION.md chapter are their own deliverable at the end of Phase 2 — see §11.1 |

---

## 1. Service boundary

**New service `identity-service/`** — Node 22 + Express, ESM, mirroring `app/`'s conventions. Rationale: the needed middleware already exists in a form the team maintains (`app/middleware/auth.js` JWKS verifier, `requireRole.js`, `requireServiceToken.js` constant-time compare); `pdfkit` + `qrcode` are proven in `app/services/tokenCardService.js`; `csv-stringify` is already used in `app/services/exportService.js`; Node's `crypto` gives AES-256-GCM and HKDF natively, with no third-party crypto dependency to defend in a DPIA.

**Postgres, not Mongo.** Using a *different engine* makes it structurally impossible for the register to be swept into `mongodump` (`backup-service/backup.sh:128`) or into `studyExportService.js`'s collection loop — that mistake would require a code change, not a mis-set env var. It also gives DB-enforced four-eyes (`CHECK decided_by <> requested_by`) and a one-command `pg_dump` relocation. **Crypto happens in Node, never in Postgres** — no `pgcrypto`; the DB must never see a key, so a stolen dump is inert.

```
browser (admin portal) ──Traefik──► identity-service :3002  (public, Keycloak bearer)
app/ (HHH backend) ───────────────► identity-service :3003  (internal, shared secret,
                                            │               no Traefik label)
                                            ▼
                                      identity-db (Postgres, private network only)
```

**The admin portal calls the identity service directly — it does not proxy through `app/`.** This is the single most important boundary decision. Proxying would route PII through `app/`'s pino logging, its Sentry hook (stack traces capture locals), and `auditAdminActions.js`, which writes `res.locals.auditDetail` into Mongo `admin_audit_log` on any 4xx — meaning a validation error on a roster import would permanently write a patient's email into the research database. Both services sit behind `Host(${DOMAIN})` with different path prefixes, so this is same-origin today; design the token check to accept a **configurable issuer list** from day one (`app/middleware/auth.js` already models this) so relocation doesn't need a rewrite.

`app/` → identity coupling is deliberately **two env vars** (`IDENTITY_SERVICE_URL`, `IDENTITY_SERVICE_SECRET`) and **one new file** (`app/services/identityLinkClient.js`). That is the entire relocation cost.

**Internal API (`:3003`) — no route returns PII, by construction:**
- `POST /internal/v1/codes/reserve {code}` → `{reservationId, hhhStudyId, subjectCode, expiresAt}`
- `POST /internal/v1/codes/confirm {reservationId, keycloakSub, hhhGroupId}` → `{ok, subjectCode}`
- `POST /internal/v1/codes/release {reservationId}`
- `GET /internal/v1/studies/:id/linked-count`

Even a full compromise of `app/` **plus** the shared secret yields no names.

**Public API (`:3002`, Keycloak bearer):** register config; subject CRUD + CSV import; subject search; code mint/send; `GET /studies/:id/codes/sheet.pdf`; verification marking; re-identification request/approve/reject/reveal; audit list + export.

**Leak hygiene inside the service:** pino with request-body logging *disabled outright* (redaction lists rot; not logging bodies doesn't); central error handler returning `{error: <code>}` and never echoing `pg` messages (a unique-violation embeds the offending value); **do not port Sentry** (or port it with a `beforeSend` stripping `extra`, `contexts` and locals); `multer` with `memoryStorage()` and a size limit — never disk storage, so a CSV of patient names never touches a container filesystem.

---

## 2. Encryption

**Key hierarchy** — one 32-byte `IDENTITY_MASTER_KEY` (file-mounted `0400`, not an env var: env leaks via `docker inspect`, `/proc/<pid>/environ`, and crash dumps), everything else derived:

```
HKDF-SHA256(master, salt="hhh-identity", info="kek-v{n}")      → KEK_n (wraps DEKs)
HKDF-SHA256(master, salt="hhh-identity", info="bi-email-v{m}") → pepper_email
                                          ... bi-extid / bi-sub / bi-code / bi-name
```

KEK version `n` and blind-index version `m` are **independent** — rotating the KEK must not invalidate blind indexes, which would force a full plaintext re-pass.

**One DEK per study register** (`study_registers.dek_wrapped bytea`, `kek_version int`), wrapped `AES-256-GCM(KEK_n, iv, dek, aad = register_id||"dek"||n)`. Per-study rather than per-subject because nurse name search decrypts the roster (§2.3) — per-subject would mean N unwraps per keystroke. Crypto-shredding a single subject isn't needed: a Postgres row `DELETE` is a perfectly good Art. 17 erasure primitive.

**Field layout** — each encrypted field is one `bytea`:
```
[1B scheme version 0x01][12B random IV][ciphertext][16B GCM tag]
AAD = subject_id || ':' || field_name || ':' || 0x01
```
Binding the AAD to both `subject_id` and `field_name` means ciphertext cannot be moved between rows (swapping Alice's name onto Bob's) or between columns (moving the email blob into a less-audited field). That is the concrete defence against an attacker with `UPDATE` on the DB but no key. IVs are generated **inside** the encrypt helper and never accepted from a caller.

Encrypted on `subjects`: `given_name_ct`, `family_name_ct`, `dob_ct`, `email_ct`, `phone_ct`, `external_id_ct` (the site's own screening/patient ID), `address_ct`, `notes_ct`.

### 2.3 Searchability — three needs, three honest answers

**(a) Exact lookup by email / external ID / Keycloak sub.** Deterministic blind index `HMAC-SHA256(pepper, nfkc(lower(trim(v))))` as `bytea`, with `UNIQUE (register_id, bi_email) WHERE bi_email IS NOT NULL`. **Known leak, must go in the DPIA:** a deterministic index reveals *equality* — an attacker with DB read access can tell two rows share an email. Without the pepper (which lives in the key file, not the DB) it is a keyed PRF and confirms nothing.

**(b) Nurse name search — decrypt and filter in memory, server-side.** Explicitly **do not** build an n-gram or prefix index over names: with a roster of hundreds, German surname trigram frequencies are public knowledge and such an index is a substitution cipher with known plaintext distribution. Instead unwrap the study DEK once, decrypt the name fields, filter, return matches. At n=2000 that is well under 10 ms in Node and leaks nothing at rest. Every such search is an audited `pii_read`. The rationale for refusing a searchable index must be written into `docs/identity-register.md` — someone will eventually propose it.

**(c) Duplicate detection on import.** Non-unique `bi_name = HMAC(pepper_name, lower(family|given|dob_iso))`, used only to warn "looks like a duplicate of TUD-DFG01-0017". Never for search.

Add `bi_version int` to `subjects` so pepper rotation can dual-write and backfill.

**Enrollment codes are bearer credentials** granting enrollment *as a specific identified subject*, so: `code_hash = HMAC(pepper_code, upper(code))` `UNIQUE` as the redemption lookup key (constant-time by construction), plus `code_ct` envelope-encrypted so the nurse can re-print a sheet. **Do not store the generated PDF** — `participants.tokenCardPdf` persists a blob today; that pattern must not be copied. Generate on demand, stream, keep nothing.

---

## 3. Linking flow

**One code, not two.** Two codes at a study site is an operational disaster. For identity-mode studies the enrollment code **replaces** the `HHH-XXXXX` study code, distinguishable by prefix so `app/` can route without knowing study prefixes:

- `HHH-XXXXX` — unchanged, anonymous studies
- `HHV-XXXXX-XXXXX` — 10 chars Crockford base32 (~50 bits; excludes I/L/O/U, which matters when read off paper), generated with `randomBytes` + rejection sampling exactly like `studyCodeService._generateCode()`
- Subject code `TUD-DFG01-0042` — sequential per register, assigned at import in screening order (clinical convention)

```
1. identity-manager creates the register (subjectCodePrefix, DEK minted+wrapped)
   HHH admin sets study.identity.mode = 'verified'

2. Roster: CSV (multer memoryStorage → csv-parse) or manual entry.
   Per row: encrypt PII, compute blind indexes, allocate subject code.
   Response is keyed by SUBJECT CODE and row number — never echoes PII back.

3. Mint HHV code per subject: single use, default 90d expiry.

4. Deliver — in person via GET /studies/:id/codes/sheet.pdf (pdfkit table:
   subject code | name | DOB | code | QR; audited as pii_read), or by
   email/SMS from the identity service using its OWN SMTP creds — the address
   is decrypted, used, discarded; never passed to HHH, never logged.

5. Participant onboards unchanged: welcome → consent → passphrase (/onboard)
   → profile-setup → study-code. Types HHV-4K7P2-9QX3R.

6. Redemption — reserve / enrol / confirm:
   app/ sees HHV- prefix → identityLinkClient.reserve(code)
     identity: UPDATE enrollment_codes SET status='reserved', reservation_id=$1
               WHERE code_hash=$2 AND status='issued' AND not expired
               → { reservationId, hhhStudyId, subjectCode }   ← NO PII
   app/ runs the EXISTING enrollment path with that studyId:
     _selectGroupWeighted → createEnrollment(neo4j) → _upsertMongoEnrollment
     (+ subjectCode) → scheduleQuestionnaires
   app/ → confirm { reservationId, keycloakSub, hhhGroupId }
     identity: subject_account_links row (sub encrypted + blind-indexed);
               code → 'redeemed'; subject → 'enrolled'
   On any failure → release (back to 'issued').
   A sweeper returns reservations older than 10 min to 'issued'.
```

| | HHH (Mongo/Neo4j) | Identity service (Postgres) |
|---|---|---|
| Keycloak sub | plaintext (it's the app's user id) | encrypted + blind index |
| Subject code | plaintext on `enrollments` | yes |
| Name / DOB / email / phone | **never** | encrypted |
| HHV code | **never** (see below) | hashed + encrypted |
| Habit / questionnaire data | yes | **never** |

**Risk to close:** `enrollments.studyCodeUsed` would otherwise store the HHV code, which is 1:1 with a subject and therefore a cross-database correlator. Store `null` (or the subject code) there for identity studies.

**Edge cases.** *Device restore* (`app/routes/restoreRouter.js`, BIP39 via `app/utils/recoveryPhrase.js`) recovers the same account → same `sub` → link untouched; the existing recovery design already does the right thing, and **the 16-byte password length must not change**. *Lost passphrase → new account* needs an explicit **re-link**: nurse issues a replacement code, redemption adds a *second* `subject_account_links` row and marks the previous `superseded_at`. This is why links are a table, not a column — a subject who lost their phone must not appear as two subjects. Consequence: **exports must not assume the subject code is row-unique**; document it. *Study switch* (`studyCodeService.switchStudy`) is **blocked** with a 409 when either study is identity-mode. *Withdrawal* sets subject status `withdrawn` + `enrollments.droppedOutAt`; full Art. 17 erasure is a `DELETE` on the subject row, cascading to its links and codes, with only an audit entry naming the subject code left behind — severing re-identification while leaving pseudonymous research data intact. That outcome belongs verbatim in the consent document.

---

## 4. Per-study configuration — the established 6-layer pattern

**Study-level only, not per-group.** Identity mode follows the study's ethics approval, not an experimental condition; putting it in `groups[]` would allow one arm identified and another not. This is a deliberate deviation from the `gamificationEnabled` shape — say so in the model docblock.

| Layer | File | Change |
|---|---|---|
| 1 | `app/models/study.js` | `IDENTITY_BSON` const alongside `REMINDER_MODE_BSON`; `identity:` in `properties`. Nothing in `groups.items.properties` |
| 2 | `app/schemas/adminSchemas.js` | `identityConfigSchema`; `.optional()` on `createStudySchema` (~L148) **and** `updateStudySchema` (~L178) — the latter is `.strict()`, so omitting it 400s every PATCH carrying `identity`. Easy to miss |
| 3 | `app/services/studyService.js` | list projection (~L181), create default (~L221/269), detail (~L347), update `$set` (~L427) |
| 4 | `app/services/studyService.js` `getParticipantGroupConfig` → `app/routes/studyConfigRouter.js` | add `identityMode`, `identityConsentSlug`. No new endpoint |
| 5 | `admin/src/app/(admin)/studies/` | new `identity` tab, modelled on the `gamification` tab (~L4221-4256) and registered in the tab list (~L4568-4580); types in `useStudiesData.ts`; i18n keys in all four `admin/messages/*.json` |
| 6 | `app/models/survey.js:ensureIndexes()` | **bug fix, see below** |

```js
identity: {
  mode: 'anonymous' | 'verified',   // absent ⇒ 'anonymous' (same back-compat
                                    //   convention as recommenderEnabled)
  subjectCodePrefix, verificationMethods: ['in_person'|'email'|'sms'],
  consentDocumentSlug, reidentificationApprovers: 1|2,
  revealTtlMinutes, auditReads, researcherScoping: 'open'|'scoped'
}
```

**Freeze guard** in `studyService` update: `identity.mode` and `subjectCodePrefix` are immutable once `enrollments.countDocuments({studyId}) > 0` (409 otherwise) — `verified → anonymous` would orphan live links.

**Layer 6 is a live bug.** `ensureIndexes` in `study.js`, `studyCode.js` and `enrollment.js` are **not** chained from `app/models/survey.js:ensureIndexes()`, which is what `app/app.js:218` calls — so `studies_isDefault_unique`, `studyCodes_code_unique` and `enrollments_userId_unique` have never been created on any deployment. The new `enrollments.subjectCode` index needs the chain fixed. **Check for duplicate data first**: `createIndex` failures there are caught and only logged, so a unique-index violation would fail silently at boot.

**`admin/src/app/(admin)/studies/page.tsx` is already 5017 lines.** Extract the tab body into `IdentityTab.tsx` rather than inlining another tab.

---

## 5. Separation of duties and re-identification

New Keycloak realm roles. **Critical: a realm JSON import does not re-apply to a running realm** — the roles must also be created via `kcadm`, in the `keycloak-init` step (`docker-compose.yml:700`, where `hhh-user-profile.json` is applied) or `scripts/deploy-keycloak.sh`. Forgetting this is the #1 way this "works locally, 403s in prod".

| Role | Can | Cannot |
|---|---|---|
| `identity-manager` | register config, roster CRUD + CSV import, mint/revoke/send codes, submit re-ID requests | approve their own request; see research data |
| `study-nurse` | read roster for assigned sites, print sheet, mark in-person verification, issue replacement codes | edit config, import CSV, request re-ID |
| `monitor` | subject codes + verification status, all audit logs, audit export, approve re-ID | plaintext PII outside an approved reveal; research data |
| `researcher` | **nothing in the identity service** | — |
| `admin` | set `study.identity.mode` in HHH; may hold `monitor` | `identity-manager` / `study-nurse` |

**Two levels: global role, per-study assignment (decided).** Realm roles say *what kind of thing* a person may do and are created once at deploy. They grant access to **nothing** on their own — the identity service's `study_site_assignments` table decides which register a holder can touch. A `study-nurse` with no assignment row sees no roster at all. Rejected alternative: per-study Keycloak roles (`nurse-dfg01`, …) — that needs a Keycloak change per study, becomes a dozen unaudited roles across a few studies and sites, and doesn't travel with the register on relocation.

Onboarding a person: Keycloak account → grant the role once → assign to a study in the portal → access begins. Ending a study removes the assignment; the role stays.

- **Role grants happen in the admin portal's existing `/team` page** (extended to offer the identity roles via `keycloakAdminClient`), *not* in the Keycloak console — so every grant lands in `admin_audit_log` and can raise the self-grant alert above. Granting in Keycloak directly would leave the record only in Keycloak's event log, which nobody reads, and would forfeit the visibility property the whole two-account arrangement rests on.
- **Assignments are study-level in the UI, but `study_site_assignments.site_id` is nullable from day one** — so a second centre needs UI work only, never a migration. Full site scoping stays out of Phase 1.

Enforcement in code, not policy: `requireIdentityRole()` is an allow-list **plus a deny check** — a token carrying `researcher` *and* any identity role → 403 with a distinct code. Mutual exclusion becomes a runtime invariant an auditor can test rather than a document that drifts. Per-site scoping inside the service via `study_site_assignments(actor_sub, register_id, role)` — a nurse at site A must not see site B's roster.

**Admin portal trap:** `admin/src/middleware.ts` gates the whole portal on `admin || researcher` and `admin/src/lib/useAdminGuard.ts` bounces everyone else to `/access-denied`. Both must widen for the three new roles, plus a new `useIdentityGuard()` — otherwise nurses can't load the portal shell at all. Getting this wrong either locks nurses out or hands admins the register.

**Workflow:**
```
REQUEST  identity-manager posts { studyId, subjectCode, reason (min 50 chars),
         legalBasis: sae|safety_report|regulatory_inspection|participant_request
                    |data_correction|other, fieldsRequested: [...] }
         → status 'pending', audit row, optional DPO alert mail
APPROVE  a DIFFERENT principal holding `monitor` (or a 2nd manager when
         reidentificationApprovers=2). DB CHECK decided_by <> requested_by;
         2-approver mode uses a child table with UNIQUE (request_id, approver_sub).
         → reveal_expires_at = now() + revealTtlMinutes (default 60)
REVEAL   GET /reidentification-requests/:id/reveal — requester only, within TTL,
         only that subject code, only the requested fields, rate-limited,
         increments reveal_count, writes sensitivity='reveal' (never deduped).
         There is NO bulk reveal endpoint and no endpoint taking a list of
         subject codes. Ever.
REVOKE   monitor can revoke an unexpired grant.  EXPIRE  background sweep.
```

**Admin separation of duties (decided).** `admin` may hold `monitor` (approve) but is denied `identity-manager`/`study-nurse` at runtime, same shape as the researcher check — so an admin account can approve but cannot request. The user will operate two separate accounts to do both, which is accepted and expected: the DB `CHECK` still prevents self-approval, and both accounts appear in the audit trail. Stated plainly for the DPIA: **this is non-repudiation, not prevention** — a Keycloak realm admin can always mint a principal, so the control makes circumvention *visible*, never impossible. Also alert on identity-role grants, so self-granting is an event rather than a silence. (Federating `monitor` to the university's IdP would genuinely close the gap and remains additive — revisit after Phase 2 if the ethics board asks.)

**Approval notification (decided).** Three layers, none of which may carry PII — the name is exactly what has not been revealed yet, so notifications carry only subject code, legal basis, requester, reason text and a deep link to `/identity/requests/<id>`:
1. **Email from the identity service** using its own SMTP credentials. Recipients are **role-derived plus optional extras**: everyone holding `monitor` for that study (via role + site assignment, so it cannot drift when staff change), plus any additional addresses configured on the study's identity config (shared study mailbox, DPO).
2. **In-portal pending badge** beside "Re-identification" in the sidebar for `monitor` holders, on the existing 30 s poll interval — the safety net for filtered or delayed mail. The design must not depend on the email arriving.
3. **Escalation, safety bases only** (`sae`, `safety_report`, `regulatory_inspection`): re-notify at 15 min if still pending, fallback address (PI/DPO) at 30 min. The softer bases (`participant_request`, `data_correction`) never escalate — escalating them would train people to ignore the alerts.

SMS to approvers for `sae` requests is a genuine out-of-hours improvement and reuses the invite SMS path, but it is Phase 3, not Phase 1.

Reverse direction (`sub` → person: "who is user 8f3a…, they reported an adverse event in-app") is a **separate request type** `deanonymize_account`, restricted to `sae|safety_report|regulatory_inspection`, resolved via `bi_keycloak_sub`. Keeping it distinct means the audit log can tell "we needed to contact subject 0042" from "we needed to find out who this account belongs to" — very different acts.

Portal pages: `/identity/requests` (list + create), `/identity/requests/[id]` (approve/reject, quoting reason and legal basis in the confirm dialog), `/identity/reveal/[id]` (time-limited view with visible countdown).

---

## 6. Auditing

**Do not widen `AUDITED_METHODS` in `app/middleware/auditAdminActions.js:6`.** The studies page polls every 30 s; global GET auditing would write ~10⁴ noise rows/day into `admin_audit_log` and destroy its evidentiary value. If HHH-side read auditing is wanted later, make it opt-in per route via `res.locals.auditRead` — **and note the trap**: `res.locals` is set by the handler, which runs *after* this middleware's synchronous body, so the check must live **inside the `finish` listener**, not in the early-return guard at the top. The obvious one-line version silently never fires.

**The identity service audits everything, including GETs**, to `identity_audit_log` in its own database — so the trail cannot be altered by an HHH admin and travels with the register on relocation. Different volume regime (tens to hundreds of sensitive requests a day). Same non-blocking `res.on('finish')` shape; a failed audit write must never break a response.

| sensitivity | meaning | dedup |
|---|---|---|
| `list` | subject codes/status only, no plaintext left the DB | 60 s |
| `write` | roster or config mutation | never |
| `pii_read` | at least one field was decrypted and crossed the API boundary | 60 s |
| `reveal` | approved re-identification | **never** |
| `export` | audit or roster export | never |

An in-process LRU on `(actor_sub, route, resource_id, sensitivity)` collapses identical events inside 60 s into one row with `repeat_count` — a nurse hammering refresh yields "viewed roster ×14, 14:02–14:03", not fourteen rows.

**Record field *names*, never field *values*** (`fields: ['family_name','phone']`). An audit log quoting the PII it audits is a second copy under weaker controls — the mistake this class of system makes most often. Also record `actor_roles` as seen in the token at the time: roles change, and the log must show what authority was actually exercised. Store `ip_hash = HMAC(pepper, ip)`, not the raw address — staff IPs are personal data too.

**Export:** `GET /studies/:id/audit/export?from=&to=&format=csv|json` (monitor/manager), itself audited as `export` with the row count. Portal page `/identity/audit` structured like `admin/src/app/(admin)/audit-log/page.tsx`. Note `apiFetch` in `admin/src/lib/api.ts` always parses JSON — a CSV download needs a new `apiDownload()` helper alongside the existing `apiUpload`. Cheap bonus: add the same CSV export to `app/routes/admin/auditLogRouter.js`, which today offers only a JSON list capped at 200.

---

## 7. Per-study researcher scoping

None exists today — `researcher` sees every study and every export. Turning global scoping on would break every current user, so gate it.

- **`app/models/studyMembership.js`** → `study_memberships`: `{userId, username, studyId, role: 'researcher'|'lead', scope: 'read'|'export', createdAt, createdBy}`, `UNIQUE (userId, studyId)`, index on `studyId`. Chain its `ensureIndexes` into the bootstrap fixed in §4.
- **`app/middleware/requireStudyAccess.js`**: allow `admin`; else if `identity.researcherScoping === 'open'` allow any `researcher` (today's behaviour); else require a membership row, and `scope === 'export'` for export routes.
- Applied to `app/routes/admin/studiesRouter.js` detail/update/delete/export (`:314`) and `app/routes/studyExportRouter.js`.
- **Rollout gate:** `researcherScoping` defaults to `'open'` and is **forced to `'scoped'`** when `identity.mode === 'verified'`. Enforced exactly where needed; nothing existing breaks.
- **Study existence is not secret** — keep every study in the list endpoint and 403 the detail/export. Filtering the list makes the studies page look broken for researchers, for no security gain.
- UI: an "Access" tab on the study modal, add-by-username resolved through `app/services/keycloakAdminClient.js`.

---

## 8. Exports

**`app/models/enrollment.js`**: add `subjectCode: string|null` + index `{studyId: 1, subjectCode: 1}`. The `$jsonSchema` lists properties explicitly, so **the validator must be updated or writes are rejected** — required, not optional.

**`app/services/exportService.js`** — all four CSV builders already hydrate from `enrollmentMap()`, so this is one place:
- Verified studies: `subjectCode` as the first column, **drop `userId` entirely** from all four CSVs.
- Anonymous studies: unchanged.
- If a stable join key beyond the subject code is needed, emit `participantRef = HMAC(studies.exportSalt, sub)` — stable within a study, useless across studies, non-reversible. Keep that salt in **HHH, deliberately not in the identity service**, so it is not a second re-identification path.
- Fix while in there: `buildQuestionnaireResponsesCsv` reads `e.group` (`exportService.js:126`) which is never set on enrollment docs (the field is `groupId`), so that column is always `'NA'` — a pre-existing bug.

**`app/services/studyExportService.js` is the real hazard.** It dumps whole documents from 15+ collections including `participants`, and `sanitizeParticipant()` (`:41-48`) strips only `tokenCardPdf` and conditionally `recoveryPhrase` — **not `passwordHash`, `username`, or `keycloakId`**. Required:
1. Add `passwordHash`, `password`, `salt`, `email` to the strip list. **Do this regardless of this feature — it is a live finding.**
2. Verified studies: drop `participants` from the bundle entirely; rewrite `userId` → `subjectCode` across every collection.
3. Gate both export routes with `requireStudyAccess`.

---

## 9. Mobile

Minimal by design — **the Flutter app never talks to the identity service and never collects a name or email**, so the app-store privacy declaration and the app's threat model are unchanged.

- `app/routes/studyEnrollRouter.js:80,290` hard-codes `/^HHH-[A-Z0-9]{5}$/i` and 400s every HHV code before the service is reached. Widen and dispatch on prefix. The same pattern is at `mobile/lib/screens/onboarding/study_code_screen.dart:71`. **Deploy skew risk: widen the mobile regex in a release shipped *before* any HHV code is minted**, or valid codes fail with a confusing client-side error.
- New secure-storage keys `kIdentityModeKey`, `kSubjectCodeKey` beside the existing ones at `study_code_screen.dart:18-24`. The subject code is a pseudonym — safe to store and worth showing in Settings so a participant can quote it to the study site.
- **Consent ordering problem.** The chain is `welcome → consent → passphrase → profile-setup → study-code`, so the study-specific consent document is only knowable *after* redemption. Rather than reordering a well-tested flow, add a **post-enrollment gate**: new route `/onboarding/study-consent`, entered only when the redeem response carries `identityConsentRequired: true`, plus a third guard in `mobile/lib/router/redirect.dart` (inject `getIdentityConsentPending` as another async callback — keep the function pure; it is unit-tested).
- Serve the document via a new `GET /api/v1/study-config/consent` on `app/routes/studyConfigRouter.js`, rendering `app/language/{locale}/consent-<slug>.md` through the existing front-matter machinery in `app/controllers/consentController.js`.
- **`app/models/consent.js` needs a schema change — a non-obvious prerequisite.** It has no `documentSlug`, and `consentVersion` is semver-pattern-constrained, so a second document's version would collide with the platform consent record and "has this user consented?" would answer wrongly. Add `documentSlug: string|null`, extend the index to `{userId: 1, documentSlug: 1, consentedAt: -1}`, and add a `?documentSlug=` filter to `app/routes/usersRouter.js:87,109` and `mobile/lib/services/consent_service.dart`.

---

## 10. Deployment

New compose services in `docker-compose.yml` + `docker-compose.local.yml`:

```
identity-db       postgres:16-alpine, volume identity-db-data,
                  networks: [hhh-identity-net]   ← private, nothing else on it
                  NO traefik labels, NO published ports

identity-service  build ./identity-service
                  networks: [hhh-proxy, hhh-identity-net]
                  depends_on: identity-db (healthy), keycloak (healthy)
                  :3002 via Traefik PathPrefix(`/identity`) + rate-limit
                  :3003 internal only
```

**`identity-service` must have no network path to `mongo` or `neo4j`** — verify by inspecting the `networks:` lists. Cheapest structural control in the design.

**Env: a new gitignored `identity.env`** (with `identity.env.example` committed), deliberately not in `.env`/`stack.env`: `IDENTITY_DB_URL`, `IDENTITY_MASTER_KEY_FILE`, `IDENTITY_MASTER_KEY_PREVIOUS_FILE`, `IDENTITY_KEK_VERSION`, `IDENTITY_BI_VERSION`, `IDENTITY_SERVICE_SECRET`, `KEYCLOAK_ISSUER`/`JWKS_URL`/`AUDIENCE`, `IDENTITY_PUBLIC_URL`, and its **own** `SMTP_*` block. Duplicating SMTP is intentional — sharing one mail credential between a PII and a non-PII service means one leaked file compromises both.

HHH `.env` gains exactly two vars. Admin gains `NEXT_PUBLIC_IDENTITY_API_URL` as **both** a `build:args` entry and a runtime `environment:` entry — the comment at `docker-compose.yml:1029` explains why: `NEXT_PUBLIC_*` is inlined at `next build`, so a runtime-only value stays `undefined` in the browser forever.

**Backup — separate pipeline, separate key, separate destination.** Do **not** add the identity DB to `backup-service/backup.sh`; that would put PII in the same rclone remote, under the same retention, restorable by the same operator through the same admin UI as research data. Instead a distinct `identity-backup` path: `pg_dump` piped through `age`/`gpg` with `IDENTITY_BACKUP_PUBLIC_KEY`, **whose private half the university holds, not TU ops**. Field ciphertext protects a dump on its own — but a dump *plus* the key file is total compromise, and both sit on the same host. Two independent keys held by two parties is what limits the blast radius. Document and run a restore drill annually.

**Key rotation.** KEK: `npm run rotate-kek` unwraps each register DEK and rewraps under `KEK_{n+1}` — cheap, no PII re-encrypted, annual. Pepper rotation: expensive (decrypt every subject, recompute indexes) — `bi_version` dual-write, only on suspected compromise. DEK: rare, full ciphertext rewrite.

**Monitoring:** Prometheus target + blackbox probe; alert on service down and on any failed `:3003` auth; and — high value, low cost — **page the DPO on every `reveal` audit event**. A re-identification nobody noticed is the failure mode that ends studies.

**Makefile:** `test-identity` target (lint + unit + `npm audit`), added to the `test` aggregate at L65.

---

## 11. Docs and compliance

**Update:** `SECURITY.md` — the documented "no app-level field encryption" decision needs an explicit carve-out; it stays true (and well-reasoned) for the research DBs and is *inverted* for the register. Write both halves and the reason for the asymmetry. Also `docs/architecture.md` (new component, the "PII never crosses this line" boundary, two-port design, why the portal calls identity directly), `docs/data-model.md` (register schema, `enrollments.subjectCode`, `consents.documentSlug`, `study_memberships`, `studies.identity`), `DEPLOYMENT.md` (containers, `identity.env`, rotation runbook, separate backup pipeline, relocation procedure), `.env.example`, and `keycloak/hhh-user-profile.json` (assert unmanaged attributes stay disabled, so nobody can stash a name on a Keycloak user "just temporarily").

**Create:** `docs/identity-register.md` (operator + nurse runbook; the re-identification SOP an auditor will ask for, including why there is no searchable name index) and `app/language/{en,de,fr,nl,ja}/consent-verified-<study>.md` with its own front-matter version — the document the ethics board actually reads: who can re-identify, on what legal basis, who approves, how long a grant lasts, and what withdrawal does.

### 11.1 Reader-facing documentation (own deliverable, end of Phase 2)

The docs above are reference material. Separately, this feature needs an **explanatory section written for someone who has not read this plan** — a partner university evaluating the platform, a new team member, an ethics reviewer. Three surfaces, each with a different reader and length:

- **`README.md` — a new "Verified Identity Mode" subsection under *What it is* / *Use Cases*, ~15 lines.** The README currently describes an unambiguously anonymous platform ("no name, email or phone"), which will read as *false* once this ships unless it is amended. Must say: anonymous is still the default and is unchanged; verified mode is opt-in per study; PII lives in a separate service and never in the research databases; researchers see subject codes only. Link onward to `docs/identity-register.md`. Keep it honest and short — the README is the first thing a prospective partner reads, and overclaiming here is what the security memory exists to prevent.
- **`DOCUMENTATION.md` — a full chapter.** The operational reference: enabling verified mode on a study, importing a roster, issuing and delivering codes, the nurse workflow, the re-identification request/approve/reveal flow with screenshots, role and assignment administration, reading and exporting the audit log, withdrawal and erasure. This is what the study coordinator actually works from.
- **`docs/architecture.md` + `docs/data-model.md`** — as listed above, for the technical reader.

Also: a `CHANGELOG.md` entry per phase (the repo keeps a detailed changelog), and a note in `PRODUCT.md` if it characterises the platform as anonymous.

**Write the README and DOCUMENTATION.md sections at the end of Phase 2, not Phase 1** — after the governance workflow exists, so the documented behaviour is the shipped behaviour rather than an intention. The `SECURITY.md` carve-out is the exception and lands with Phase 1, because the moment the first encrypted register exists the current text is out of date.

**Compliance gates (not code, but they gate the build):**
- **DPIA (Art. 35)** — mandatory: health data + re-identification capability + systematic monitoring. Start it *before* implementation; its outcome can change approver count and retention.
- **Verzeichnis von Verarbeitungstätigkeiten** — a **separate entry** for the register (different purpose, legal basis, retention — clinical registers are typically 10 years — and recipients). Not an amendment to the platform entry.
- **Controllership**: with TU holding the master key, TU is a controller for the identity data alongside the university → **Art. 26 joint-controllership agreement**, not an Art. 28 AVV. Settle this in writing before enrolling anyone. The architecture is identical either way, so custody stays reversible.
- **TOM description (Art. 32)** referencing the envelope scheme, the blind-index equality leak, the role matrix and the audit design.
- **Art. 15/17 procedure spans two systems** now — joined by subject code. Deletion is explicitly *not* a single cascade; document the two-step.

---

## 12. Phased delivery

**Phase 0 — prerequisites, independently shippable, all improvements on their own merits.** Index-bootstrap chain fix (§4); `sanitizeParticipant` hardening; `consents.documentSlug` + API filter; CSV export on the existing audit-log route; the `exportService.js:126` `e.group` bug.

**Phase 1 — MVP the university can start enrolling with.** Identity service + Postgres + envelope encryption + blind indexes; roster (CSV + manual); subject codes; enrollment codes; printable PDF sheet; in-person verification. HHH: `studies.identity` through all six layers, `HHV-` prefix routing, reserve/confirm/release **with the sweeper**, `enrollments.subjectCode`, exports on subject code. Admin: Roster + Codes pages, `useIdentityGuard`, widened `middleware.ts`. Keycloak: `identity-manager` + `study-nurse` in realm JSON **and** kcadm. Identity audit log: write + view.

**Phase 2 — governance.** `monitor` role; re-identification request → approval → time-limited reveal; audit export + `/identity/audit` page; DPO alerting on reveals; approver notification (email + in-portal badge + safety-basis escalation, §5); identity-role granting on the `/team` page + alert on grants. **Ends with the reader-facing documentation of §11.1 — README subsection and the DOCUMENTATION.md chapter** — written against shipped behaviour.

**Phase 3 — delivery + scoping.** Email/SMS invites from the identity service; `study_memberships` + `requireStudyAccess` + Access tab, gated to verified studies.

**Phase 4 — mobile.** Study-specific consent route and document; `redirect.dart` guard; subject code in Settings; replacement-code re-link flow.

**Phase 5 — hardening.** KEK rotation tooling; separate backup pipeline + restore drill; DPIA and doc sign-off; and a **relocation rehearsal** (`pg_dump` → restore on another host → flip two URLs → verify). Rehearsing relocation rather than assuming it is what makes the "movable to university hosting" promise real.

---

## 13. Risks

1. **`admin` omnipotence is baked in.** Portal middleware gates on `admin || researcher`; nurses and monitors can't load the shell until it changes. And the moment someone "fixes" a 403 by granting an admin `identity-manager`, the separation story is gone — hence the programmatic mutual-exclusion check.
2. **Randomization — ask the partner early.** Group assignment stays in HHH via `_selectGroupWeighted` (deterministic weighted round-robin off `studies._skipCounter`). That is **not** block or stratified randomization, which clinical studies routinely require. Stratification by site or baseline variable would have to live in the identity service (the only side that knows the strata) and would redesign step 6 of §3.
3. **Reserve/confirm is not a distributed transaction.** A crash between the two leaves a reserved code; the sweeper handles it but the window exists. The single-phase alternative has a worse failure mode (burnt code, subject cannot enroll). Ship the sweeper *with* Phase 1.
4. **`enrollments` has `UNIQUE (userId)`** — fine for re-link, but exports must not assume subject codes are row-unique. Document in the export header and `docs/data-model.md`.
5. **Two client-side regexes** (`studyEnrollRouter.js` and `study_code_screen.dart`) must change together, mobile first — see §9.
6. **Deterministic blind indexes leak equality** — bounded and acceptable, but must be written into the DPIA rather than discovered by a reviewer.
7. **The master key sits on the same host as the DB.** The weakest link, stated plainly. Mitigated by the `0400` file mount (not env), and above all by the backup key being separate and university-held. A real KMS/HSM when the register relocates.
8. **Sentry.** A globally-set `SENTRY_DSN` picked up by the identity service turns stack traces with local variables into an exfiltration channel out of the trust boundary. Don't wire it, or wire it with an aggressive `beforeSend`.

---

## Verification

- **Unit (identity service):** encrypt→decrypt round-trip; AAD tamper (swap ciphertext between rows and between columns → must fail to decrypt); blind-index determinism and NFKC normalisation; code generation charset excludes I/L/O/U; reserve/confirm/release state machine including double-redeem and expiry; sweeper reclaims a stale reservation; `decided_by <> requested_by` rejected at the DB; reveal outside TTL / by a non-requester / for a different subject code all 403.
- **Unit (HHH):** `app/tests/` — study `identity` config round-trips through create/update/detail; the freeze guard 409s once an enrollment exists; `HHV-` codes route to `identityLinkClient` and `HHH-` codes take the existing path; exports emit `subjectCode` and no `userId` for verified studies and are byte-identical for anonymous ones; `sanitizeParticipant` strips `passwordHash`.
- **Role matrix as a test, not a document:** a table-driven test asserting each of the six roles against every identity endpoint, including the `researcher` + identity-role mutual-exclusion 403.
- **Boundary check (structural, run in CI):** assert `identity-service` has no route returning a PII field on `:3003`, and that its compose `networks:` list contains no Mongo/Neo4j network.
- **End-to-end on the local stack** (`docker-compose.local.yml`, `make` targets): import a 5-row CSV → confirm the response echoes no PII → print the PDF sheet → onboard a real mobile client through `/onboard` → redeem an HHV code → verify `enrollments.subjectCode` is set and `studyCodeUsed` is null → export the ZIP and grep it for the imported names (must be absent) → run a re-identification request end to end with two accounts and confirm a single-account attempt is refused → export the audit log and confirm the reveal appears exactly once.
- **Negative test worth writing explicitly:** `mongodump` the research DB and grep the dump for an imported surname. Must return nothing. This is the one-line demonstration for the ethics board.

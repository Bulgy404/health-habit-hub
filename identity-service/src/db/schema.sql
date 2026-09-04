-- Identity register schema.
--
-- Postgres, deliberately NOT MongoDB: using a different engine from the
-- research databases makes it structurally impossible for this register to be
-- swept into `mongodump` (backup-service/backup.sh) or into
-- studyExportService's collection loop. That mistake would require a code
-- change rather than a mis-set connection string.
--
-- No pgcrypto. All encryption happens in Node, so the database never sees a
-- key and a stolen dump is inert on its own.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid() only, no crypto

-- ── Registers ───────────────────────────────────────────────────────────────
-- One row per HHH study running in verified-identity mode.

CREATE TABLE IF NOT EXISTS study_registers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The HHH study this register belongs to (Mongo ObjectId, 24 hex chars).
  -- Stored as text: this service must never depend on the research database.
  hhh_study_id        text        NOT NULL UNIQUE,
  subject_code_prefix text        NOT NULL,
  -- Per-register DEK, wrapped under KEK_{kek_version}. See src/crypto/envelope.js.
  dek_wrapped         bytea       NOT NULL,
  kek_version         int         NOT NULL,
  -- Sequential subject numbering, allocated under a row lock.
  next_subject_seq    int         NOT NULL DEFAULT 1,
  status              text        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'closed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text        NOT NULL,
  CONSTRAINT subject_code_prefix_shape
    CHECK (subject_code_prefix ~ '^[A-Z0-9][A-Z0-9-]{1,31}$')
);

-- ── Subjects ────────────────────────────────────────────────────────────────
-- The people. Every identifying field is envelope-encrypted; the *_bi columns
-- are keyed blind indexes enabling exact match without decryption.

CREATE TABLE IF NOT EXISTS subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id     uuid        NOT NULL REFERENCES study_registers(id) ON DELETE CASCADE,
  -- Human-readable pseudonym, e.g. TUD-DFG01-0042. This — and only this — is
  -- what crosses into HHH and appears in researcher exports.
  subject_code    text        NOT NULL,
  site_id         text,       -- nullable: study-level today, site-level ready

  given_name_ct   bytea,
  family_name_ct  bytea,
  dob_ct          bytea,
  email_ct        bytea,
  phone_ct        bytea,
  address_ct      bytea,
  external_id_ct  bytea,      -- the site's own screening/patient number
  notes_ct        bytea,

  email_bi        bytea,
  external_id_bi  bytea,
  person_bi       bytea,      -- duplicate WARNING only; never a lookup key
  bi_version      int         NOT NULL,

  status          text        NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered', 'code_issued', 'enrolled',
                                      'withdrawn', 'excluded')),
  verified_at     timestamptz,
  verified_by     text,
  verification_method text
                    CHECK (verification_method IS NULL
                           OR verification_method IN ('in_person', 'email', 'sms')),

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subject_code_unique_per_register UNIQUE (register_id, subject_code),
  -- Exact-match lookups. Partial so that many subjects without an email do not
  -- all collide on NULL.
  CONSTRAINT email_bi_unique_per_register UNIQUE (register_id, email_bi),
  CONSTRAINT external_id_bi_unique_per_register UNIQUE (register_id, external_id_bi)
);

CREATE INDEX IF NOT EXISTS subjects_register_status ON subjects (register_id, status);
CREATE INDEX IF NOT EXISTS subjects_person_bi ON subjects (register_id, person_bi);
CREATE INDEX IF NOT EXISTS subjects_site ON subjects (register_id, site_id);

-- ── Account links ───────────────────────────────────────────────────────────
-- A TABLE, not a column on subjects, because one subject may hold several HHH
-- accounts over time: losing the 24-word passphrase means a new Keycloak `sub`,
-- and that participant must not appear in the research data as two people.

CREATE TABLE IF NOT EXISTS subject_account_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  keycloak_sub_ct bytea       NOT NULL,
  keycloak_sub_bi bytea       NOT NULL,
  hhh_group_id    text,
  linked_at       timestamptz NOT NULL DEFAULT now(),
  superseded_at   timestamptz,
  CONSTRAINT keycloak_sub_bi_unique UNIQUE (keycloak_sub_bi)
);

CREATE INDEX IF NOT EXISTS links_subject ON subject_account_links (subject_id);
-- At most one live link per subject; superseded ones stay for the audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS links_one_active_per_subject
  ON subject_account_links (subject_id) WHERE superseded_at IS NULL;

-- ── Enrollment codes ────────────────────────────────────────────────────────
-- Bearer credentials that grant enrollment AS A SPECIFIC IDENTIFIED SUBJECT,
-- so they get credential treatment: looked up by keyed digest, with the
-- plaintext kept encrypted only so a nurse can reprint a sheet.

CREATE TABLE IF NOT EXISTS enrollment_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code_hash      bytea       NOT NULL UNIQUE,   -- HMAC(pepper_code, upper(code))
  code_ct        bytea       NOT NULL,          -- for reprinting only
  status         text        NOT NULL DEFAULT 'issued'
                   CHECK (status IN ('issued', 'reserved', 'redeemed', 'revoked', 'expired')),
  reservation_id uuid,
  reserved_at    timestamptz,
  redeemed_at    timestamptz,
  expires_at     timestamptz,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  issued_by      text        NOT NULL,
  delivered_at   timestamptz,
  delivery_method text
                   CHECK (delivery_method IS NULL
                          OR delivery_method IN ('in_person', 'email', 'sms')),
  CONSTRAINT reserved_implies_reservation
    CHECK (status <> 'reserved' OR reservation_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS codes_subject ON enrollment_codes (subject_id);
CREATE INDEX IF NOT EXISTS codes_reservation ON enrollment_codes (reservation_id)
  WHERE reservation_id IS NOT NULL;
-- Drives the sweeper that reclaims reservations abandoned mid-protocol.
CREATE INDEX IF NOT EXISTS codes_stale_reservations ON enrollment_codes (reserved_at)
  WHERE status = 'reserved';

-- ── Access scoping ──────────────────────────────────────────────────────────
-- A realm role says WHAT someone may do; this says WHERE. A study-nurse with
-- no row here can see no roster at all.

CREATE TABLE IF NOT EXISTS study_site_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid        NOT NULL REFERENCES study_registers(id) ON DELETE CASCADE,
  actor_sub   text        NOT NULL,
  role        text        NOT NULL
                CHECK (role IN ('identity-manager', 'study-nurse', 'monitor')),
  site_id     text,       -- NULL = whole study
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text        NOT NULL,
  CONSTRAINT assignment_unique UNIQUE (register_id, actor_sub, role, site_id)
);

CREATE INDEX IF NOT EXISTS assignments_actor ON study_site_assignments (actor_sub);

-- ── Re-identification ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reidentification_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id       uuid        NOT NULL REFERENCES study_registers(id) ON DELETE CASCADE,
  -- Exactly one of these identifies the target. subject_code is the normal
  -- direction; keycloak_sub_bi is the reverse ("who is user 8f3a…?"), kept
  -- distinct so the audit log can tell the two acts apart.
  subject_code      text,
  keycloak_sub_bi   bytea,
  request_type      text        NOT NULL
                      CHECK (request_type IN ('identify_subject', 'deanonymize_account')),
  legal_basis       text        NOT NULL
                      CHECK (legal_basis IN ('sae', 'safety_report',
                                             'regulatory_inspection',
                                             'participant_request',
                                             'data_correction', 'other')),
  reason            text        NOT NULL,
  fields_requested  text[]      NOT NULL,
  approvers_required int        NOT NULL DEFAULT 1 CHECK (approvers_required BETWEEN 1 AND 2),

  status            text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected',
                                        'expired', 'revoked')),
  requested_by      text        NOT NULL,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  reveal_expires_at timestamptz,
  reveal_count      int         NOT NULL DEFAULT 0,

  CONSTRAINT target_exactly_one
    CHECK ((subject_code IS NOT NULL) <> (keycloak_sub_bi IS NOT NULL)),
  CONSTRAINT reason_substantive CHECK (char_length(reason) >= 50),
  CONSTRAINT fields_not_empty CHECK (array_length(fields_requested, 1) >= 1),
  -- A safety request must not hide behind a soft legal basis.
  CONSTRAINT deanonymize_requires_safety_basis
    CHECK (request_type <> 'deanonymize_account'
           OR legal_basis IN ('sae', 'safety_report', 'regulatory_inspection'))
);

CREATE INDEX IF NOT EXISTS reid_register_status
  ON reidentification_requests (register_id, status, requested_at DESC);

-- Approvals are their own table so two-approver mode is expressible and so the
-- four-eyes rule can be enforced by the DATABASE rather than by application
-- code that a later refactor could quietly drop.
CREATE TABLE IF NOT EXISTS reidentification_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid        NOT NULL REFERENCES reidentification_requests(id) ON DELETE CASCADE,
  approver_sub text        NOT NULL,
  decision     text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at   timestamptz NOT NULL DEFAULT now(),
  note         text,
  CONSTRAINT one_decision_per_approver UNIQUE (request_id, approver_sub)
);

-- THE four-eyes rule. A trigger rather than a CHECK because the comparison
-- spans two tables. This is the constraint an auditor will ask to see.
CREATE OR REPLACE FUNCTION enforce_four_eyes() RETURNS trigger AS $$
DECLARE
  requester text;
BEGIN
  SELECT requested_by INTO requester
    FROM reidentification_requests WHERE id = NEW.request_id;
  IF requester = NEW.approver_sub THEN
    RAISE EXCEPTION
      'four-eyes violation: % cannot approve their own re-identification request',
      NEW.approver_sub
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS four_eyes ON reidentification_approvals;
CREATE TRIGGER four_eyes
  BEFORE INSERT OR UPDATE ON reidentification_approvals
  FOR EACH ROW EXECUTE FUNCTION enforce_four_eyes();

-- ── Audit ───────────────────────────────────────────────────────────────────
-- In THIS database, so an HHH admin cannot alter it and it travels with the
-- register if the service is ever relocated.
--
-- Records field NAMES, never field VALUES: an audit log that quotes the PII it
-- audits is a second copy of that PII under weaker access controls.

CREATE TABLE IF NOT EXISTS identity_audit_log (
  id           bigserial PRIMARY KEY,
  register_id  uuid REFERENCES study_registers(id) ON DELETE SET NULL,
  actor_sub    text        NOT NULL,
  actor_roles  text[]      NOT NULL,   -- as seen in the token AT THE TIME
  action       text        NOT NULL,
  sensitivity  text        NOT NULL
                 CHECK (sensitivity IN ('list', 'write', 'pii_read', 'reveal', 'export')),
  subject_code text,
  request_id   uuid,
  fields       text[],
  method       text,
  route        text,
  status_code  int,
  ip_hash      bytea,      -- HMAC, never a raw address
  repeat_count int         NOT NULL DEFAULT 1,
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_register_time
  ON identity_audit_log (register_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor ON identity_audit_log (actor_sub, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_sensitivity
  ON identity_audit_log (sensitivity, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_subject_code
  ON identity_audit_log (subject_code) WHERE subject_code IS NOT NULL;

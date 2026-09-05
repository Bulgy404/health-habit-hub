/**
 * Public API — the surface the admin portal talks to, over Keycloak bearer
 * tokens.
 *
 * "Public" means routed by Traefik, NOT internet-reachable: the service runs
 * on a private, TU-internal VM. Every route declares its audit classification
 * via `audit(res, …)`, because only the route knows whether it actually
 * decrypted anything.
 */

import express from 'express';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { IDENTITY_ROLES, requireIdentityRole } from '../middleware/roles.js';
import { audit } from '../middleware/audit.js';
import { revealLimiter } from '../middleware/rateLimit.js';
import {
  createSubject,
  importRoster,
  searchSubjects,
  markVerified,
  eraseSubject,
  registerDek,
  SubjectError,
  PII_FIELDS,
} from '../services/subjectService.js';
import {
  createRequest,
  decide,
  reveal,
  revoke,
  ReidError,
} from '../services/reidentificationService.js';
import { buildCodeSheet } from '../services/codeSheet.js';
import { generateEnrollmentCode } from '../services/codes.js';
import { blindIndex } from '../crypto/blindIndex.js';
import {
  encryptField,
  decryptField,
  generateDek,
  wrapDek,
} from '../crypto/envelope.js';

const { MANAGER, NURSE, MONITOR } = IDENTITY_ROLES;

/**
 * In-memory only, and size-capped. NEVER disk storage: a CSV of patient names
 * must not touch a container filesystem, where it would survive the request
 * and land in any volume snapshot.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

/** Map CSV headers to our field names, tolerating German and English sheets. */
const CSV_ALIASES = {
  givenName: ['givenname', 'given_name', 'firstname', 'vorname'],
  familyName: [
    'familyname',
    'family_name',
    'lastname',
    'surname',
    'nachname',
    'name',
  ],
  dateOfBirth: ['dateofbirth', 'date_of_birth', 'dob', 'geburtsdatum', 'geb'],
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'telefon', 'tel', 'mobile'],
  address: ['address', 'adresse'],
  externalId: [
    'externalid',
    'external_id',
    'patientid',
    'patient_id',
    'screeningid',
  ],
  siteId: ['siteid', 'site_id', 'site', 'zentrum'],
  notes: ['notes', 'notiz', 'bemerkung'],
};

export function parseRosterCsv(buffer) {
  const records = parseCsv(buffer, {
    columns: (header) =>
      header.map((h) => {
        const norm = String(h).trim().toLowerCase().replace(/\s+/g, '');
        for (const [field, aliases] of Object.entries(CSV_ALIASES)) {
          if (aliases.includes(norm)) return field;
        }
        return `_ignored_${norm}`;
      }),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return records.map((r) => {
    const person = {};
    for (const key of Object.keys(CSV_ALIASES)) {
      if (r[key] != null && String(r[key]).trim() !== '')
        person[key] = String(r[key]).trim();
    }
    return person;
  });
}

export function createPublicRouter({ db, keys, config, auditor, mailer }) {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  /** Resolve the register for an HHH study id, and the caller's scope in it. */
  async function scopeFor(req, res, hhhStudyId) {
    const { rows } = await db.query(
      `SELECT id, subject_code_prefix, hhh_study_id, study_name
         FROM study_registers WHERE hhh_study_id = $1`,
      [hhhStudyId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'register_not_found' });
      return null;
    }
    const register = rows[0];

    // A realm role says WHAT; this says WHERE. A nurse with no assignment row
    // sees nothing at all.
    const { rows: assignments } = await db.query(
      `SELECT role, site_id FROM study_site_assignments
        WHERE register_id = $1 AND actor_sub = $2`,
      [register.id, req.user.sub]
    );
    if (assignments.length === 0) {
      res.status(403).json({ error: 'not_assigned_to_register' });
      return null;
    }
    const sites = assignments.map((a) => a.site_id).filter(Boolean);
    return {
      register,
      // null = whole study
      siteId: sites.length === 1 && assignments.length === 1 ? sites[0] : null,
      roles: assignments.map((a) => a.role),
    };
  }

  /* ── Registers ─────────────────────────────────────────────────────────── */

  /**
   * The registers this caller is assigned to.
   *
   * Without it the portal asked an operator to type a 24-character hexadecimal
   * study id from memory, because the study LIST lives behind `/admin/studies`,
   * which needs `admin` or `researcher` — and a study nurse is neither. So the
   * one role that uses this screen daily was the one role that could not
   * discover what to type.
   *
   * Scoped by assignment, not by realm role: it answers "where may I work",
   * which is the same question `scopeFor` answers per request.
   */
  router.get(
    '/v1/registers',
    requireIdentityRole(MANAGER, NURSE, MONITOR),
    async (req, res) => {
      const { rows } = await db.query(
        `SELECT r.hhh_study_id       AS "hhhStudyId",
                r.subject_code_prefix AS "subjectCodePrefix",
                r.study_name          AS "studyName",
                r.status,
                array_agg(a.role ORDER BY a.role) AS roles
           FROM study_registers r
           JOIN study_site_assignments a
             ON a.register_id = r.id AND a.actor_sub = $1
          GROUP BY r.id
          ORDER BY r.created_at`,
        [req.user.sub]
      );
      res.json({ registers: rows });
    }
  );

  /**
   * Does a register exist for this study, and is the caller assigned to it?
   *
   * Deliberately does NOT go through `scopeFor`: that answers 404 for "no
   * register" and 403 for "not assigned", and the portal needs to tell those
   * apart to decide whether to offer "create a register" or "ask a manager to
   * assign you". Distinguishing them from a thrown error string would be
   * brittle in exactly the place an operator is already confused.
   *
   * Returns no roster data and no identifying field — only whether the thing
   * exists and what prefix it mints, both of which the caller's realm role
   * already entitles them to know.
   */
  router.get(
    '/v1/studies/:studyId/register',
    requireIdentityRole(MANAGER, NURSE, MONITOR),
    async (req, res) => {
      const { rows } = await db.query(
        `SELECT id, subject_code_prefix AS "subjectCodePrefix",
                study_name AS "studyName"
           FROM study_registers WHERE hhh_study_id = $1`,
        [req.params.studyId]
      );
      if (rows.length === 0) return res.json({ exists: false });

      const { rows: mine } = await db.query(
        `SELECT role FROM study_site_assignments
          WHERE register_id = $1 AND actor_sub = $2`,
        [rows[0].id, req.user.sub]
      );
      res.json({
        exists: true,
        subjectCodePrefix: rows[0].subjectCodePrefix,
        studyName: rows[0].studyName,
        assigned: mine.length > 0,
        roles: mine.map((r) => r.role),
      });
    }
  );

  router.post(
    '/v1/studies/:studyId/register',
    requireIdentityRole(MANAGER),
    async (req, res) => {
      const { subjectCodePrefix, studyName } = req.body ?? {};
      if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(subjectCodePrefix ?? '')) {
        return res.status(400).json({ error: 'invalid_prefix' });
      }
      // Display-only, so it is length-capped rather than pattern-checked — it
      // ends up on a printed handout and in an email subject, not in a query.
      const label =
        typeof studyName === 'string' && studyName.trim()
          ? studyName.trim().slice(0, 120)
          : null;
      const dek = generateDek();
      const { rows: idRows } = await db.query('SELECT gen_random_uuid() AS id');
      const registerId = idRows[0].id;

      await db.query(
        `INSERT INTO study_registers
           (id, hhh_study_id, subject_code_prefix, dek_wrapped, kek_version,
            study_name, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          registerId,
          req.params.studyId,
          subjectCodePrefix,
          wrapDek({
            kek: keys.kek,
            registerId,
            kekVersion: keys.kekVersion,
            dek,
          }),
          keys.kekVersion,
          label,
          req.user.sub,
        ]
      );
      // The creator is assigned automatically, or they could not use what they
      // just made.
      await db.query(
        `INSERT INTO study_site_assignments (register_id, actor_sub, role, created_by)
         VALUES ($1,$2,'identity-manager',$3)`,
        [registerId, req.user.sub, req.user.sub]
      );

      audit(res, {
        registerId,
        action: 'create_register',
        sensitivity: 'write',
      });
      res
        .status(201)
        .json({ id: registerId, subjectCodePrefix, studyName: label });
    }
  );

  /* ── Access assignments ────────────────────────────────────────────────── */
  // A realm role says WHAT someone may do; these rows say WHERE. Without one a
  // holder of study-nurse sees no roster at all, so this is the difference
  // between a configured register and a usable one.

  router.get(
    '/v1/studies/:studyId/assignments',
    requireIdentityRole(MANAGER, MONITOR),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      const { rows } = await db.query(
        `SELECT actor_sub AS "actorSub", role, site_id AS "siteId"
           FROM study_site_assignments WHERE register_id = $1
          ORDER BY role, actor_sub`,
        [scope.register.id]
      );
      audit(res, {
        registerId: scope.register.id,
        action: 'list_assignments',
        sensitivity: 'list',
      });
      res.json({ assignments: rows });
    }
  );

  router.post(
    '/v1/studies/:studyId/assignments',
    requireIdentityRole(MANAGER),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      const { actorSub, role, siteId = null } = req.body ?? {};
      if (
        !actorSub ||
        !['identity-manager', 'study-nurse', 'monitor'].includes(role)
      ) {
        return res.status(400).json({ error: 'invalid_assignment' });
      }
      await db.query(
        `INSERT INTO study_site_assignments (register_id, actor_sub, role, site_id, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (register_id, actor_sub, role, site_id) DO NOTHING`,
        [scope.register.id, actorSub, role, siteId, req.user.sub]
      );
      audit(res, {
        registerId: scope.register.id,
        action: 'grant_assignment',
        sensitivity: 'write',
        detail: { actorSub, role, siteId },
      });
      res.status(201).json({ ok: true });
    }
  );

  router.delete(
    '/v1/studies/:studyId/assignments',
    requireIdentityRole(MANAGER),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      const { actorSub, role } = req.body ?? {};

      // Refuse to remove the last identity-manager. A register nobody can
      // administer needs database surgery to recover, and the person doing
      // this is usually removing themselves.
      if (role === 'identity-manager') {
        const { rows } = await db.query(
          `SELECT count(*)::int AS n FROM study_site_assignments
            WHERE register_id = $1 AND role = 'identity-manager'`,
          [scope.register.id]
        );
        if (rows[0].n <= 1) {
          return res.status(409).json({
            error: 'last_manager',
            message:
              'This is the only identity-manager for the register. Assign ' +
              'another before removing this one, or nobody will be able to ' +
              'administer it.',
          });
        }
      }

      await db.query(
        `DELETE FROM study_site_assignments
          WHERE register_id = $1 AND actor_sub = $2 AND role = $3`,
        [scope.register.id, actorSub, role]
      );
      audit(res, {
        registerId: scope.register.id,
        action: 'revoke_assignment',
        sensitivity: 'write',
        detail: { actorSub, role },
      });
      res.json({ ok: true });
    }
  );

  /* ── Subjects ──────────────────────────────────────────────────────────── */

  router.get(
    '/v1/studies/:studyId/subjects',
    requireIdentityRole(MANAGER, NURSE, MONITOR),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;

      // A monitor sees codes and status, never names — and on that path
      // nothing is decrypted at all.
      const includePii = scope.roles.some(
        (r) => r === 'identity-manager' || r === 'study-nurse'
      );

      const subjects = await searchSubjects({
        db,
        keys,
        registerId: scope.register.id,
        query: String(req.query.q ?? ''),
        siteId: scope.siteId,
        includePii,
        limit: Math.min(500, Number(req.query.limit) || 200),
      });

      audit(res, {
        registerId: scope.register.id,
        action: 'list_subjects',
        sensitivity: includePii ? 'pii_read' : 'list',
        fields: includePii
          ? ['givenName', 'familyName', 'dateOfBirth', 'email']
          : null,
      });
      res.json({ subjects });
    }
  );

  router.post(
    '/v1/studies/:studyId/subjects',
    requireIdentityRole(MANAGER, NURSE),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      try {
        const out = await createSubject({
          db,
          keys,
          registerId: scope.register.id,
          actorSub: req.user.sub,
          person: req.body ?? {},
          siteId: req.body?.siteId ?? scope.siteId,
        });
        audit(res, {
          registerId: scope.register.id,
          action: 'create_subject',
          sensitivity: 'write',
          subjectCode: out.subjectCode,
        });
        res.status(201).json(out);
      } catch (err) {
        if (err instanceof SubjectError) {
          return res
            .status(err.status)
            .json({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  router.post(
    '/v1/studies/:studyId/subjects/import',
    requireIdentityRole(MANAGER),
    upload.single('file'),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      if (!req.file) return res.status(400).json({ error: 'file_required' });

      let people;
      try {
        people = parseRosterCsv(req.file.buffer);
      } catch {
        // Never echo the parser's message: it quotes the offending line.
        return res.status(400).json({ error: 'csv_unparseable' });
      }
      if (people.length === 0)
        return res.status(400).json({ error: 'csv_empty' });
      if (people.length > 5000)
        return res.status(400).json({ error: 'csv_too_large' });

      const report = await importRoster({
        db,
        keys,
        registerId: scope.register.id,
        actorSub: req.user.sub,
        people,
      });

      audit(res, {
        registerId: scope.register.id,
        action: 'import_roster',
        sensitivity: 'write',
        detail: { imported: report.imported, failed: report.failed },
      });
      res.json(report);
    }
  );

  router.post(
    '/v1/subjects/:id/verify',
    requireIdentityRole(NURSE, MANAGER),
    async (req, res) => {
      const method = req.body?.method ?? 'in_person';
      try {
        await markVerified({
          db,
          subjectId: req.params.id,
          actorSub: req.user.sub,
          method,
        });
        audit(res, {
          action: 'verify_subject',
          sensitivity: 'write',
          detail: { method },
        });
        res.json({ ok: true });
      } catch (err) {
        if (err instanceof SubjectError) {
          return res.status(err.status).json({ error: err.code });
        }
        throw err;
      }
    }
  );

  router.delete(
    '/v1/subjects/:id',
    requireIdentityRole(MANAGER),
    async (req, res) => {
      try {
        const out = await eraseSubject({ db, subjectId: req.params.id });
        audit(res, {
          registerId: out.registerId,
          action: 'erase_subject',
          sensitivity: 'write',
          subjectCode: out.subjectCode,
          detail: {
            note: 'Art. 17 erasure; research data retained pseudonymously',
          },
        });
        // The register id is internal bookkeeping — the caller asked to erase
        // a subject and gets back what was erased, nothing more.
        res.json({ erased: out.erased, subjectCode: out.subjectCode });
      } catch (err) {
        if (err instanceof SubjectError)
          return res.status(err.status).json({ error: err.code });
        throw err;
      }
    }
  );

  /* ── Codes ─────────────────────────────────────────────────────────────── */

  router.post(
    '/v1/subjects/:id/codes',
    requireIdentityRole(MANAGER, NURSE),
    async (req, res) => {
      const { rows } = await db.query(
        `SELECT s.id, s.subject_code, s.register_id FROM subjects s WHERE s.id = $1`,
        [req.params.id]
      );
      if (rows.length === 0)
        return res.status(404).json({ error: 'subject_not_found' });
      const subject = rows[0];

      const dek = await registerDek({
        db,
        keys,
        registerId: subject.register_id,
      });
      const code = generateEnrollmentCode();
      const expiresAt = new Date(
        Date.now() + (Number(req.body?.expiresInDays) || 90) * 86_400_000
      );

      // RETURNING the id so the caller can immediately offer "send this by
      // email". Without it the invite endpoint is unreachable from the moment
      // a code is minted — the only other way to learn a code's id is a
      // database query.
      const { rows: codeRows } = await db.query(
        `INSERT INTO enrollment_codes
         (subject_id, code_hash, code_ct, expires_at, issued_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
        [
          subject.id,
          blindIndex(keys.peppers.code, code),
          encryptField({
            key: dek,
            subjectId: subject.id,
            fieldName: 'enrolment_code',
            plaintext: code,
          }),
          expiresAt,
          req.user.sub,
        ]
      );
      await db.query(
        `UPDATE subjects SET status = 'code_issued', updated_at = now()
        WHERE id = $1 AND status = 'registered'`,
        [subject.id]
      );

      audit(res, {
        registerId: subject.register_id,
        action: 'issue_code',
        sensitivity: 'write',
        subjectCode: subject.subject_code,
      });
      // Returned once, to be printed or sent. Not retrievable in plaintext
      // afterwards except through the sheet.
      res.status(201).json({
        code,
        codeId: codeRows[0].id,
        subjectCode: subject.subject_code,
        expiresAt,
      });
    }
  );

  router.post(
    '/v1/subjects/:id/codes/:codeId/send',
    requireIdentityRole(MANAGER, NURSE),
    async (req, res) => {
      const { rows } = await db.query(
        `SELECT s.id, s.subject_code, s.register_id, s.email_ct,
                c.code_ct, c.expires_at, r.study_name
           FROM subjects s
           JOIN enrollment_codes c ON c.id = $2 AND c.subject_id = s.id
           JOIN study_registers r ON r.id = s.register_id
          WHERE s.id = $1 AND c.status = 'issued'`,
        [req.params.id, req.params.codeId]
      );
      if (rows.length === 0)
        return res.status(404).json({ error: 'code_not_found' });
      const row = rows[0];

      const dek = await registerDek({ db, keys, registerId: row.register_id });
      const email = decryptField({
        key: dek,
        subjectId: row.id,
        fieldName: PII_FIELDS.email,
        ciphertext: row.email_ct,
      });
      if (!email) return res.status(400).json({ error: 'no_email_on_file' });

      const code = decryptField({
        key: dek,
        subjectId: row.id,
        fieldName: 'enrolment_code',
        ciphertext: row.code_ct,
      });

      // The address is decrypted here, used, and discarded. It is never
      // returned to the caller, never passed to HHH, and never logged.
      const result = await mailer.sendInvite({
        to: email,
        code,
        // From the register, not the request: what a participant is told
        // they enrolled in must not be whatever the caller happened to send.
        studyName: row.study_name ?? 'the study',
        expiresAt: row.expires_at,
      });

      if (result.sent) {
        await db.query(
          `UPDATE enrollment_codes
              SET delivered_at = now(), delivery_method = 'email'
            WHERE id = $1`,
          [req.params.codeId]
        );
      }

      audit(res, {
        registerId: row.register_id,
        action: 'send_invite',
        sensitivity: 'pii_read',
        subjectCode: row.subject_code,
        fields: ['email'],
        detail: { sent: result.sent, reason: result.reason ?? null },
      });
      // Reports only whether it went, never to where.
      res.json({ sent: result.sent, reason: result.reason ?? null });
    }
  );

  router.get(
    '/v1/studies/:studyId/codes/sheet.pdf',
    requireIdentityRole(MANAGER, NURSE),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;

      const dek = await registerDek({
        db,
        keys,
        registerId: scope.register.id,
      });
      const params = [scope.register.id];
      let sql = `SELECT s.id, s.subject_code, s.given_name_ct, s.family_name_ct, s.dob_ct,
                        c.code_ct
                   FROM subjects s
                   LEFT JOIN LATERAL (
                     SELECT code_ct FROM enrollment_codes
                      WHERE subject_id = s.id AND status IN ('issued','reserved')
                      ORDER BY issued_at DESC LIMIT 1
                   ) c ON true
                  WHERE s.register_id = $1`;
      if (scope.siteId) {
        params.push(scope.siteId);
        sql += ` AND s.site_id = $${params.length}`;
      }
      sql += ' ORDER BY s.subject_code';

      const { rows } = await db.query(sql, params);
      const sheetRows = rows.map((r) => ({
        subjectCode: r.subject_code,
        givenName: decryptField({
          key: dek,
          subjectId: r.id,
          fieldName: PII_FIELDS.givenName,
          ciphertext: r.given_name_ct,
        }),
        familyName: decryptField({
          key: dek,
          subjectId: r.id,
          fieldName: PII_FIELDS.familyName,
          ciphertext: r.family_name_ct,
        }),
        dateOfBirth: decryptField({
          key: dek,
          subjectId: r.id,
          fieldName: PII_FIELDS.dateOfBirth,
          ciphertext: r.dob_ct,
        }),
        code: r.code_ct
          ? decryptField({
              key: dek,
              subjectId: r.id,
              fieldName: 'enrolment_code',
              ciphertext: r.code_ct,
            })
          : null,
      }));

      const pdf = await buildCodeSheet({
        studyName: scope.register.study_name ?? 'Study',
        subjectCodePrefix: scope.register.subject_code_prefix,
        rows: sheetRows,
      });

      // The most PII-dense artefact the system produces — audited naming every
      // subject on it.
      audit(res, {
        registerId: scope.register.id,
        action: 'print_code_sheet',
        sensitivity: 'pii_read',
        fields: ['givenName', 'familyName', 'dateOfBirth', 'enrolmentCode'],
        detail: { subjectCount: sheetRows.length },
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="code-sheet-${scope.register.subject_code_prefix}.pdf"`,
        // Never cached — this is a roster of patients.
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      });
      res.send(pdf);
    }
  );

  /* ── Re-identification ─────────────────────────────────────────────────── */

  router.post(
    '/v1/studies/:studyId/reidentification-requests',
    requireIdentityRole(MANAGER),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      try {
        const out = await createRequest({
          db,
          keys,
          registerId: scope.register.id,
          actorSub: req.user.sub,
          ...req.body,
        });
        audit(res, {
          registerId: scope.register.id,
          action: 'request_reidentification',
          sensitivity: 'write',
          subjectCode: req.body?.subjectCode ?? null,
          requestId: out.id,
          fields: req.body?.fieldsRequested ?? null,
          detail: { legalBasis: req.body?.legalBasis },
        });
        res.status(201).json(out);
      } catch (err) {
        if (err instanceof ReidError) {
          return res
            .status(err.status)
            .json({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  router.get(
    '/v1/studies/:studyId/reidentification-requests',
    requireIdentityRole(MANAGER, MONITOR),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      const { rows } = await db.query(
        `SELECT id, subject_code, request_type, legal_basis, reason,
                fields_requested, status, requested_by, requested_at,
                reveal_expires_at, reveal_count
           FROM reidentification_requests
          WHERE register_id = $1
          ORDER BY requested_at DESC
          LIMIT 200`,
        [scope.register.id]
      );
      audit(res, {
        registerId: scope.register.id,
        action: 'list_reidentification_requests',
        sensitivity: 'list',
      });
      res.json({ requests: rows });
    }
  );

  router.post(
    '/v1/reidentification-requests/:id/decide',
    requireIdentityRole(MONITOR, MANAGER),
    async (req, res) => {
      try {
        const out = await decide({
          db,
          requestId: req.params.id,
          approverSub: req.user.sub,
          decision: req.body?.decision,
          note: req.body?.note ?? null,
          revealTtlMinutes: Number(req.body?.revealTtlMinutes) || 60,
        });
        audit(res, {
          action: `reidentification_${req.body?.decision}`,
          sensitivity: 'write',
          requestId: req.params.id,
        });
        res.json(out);
      } catch (err) {
        if (err instanceof ReidError) {
          return res
            .status(err.status)
            .json({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  router.get(
    '/v1/reidentification-requests/:id/reveal',
    revealLimiter,
    requireIdentityRole(MANAGER),
    async (req, res) => {
      try {
        const out = await reveal({
          db,
          keys,
          requestId: req.params.id,
          actorSub: req.user.sub,
        });
        // NEVER deduplicated. Every reveal is individually visible.
        audit(res, {
          action: 'reveal',
          sensitivity: 'reveal',
          subjectCode: out.subjectCode,
          requestId: req.params.id,
          fields: Object.keys(out.fields),
        });

        // A re-identification nobody noticed is the failure mode that ends
        // studies — so this fires on EVERY reveal, not on a threshold. It
        // carries the subject code and the fields' NAMES, never their values.
        // Fire-and-forget: a mail failure must not deny a clinician the
        // identity they were legitimately approved to see.
        if (config.dpoAlertEmail) {
          void mailer.sendRevealAlert({
            to: config.dpoAlertEmail,
            subjectCode: out.subjectCode,
            actorSub: req.user.sub,
            legalBasis: out.legalBasis ?? 'unknown',
            fields: Object.keys(out.fields),
          });
        }
        res.set(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, private'
        );
        res.json(out);
      } catch (err) {
        if (err instanceof ReidError) {
          return res
            .status(err.status)
            .json({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  router.post(
    '/v1/reidentification-requests/:id/revoke',
    requireIdentityRole(MONITOR),
    async (req, res) => {
      const out = await revoke({ db, requestId: req.params.id });
      audit(res, {
        action: 'revoke_reidentification',
        sensitivity: 'write',
        requestId: req.params.id,
      });
      res.json(out);
    }
  );

  /* ── Audit ─────────────────────────────────────────────────────────────── */

  router.get(
    '/v1/studies/:studyId/audit',
    requireIdentityRole(MONITOR, MANAGER),
    async (req, res) => {
      const scope = await scopeFor(req, res, req.params.studyId);
      if (!scope) return;
      const { rows } = await db.query(
        `SELECT id, actor_sub, actor_roles, action, sensitivity, subject_code,
                request_id, fields, method, route, status_code, repeat_count,
                detail, created_at
           FROM identity_audit_log
          WHERE register_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [scope.register.id, Math.min(1000, Number(req.query.limit) || 200)]
      );
      audit(res, {
        registerId: scope.register.id,
        action: 'read_audit',
        sensitivity: 'list',
      });
      res.json({ entries: rows });
    }
  );

  return router;
}

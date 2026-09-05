/**
 * End-to-end: the whole chain, against a real PostgreSQL.
 *
 * Every other test in this service uses hand-rolled SQL-shaped fakes. Those
 * are fast and they caught real bugs, but they cannot falsify the things that
 * only a database decides:
 *
 *   - the four-eyes rule, which is a **trigger**, not application code;
 *   - the partial unique index that permits exactly one live account link;
 *   - the reserve/confirm/release protocol, which has no shared transaction
 *     because it spans two databases;
 *   - `RETURNING`-based reveal counting under a second reveal;
 *   - whether the audit trail actually records what we claim it records.
 *
 * Routes are mounted the way `server.js` mounts them, over the real services
 * and the real crypto. Only two things are substituted: JWT verification (it
 * has its own tests, and standing up Keycloak here would test Keycloak) and
 * the SMTP transport.
 *
 * Skips itself, loudly, when `IDENTITY_TEST_DB_URL` is unset — so a developer
 * without Postgres is not blocked, while CI, which sets it, cannot silently
 * lose the coverage.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import express from 'express';
import pg from 'pg';
import { createPublicRouter } from '../src/routes/public.js';
import { createInternalRouter } from '../src/routes/internal.js';
import { createAuditor } from '../src/middleware/audit.js';
import { parseMasterKey, deriveKeys } from '../src/crypto/keys.js';

const DB_URL = process.env.IDENTITY_TEST_DB_URL;

const SERVICE_SECRET = 'test-service-secret';
const STUDY_ID = '0123456789abcdef01234567';

/** Deterministic 32 bytes — this is a test key and must never be a real one. */
const MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

const ACTORS = {
  manager: { sub: 'manager-1', roles: ['identity-manager'] },
  nurse: { sub: 'nurse-1', roles: ['study-nurse'] },
  monitor: { sub: 'monitor-1', roles: ['monitor'] },
  otherMonitor: { sub: 'monitor-2', roles: ['monitor'] },
  researcher: { sub: 'researcher-1', roles: ['researcher'] },
};

let pool;
let server;
let baseUrl;
/** Swapped per request by the fake auth middleware. */
let actor = ACTORS.manager;
const sentMail = [];

describe(
  'identity end-to-end (real PostgreSQL)',
  { skip: skipReason() },
  () => {
    before(async () => {
      pool = new pg.Pool({ connectionString: DB_URL, max: 4 });
      await pool.query(
        readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8')
      );

      const keys = deriveKeys({
        master: parseMasterKey(MASTER_KEY),
        kekVersion: 1,
        biVersion: 1,
      });
      const logger = { info() {}, warn() {}, error() {} };
      const auditor = createAuditor({ db: pool, keys, logger });
      const config = {
        serviceSecret: SERVICE_SECRET,
        reservationTtlMinutes: 10,
        dpoAlertEmail: null,
        smtp: {},
      };
      const mailer = {
        async sendInvite(msg) {
          sentMail.push(msg);
          return { sent: true };
        },
        async sendRevealAlert(msg) {
          sentMail.push(msg);
          return { sent: true };
        },
      };

      const app = express();
      // Stand-in for Keycloak verification. The real middleware has its own
      // tests; running Keycloak here would test Keycloak, not this chain.
      app.use((req, _res, next) => {
        req.user = { sub: actor.sub, realm_access: { roles: actor.roles } };
        next();
      });
      app.use(auditor.middleware);
      app.use(
        '/api',
        createPublicRouter({ db: pool, keys, config, auditor, mailer })
      );
      app.use(
        '/internal',
        createInternalRouter({ db: pool, keys, config, auditor })
      );
      app.use((err, _req, res, _next) => {
        // Mirrors server.js: never echo err.message to the client.
        if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
      });

      server = createServer(app);
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      server?.closeAllConnections();
      await new Promise((r) => server?.close(r));
      await pool?.end();
    });

    beforeEach(async () => {
      // Truncate rather than drop: the schema, its triggers and its partial
      // indexes are the thing under test and must survive between cases.
      await pool.query(
        `TRUNCATE study_registers, subjects, subject_account_links,
                enrollment_codes, study_site_assignments,
                reidentification_requests, reidentification_approvals,
                identity_audit_log RESTART IDENTITY CASCADE`
      );
      actor = ACTORS.manager;
      sentMail.length = 0;
    });

    /* ── helpers ───────────────────────────────────────────────────────────── */

    const api = async (method, path, body, as) => {
      if (as) actor = as;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };

    const internal = (path, body) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-auth-token': SERVICE_SECRET,
        },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));

    /** Register + assignments for every actor that needs one. */
    async function setupRegister() {
      const created = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/register`,
        { subjectCodePrefix: 'TUD-E2E' },
        ACTORS.manager
      );
      assert.equal(created.status, 201);
      for (const a of [ACTORS.nurse, ACTORS.monitor, ACTORS.otherMonitor]) {
        const r = await api(
          'POST',
          `/api/v1/studies/${STUDY_ID}/assignments`,
          { actorSub: a.sub, role: a.roles[0] },
          ACTORS.manager
        );
        assert.equal(r.status, 201);
      }
      return created.body.id;
    }

    async function addSubject(person = {}) {
      const res = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/subjects`,
        {
          givenName: 'Anna',
          familyName: 'Beispiel',
          dateOfBirth: '1980-05-04',
          email: 'anna@example.org',
          ...person,
        },
        ACTORS.manager
      );
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    }

    /* ── the chain ─────────────────────────────────────────────────────────── */

    test('a register is created, and its creator is assigned to it automatically', async () => {
      await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/register`,
        { subjectCodePrefix: 'TUD-E2E' },
        ACTORS.manager
      );
      const { body } = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/assignments`,
        null,
        ACTORS.manager
      );
      assert.deepEqual(
        body.assignments.map((a) => [a.actorSub, a.role]),
        [['manager-1', 'identity-manager']],
        'a register nobody can administer would need database surgery to recover'
      );
    });

    test('a nurse with the right role but no assignment sees nothing', async () => {
      await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/register`,
        { subjectCodePrefix: 'TUD-E2E' },
        ACTORS.manager
      );
      const res = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/subjects`,
        null,
        ACTORS.nurse
      );
      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'not_assigned_to_register');
    });

    test('enrolment: reserve, confirm, and the participant is linked exactly once', async () => {
      await setupRegister();
      const subject = await addSubject();

      const issued = await api(
        'POST',
        `/api/v1/subjects/${subject.id}/codes`,
        {},
        ACTORS.nurse
      );
      assert.equal(issued.status, 201);
      assert.match(issued.body.code, /^HHV-/);

      const reserved = await internal('/internal/v1/codes/reserve', {
        code: issued.body.code,
      });
      assert.equal(reserved.status, 200);
      assert.equal(reserved.body.subjectCode, subject.subjectCode);
      // The reservation must not carry identity across the boundary.
      assert.deepEqual(
        Object.keys(reserved.body).sort(),
        ['expiresAt', 'hhhStudyId', 'reservationId', 'subjectCode'],
        'the internal API must never return a name'
      );

      const confirmed = await internal('/internal/v1/codes/confirm', {
        reservationId: reserved.body.reservationId,
        keycloakSub: 'participant-1',
        hhhGroupId: 'group-a',
      });
      assert.equal(confirmed.status, 200);

      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM subject_account_links
        WHERE subject_id = $1 AND revoked_at IS NULL`,
        [subject.id]
      );
      assert.equal(rows[0].n, 1);
    });

    test('a code cannot be redeemed twice', async () => {
      await setupRegister();
      const subject = await addSubject();
      const issued = await api(
        'POST',
        `/api/v1/subjects/${subject.id}/codes`,
        {},
        ACTORS.nurse
      );

      const first = await internal('/internal/v1/codes/reserve', {
        code: issued.body.code,
      });
      await internal('/internal/v1/codes/confirm', {
        reservationId: first.body.reservationId,
        keycloakSub: 'participant-1',
        hhhGroupId: 'group-a',
      });

      const second = await internal('/internal/v1/codes/reserve', {
        code: issued.body.code,
      });
      assert.notEqual(second.status, 200);
    });

    test('a crash between reserve and confirm releases the code rather than burning it', async () => {
      await setupRegister();
      const subject = await addSubject();
      const issued = await api(
        'POST',
        `/api/v1/subjects/${subject.id}/codes`,
        {},
        ACTORS.nurse
      );

      const reserved = await internal('/internal/v1/codes/reserve', {
        code: issued.body.code,
      });
      // HHH's error path: the Neo4j enrolment failed after the code was taken.
      await internal('/internal/v1/codes/release', {
        reservationId: reserved.body.reservationId,
      });

      const retry = await internal('/internal/v1/codes/reserve', {
        code: issued.body.code,
      });
      assert.equal(
        retry.status,
        200,
        'a participant must not need a replacement code because of our crash'
      );
    });

    test('re-identification: the requester cannot approve their own request', async () => {
      await setupRegister();
      const subject = await addSubject();

      const created = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/reidentification-requests`,
        {
          subjectCode: subject.subjectCode,
          legalBasis: 'sae',
          reason:
            'Serious adverse event reported by the site; the participant must be contacted today.',
          fieldsRequested: ['givenName', 'familyName'],
        },
        ACTORS.manager
      );
      assert.equal(created.status, 201);

      // The four-eyes rule is a database trigger, so this cannot be bypassed by
      // a change to application code — which is exactly why it is asserted here
      // against the real schema rather than against a fake.
      const selfApproved = await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/decide`,
        { decision: 'approved' },
        ACTORS.manager
      );
      assert.notEqual(selfApproved.status, 200);

      const approved = await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/decide`,
        { decision: 'approved' },
        ACTORS.monitor
      );
      assert.equal(approved.status, 200);
    });

    test('a reveal returns only the requested fields, and counts every view', async () => {
      await setupRegister();
      const subject = await addSubject();

      const created = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/reidentification-requests`,
        {
          subjectCode: subject.subjectCode,
          legalBasis: 'sae',
          reason:
            'Serious adverse event reported by the site; the participant must be contacted today.',
          fieldsRequested: ['givenName'],
        },
        ACTORS.manager
      );
      await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/decide`,
        { decision: 'approved' },
        ACTORS.monitor
      );

      const first = await api(
        'GET',
        `/api/v1/reidentification-requests/${created.body.id}/reveal`,
        null,
        ACTORS.manager
      );
      assert.equal(first.status, 200);
      assert.equal(first.body.fields.givenName, 'Anna');
      assert.equal(
        first.body.fields.familyName,
        undefined,
        'asking for a first name must not also return a surname'
      );

      const second = await api(
        'GET',
        `/api/v1/reidentification-requests/${created.body.id}/reveal`,
        null,
        ACTORS.manager
      );
      assert.equal(
        second.body.revealCount,
        first.body.revealCount + 1,
        'reveal counting is done by the database precisely so two views cannot report the same number'
      );
    });

    test('a revoked approval cannot be revealed', async () => {
      await setupRegister();
      const subject = await addSubject();
      const created = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/reidentification-requests`,
        {
          subjectCode: subject.subjectCode,
          legalBasis: 'sae',
          reason:
            'Serious adverse event reported by the site; the participant must be contacted today.',
          fieldsRequested: ['givenName'],
        },
        ACTORS.manager
      );
      await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/decide`,
        { decision: 'approved' },
        ACTORS.monitor
      );
      await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/revoke`,
        {},
        ACTORS.monitor
      );

      const revealed = await api(
        'GET',
        `/api/v1/reidentification-requests/${created.body.id}/reveal`,
        null,
        ACTORS.manager
      );
      assert.notEqual(revealed.status, 200);
    });

    test('a researcher is refused everywhere, and never sees a roster', async () => {
      await setupRegister();
      for (const path of [
        `/api/v1/studies/${STUDY_ID}/subjects`,
        `/api/v1/studies/${STUDY_ID}/assignments`,
        `/api/v1/studies/${STUDY_ID}/audit`,
        `/api/v1/studies/${STUDY_ID}/reidentification-requests`,
      ]) {
        const res = await api('GET', path, null, ACTORS.researcher);
        assert.equal(res.status, 403, path);
      }
    });

    test('a monitor sees subject codes but never a name', async () => {
      await setupRegister();
      await addSubject();
      const res = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/subjects`,
        null,
        ACTORS.monitor
      );
      assert.equal(res.status, 200);
      const [row] = res.body.subjects;
      assert.ok(row.subjectCode);
      // Absent, not blank: the response never carries the field at all.
      assert.equal('givenName' in row, false);
      assert.equal('familyName' in row, false);
    });

    test('erasure severs re-identification and leaves the subject code behind', async () => {
      await setupRegister();
      const subject = await addSubject();

      const erased = await api(
        'DELETE',
        `/api/v1/subjects/${subject.id}`,
        {},
        ACTORS.manager
      );
      assert.equal(erased.status, 200);
      assert.equal(erased.body.subjectCode, subject.subjectCode);

      const { rows } = await pool.query(
        `SELECT given_name_ct, family_name_ct, subject_code
         FROM subjects WHERE id = $1`,
        [subject.id]
      );
      assert.equal(
        rows.length,
        1,
        'the tombstone stays, so the code still resolves to nothing'
      );
      assert.equal(rows[0].given_name_ct, null);
      assert.equal(rows[0].family_name_ct, null);
      assert.equal(rows[0].subject_code, subject.subjectCode);
    });

    test('the audit log records the reveal, naming fields but never their values', async () => {
      await setupRegister();
      const subject = await addSubject();
      const created = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/reidentification-requests`,
        {
          subjectCode: subject.subjectCode,
          legalBasis: 'regulatory_inspection',
          reason:
            'Regulatory inspection of the site requires the participant to be identified for the monitor.',
          fieldsRequested: ['givenName', 'email'],
        },
        ACTORS.manager
      );
      await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/decide`,
        { decision: 'approved' },
        ACTORS.monitor
      );
      await api(
        'GET',
        `/api/v1/reidentification-requests/${created.body.id}/reveal`,
        null,
        ACTORS.manager
      );

      const { rows } = await pool.query(
        `SELECT action, sensitivity, subject_code, fields, actor_sub
         FROM identity_audit_log WHERE sensitivity = 'reveal'`
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].subject_code, subject.subjectCode);
      assert.deepEqual(rows[0].fields.sort(), ['email', 'givenName']);

      const dump = JSON.stringify(rows);
      for (const value of ['Anna', 'Beispiel', 'anna@example.org']) {
        assert.equal(
          dump.includes(value),
          false,
          `the audit log must record that ${value} was disclosed, never the value itself`
        );
      }
    });

    test('the roster import stores every row and echoes none of it back', async () => {
      await setupRegister();
      const csv = Buffer.from(
        'Vorname,Nachname,Geburtsdatum\nBea,Muster,1975-01-02\nCarl,Muster,1975-01-02\n'
      );
      const form = new FormData();
      form.append('file', new Blob([csv], { type: 'text/csv' }), 'roster.csv');

      actor = ACTORS.manager;
      const res = await fetch(
        `${baseUrl}/api/v1/studies/${STUDY_ID}/subjects/import`,
        { method: 'POST', body: form }
      );
      const report = await res.json();
      assert.equal(res.status, 200);
      assert.equal(report.imported, 2);

      const dump = JSON.stringify(report);
      for (const value of ['Bea', 'Carl', 'Muster']) {
        assert.equal(
          dump.includes(value),
          false,
          'an import report must not repeat the data it was given'
        );
      }
    });
  }
);

function skipReason() {
  return DB_URL
    ? false
    : 'IDENTITY_TEST_DB_URL is not set — start PostgreSQL and set it to run the end-to-end chain';
}

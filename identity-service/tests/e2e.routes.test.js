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
const OTHER_STUDY_ID = 'fedcba9876543210fedcba98';

/** Deterministic 32 bytes — this is a test key and must never be a real one. */
const MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

const ACTORS = {
  manager: { sub: 'manager-1', roles: ['identity-manager'] },
  nurse: { sub: 'nurse-1', roles: ['study-nurse'] },
  monitor: { sub: 'monitor-1', roles: ['monitor'] },
  otherMonitor: { sub: 'monitor-2', roles: ['monitor'] },
  otherManager: { sub: 'manager-2', roles: ['identity-manager'] },
  multiSiteNurse: { sub: 'nurse-multi', roles: ['study-nurse'] },
  mismatchedManager: { sub: 'nurse-1', roles: ['identity-manager'] },
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
      app.use('/api', createPublicRouter({ db: pool, keys, config, mailer }));
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

    /**
     * Wait for a row the service writes AFTER responding.
     *
     * `auditor.middleware` records on `res.on('finish')` and deliberately does
     * not await the insert — "never blocks the response" is a documented
     * property, because a failing audit write must not break a clinical
     * workflow. So the response reaching this test does not mean the audit row
     * exists yet.
     *
     * These assertions passed for two CI runs by luck and then failed the day
     * a rate limiter shifted the timing by a millisecond. Polling is the
     * correct shape: it asserts the row eventually appears, which is what the
     * product actually promises.
     */
    async function waitForRows(sql, params = [], { timeoutMs = 2000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { rows } = await pool.query(sql, params);
        if (rows.length > 0 || Date.now() > deadline) return rows;
        await new Promise((r) => setTimeout(r, 25));
      }
    }

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

    async function createOtherRegister() {
      const created = await api(
        'POST',
        `/api/v1/studies/${OTHER_STUDY_ID}/register`,
        { subjectCodePrefix: 'OTHER' },
        ACTORS.manager
      );
      assert.equal(created.status, 201);
      return created.body.id;
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

    test('a nurse can discover the registers they are assigned to, and only those', async () => {
      // Without this the portal asked an operator to type a 24-hex study id
      // from memory: the study list needs `admin` or `researcher`, and a nurse
      // is neither.
      await setupRegister();

      const mine = await api('GET', '/api/v1/registers', null, ACTORS.nurse);
      assert.equal(mine.status, 200);
      assert.deepEqual(
        mine.body.registers.map((r) => r.hhhStudyId),
        [STUDY_ID]
      );
      assert.equal(mine.body.registers[0].subjectCodePrefix, 'TUD-E2E');
      assert.deepEqual(mine.body.registers[0].roles, ['study-nurse']);

      // Someone assigned nowhere sees an empty list, not everyone's registers.
      const stranger = await api('GET', '/api/v1/registers', null, {
        sub: 'nurse-elsewhere',
        roles: ['study-nurse'],
      });
      assert.deepEqual(stranger.body.registers, []);
    });

    test('the study label is stored on the register, not taken from the caller', async () => {
      // It ends up on a printed handout and in an invitation. What a
      // participant is told they enrolled in must not be whatever the client
      // happened to send with that particular request.
      await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/register`,
        { subjectCodePrefix: 'TUD-E2E', studyName: 'HabConnect ICU' },
        ACTORS.manager
      );
      const state = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/register`,
        null,
        ACTORS.manager
      );
      assert.equal(state.body.studyName, 'HabConnect ICU');
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

    test('an assignment only authorizes the matching token role', async () => {
      await setupRegister();
      const res = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/assignments`,
        null,
        ACTORS.mismatchedManager
      );
      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'not_assigned_for_role');
    });

    test('multiple site assignments remain restricted to exactly those sites', async () => {
      await setupRegister();
      for (const siteId of ['site-a', 'site-b']) {
        const assigned = await api(
          'POST',
          `/api/v1/studies/${STUDY_ID}/assignments`,
          {
            actorSub: ACTORS.multiSiteNurse.sub,
            role: 'study-nurse',
            siteId,
          },
          ACTORS.manager
        );
        assert.equal(assigned.status, 201);
      }
      for (const siteId of ['site-a', 'site-b', 'site-c']) {
        await addSubject({
          givenName: siteId,
          email: `${siteId}@example.org`,
          siteId,
        });
      }

      const roster = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/subjects`,
        null,
        ACTORS.multiSiteNurse
      );
      assert.equal(roster.status, 200);
      assert.deepEqual(
        roster.body.subjects.map((subject) => subject.siteId).sort(),
        ['site-a', 'site-b']
      );

      const escaped = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/subjects`,
        {
          givenName: 'Out',
          familyName: 'Of scope',
          siteId: 'site-c',
        },
        ACTORS.multiSiteNurse
      );
      assert.equal(escaped.status, 403);
      assert.equal(escaped.body.error, 'site_not_assigned');
    });

    test('global resource ids do not bypass register assignments', async () => {
      await setupRegister();
      await createOtherRegister();
      const otherSubject = await api(
        'POST',
        `/api/v1/studies/${OTHER_STUDY_ID}/subjects`,
        { givenName: 'Other', familyName: 'Register' },
        ACTORS.manager
      );
      assert.equal(otherSubject.status, 201);

      const verify = await api(
        'POST',
        `/api/v1/subjects/${otherSubject.body.id}/verify`,
        {},
        ACTORS.nurse
      );
      assert.equal(verify.status, 403);

      const issueCode = await api(
        'POST',
        `/api/v1/subjects/${otherSubject.body.id}/codes`,
        {},
        ACTORS.nurse
      );
      assert.equal(issueCode.status, 403);

      const erase = await api(
        'DELETE',
        `/api/v1/subjects/${otherSubject.body.id}`,
        null,
        ACTORS.otherManager
      );
      assert.equal(erase.status, 403);
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

      // `superseded_at IS NULL` is the live link. A replacement code adds a
      // second row and supersedes the first, so a participant who lost their
      // phone stays one subject rather than becoming two.
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM subject_account_links
        WHERE subject_id = $1 AND superseded_at IS NULL`,
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

    test('trusted re-identification ownership cannot be overridden by the body', async () => {
      const registerId = await setupRegister();
      const subject = await addSubject();
      const otherRegisterId = await createOtherRegister();

      const created = await api(
        'POST',
        `/api/v1/studies/${STUDY_ID}/reidentification-requests`,
        {
          registerId: otherRegisterId,
          actorSub: 'forged-requester',
          subjectCode: subject.subjectCode,
          legalBasis: 'sae',
          reason:
            'Serious adverse event requires contact and this request verifies trusted ownership fields.',
          fieldsRequested: ['givenName'],
        },
        ACTORS.manager
      );
      assert.equal(created.status, 201);

      const { rows } = await pool.query(
        `SELECT register_id, requested_by
           FROM reidentification_requests WHERE id = $1`,
        [created.body.id]
      );
      assert.equal(rows[0].register_id, registerId);
      assert.equal(rows[0].requested_by, ACTORS.manager.sub);
    });

    test('re-identification ids require an assignment to their register', async () => {
      await createOtherRegister();
      const subject = await api(
        'POST',
        `/api/v1/studies/${OTHER_STUDY_ID}/subjects`,
        { givenName: 'Other', familyName: 'Register' },
        ACTORS.manager
      );
      const created = await api(
        'POST',
        `/api/v1/studies/${OTHER_STUDY_ID}/reidentification-requests`,
        {
          subjectCode: subject.body.subjectCode,
          legalBasis: 'sae',
          reason:
            'Serious adverse event requires contact but only assigned staff may approve this request.',
          fieldsRequested: ['givenName'],
        },
        ACTORS.manager
      );
      assert.equal(created.status, 201);

      const decision = await api(
        'POST',
        `/api/v1/reidentification-requests/${created.body.id}/decide`,
        { decision: 'approved' },
        ACTORS.monitor
      );
      assert.equal(decision.status, 403);
      assert.equal(decision.body.error, 'not_assigned_to_register');
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

    test('erasure deletes the person outright and leaves only an audit entry', async () => {
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

      // The row is deleted outright — there is no tombstone in `subjects`,
      // and that is the stronger Art. 17 answer: nothing of the person is
      // kept, not even an empty shell that says one existed.
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM subjects WHERE id = $1`,
        [subject.id]
      );
      assert.equal(rows[0].n, 0);

      // Exactly ONE audit entry, carrying the subject code and no identity —
      // that is what makes the erasure accountable. It used to be written
      // twice, once by the service and once by the route.
      //
      // And it must carry the register: the study audit view filters on it, so
      // a register-less row means an Art. 17 erasure that nobody can find.
      const audit = await waitForRows(
        `SELECT subject_code, register_id FROM identity_audit_log
          WHERE action = 'erase_subject'`
      );
      assert.equal(audit.length, 1);
      assert.equal(audit[0].subject_code, subject.subjectCode);
      assert.ok(
        audit[0].register_id,
        'an erasure recorded against no register is invisible in the audit view'
      );

      // ON DELETE CASCADE takes the account link and any issued codes with
      // it, so nothing left in the register can resolve that code to a person.
      const { rows: links } = await pool.query(
        `SELECT count(*)::int AS n FROM subject_account_links WHERE subject_id = $1`,
        [subject.id]
      );
      assert.equal(links[0].n, 0);

      // The register's sequence is a counter on the register, not a count of
      // rows, so an erased code can never be minted again for someone else.
      const next = await addSubject({ familyName: 'Nachher' });
      assert.notEqual(next.subjectCode, subject.subjectCode);
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

      const rows = await waitForRows(
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

      const visible = await api(
        'GET',
        `/api/v1/studies/${STUDY_ID}/audit`,
        null,
        ACTORS.monitor
      );
      assert.equal(visible.status, 200);
      assert.ok(
        visible.body.entries.some((entry) => entry.action === 'reveal'),
        'the per-study audit endpoint must include its re-identification events'
      );
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

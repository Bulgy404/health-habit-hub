import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseMasterKey, deriveKeys } from '../src/crypto/keys.js';
import { createAuditor } from '../src/middleware/audit.js';

const keys = deriveKeys({
  master: parseMasterKey(randomBytes(32).toString('base64')),
  kekVersion: 1,
  biVersion: 1,
});

function makeDb() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    async query(sql, params) {
      if (sql.includes('INSERT INTO identity_audit_log')) {
        const row = {
          id: nextId++,
          register_id: params[0],
          actor_sub: params[1],
          actor_roles: params[2],
          action: params[3],
          sensitivity: params[4],
          subject_code: params[5],
          request_id: params[6],
          fields: params[7],
          method: params[8],
          route: params[9],
          status_code: params[10],
          ip_hash: params[11],
          detail: params[12],
          repeat_count: 1,
        };
        rows.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (sql.includes('UPDATE identity_audit_log SET repeat_count')) {
        const row = rows.find((r) => r.id === params[0]);
        if (row) row.repeat_count = params[1];
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unhandled SQL: ${sql}`);
    },
  };
}

const silent = { error() {} };

describe('audit records', () => {
  it('records the action, actor and classification', async () => {
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    await record({
      actorSub: 'nurse-1',
      actorRoles: ['study-nurse'],
      action: 'view_roster',
      sensitivity: 'pii_read',
      route: '/subjects',
    });
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].actor_sub, 'nurse-1');
    assert.deepEqual(db.rows[0].actor_roles, ['study-nurse']);
    assert.equal(db.rows[0].sensitivity, 'pii_read');
  });

  it('stores field NAMES, never values', async () => {
    // An audit log that quotes the PII it audits is a second copy of that PII
    // under weaker controls and longer retention.
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    await record({
      actorSub: 'mgr',
      action: 'reveal',
      sensitivity: 'reveal',
      subjectCode: 'TUD-DFG01-0042',
      fields: ['familyName', 'phone'],
    });
    const blob = JSON.stringify(db.rows[0]);
    assert.ok(blob.includes('familyName'), 'field names are recorded');
    assert.ok(!blob.includes('Müller'), 'no value may appear');
    assert.deepEqual(db.rows[0].fields, ['familyName', 'phone']);
  });

  it('hashes the IP rather than storing it', async () => {
    // Staff IP addresses are personal data too, and an audit trail outlives
    // any operational need for them.
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    await record({
      actorSub: 'a',
      action: 'x',
      sensitivity: 'list',
      ip: '141.30.92.7',
    });
    const stored = db.rows[0].ip_hash;
    assert.ok(Buffer.isBuffer(stored));
    assert.ok(
      !stored.toString('utf8').includes('141.30'),
      'raw IP must not be stored'
    );
  });

  it('records the roles held AT THE TIME', async () => {
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    await record({
      actorSub: 'a',
      actorRoles: ['identity-manager', 'monitor'],
      action: 'x',
      sensitivity: 'write',
    });
    assert.deepEqual(db.rows[0].actor_roles, ['identity-manager', 'monitor']);
  });

  it('NEVER throws — a failed audit write must not break the workflow', async () => {
    const db = {
      async query() {
        throw new Error('database on fire');
      },
    };
    let logged = false;
    const { record } = createAuditor({
      db,
      keys,
      logger: {
        error: () => {
          logged = true;
        },
      },
    });
    await record({ actorSub: 'a', action: 'x', sensitivity: 'list' });
    assert.ok(logged, 'but it must be loudly logged');
  });
});

describe('audit deduplication', () => {
  it('collapses repeated list views into one row with a count', async () => {
    // A nurse hammering refresh should read as "viewed roster x5", not five
    // rows — a log nobody can read is not a control.
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    const entry = {
      actorSub: 'nurse-1',
      action: 'view_roster',
      sensitivity: 'list',
      route: '/subjects',
    };
    for (let i = 0; i < 5; i++) await record(entry);

    assert.equal(db.rows.length, 1, 'one row');
    assert.equal(db.rows[0].repeat_count, 5);
  });

  it('NEVER collapses a reveal', async () => {
    // Every re-identification must be individually visible.
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    const entry = {
      actorSub: 'mgr',
      action: 'reveal',
      sensitivity: 'reveal',
      subjectCode: 'TUD-DFG01-0042',
      route: '/reveal',
    };
    for (let i = 0; i < 3; i++) await record(entry);
    assert.equal(db.rows.length, 3, 'three distinct rows');
  });

  it('never collapses writes or exports', async () => {
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    for (const sensitivity of ['write', 'export']) {
      for (let i = 0; i < 3; i++) {
        await record({ actorSub: 'a', action: 'x', sensitivity, route: '/r' });
      }
    }
    assert.equal(db.rows.length, 6);
  });

  it('does not collapse across different actors or subjects', async () => {
    const db = makeDb();
    const { record } = createAuditor({ db, keys, logger: silent });
    await record({
      actorSub: 'a',
      action: 'v',
      sensitivity: 'pii_read',
      route: '/s',
      subjectCode: 'S-1',
    });
    await record({
      actorSub: 'b',
      action: 'v',
      sensitivity: 'pii_read',
      route: '/s',
      subjectCode: 'S-1',
    });
    await record({
      actorSub: 'a',
      action: 'v',
      sensitivity: 'pii_read',
      route: '/s',
      subjectCode: 'S-2',
    });
    assert.equal(db.rows.length, 3);
  });
});

describe('audit middleware', () => {
  function run(auditor, { locals, user, statusCode = 200 }) {
    const handlers = {};
    const req = { user, method: 'GET', path: '/subjects', ip: '10.0.0.1' };
    const res = {
      locals,
      statusCode,
      on(evt, fn) {
        handlers[evt] = fn;
      },
    };
    auditor.middleware(req, res, () => {});
    handlers.finish?.();
  }

  it('writes nothing when a route declares no classification', async () => {
    // Health checks and similar must not fill the trail.
    const db = makeDb();
    const auditor = createAuditor({ db, keys, logger: silent });
    run(auditor, { locals: {}, user: { sub: 'a' } });
    await new Promise((r) => setImmediate(r));
    assert.equal(db.rows.length, 0);
  });

  it('captures the outcome status, including failures', async () => {
    // A refused attempt is itself a meaningful audit signal.
    const db = makeDb();
    const auditor = createAuditor({ db, keys, logger: silent });
    run(auditor, {
      locals: { audit: { action: 'view_roster', sensitivity: 'list' } },
      user: { sub: 'nurse-1', realm_access: { roles: ['study-nurse'] } },
      statusCode: 403,
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(db.rows[0].status_code, 403);
    assert.equal(db.rows[0].actor_sub, 'nurse-1');
  });

  it('labels an unauthenticated caller rather than dropping the entry', async () => {
    const db = makeDb();
    const auditor = createAuditor({ db, keys, logger: silent });
    run(auditor, {
      locals: { audit: { action: 'x', sensitivity: 'list' } },
      user: null,
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(db.rows[0].actor_sub, 'anonymous');
  });
});

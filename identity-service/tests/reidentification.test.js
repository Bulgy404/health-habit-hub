import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseMasterKey, deriveKeys } from '../src/crypto/keys.js';
import { generateDek, wrapDek, encryptField } from '../src/crypto/envelope.js';
import { blindIndex } from '../src/crypto/blindIndex.js';
import {
  createRequest,
  decide,
  reveal,
  revoke,
  expireStaleApprovals,
  REVEALABLE_FIELDS,
  ReidError,
} from '../src/services/reidentificationService.js';
import { PII_FIELDS } from '../src/services/subjectService.js';

const keys = deriveKeys({
  master: parseMasterKey(randomBytes(32).toString('base64')),
  kekVersion: 1,
  biVersion: 1,
});

const REGISTER_ID = randomUUID();
const SUBJECT_ID = randomUUID();
const DEK = generateDek();
const REASON =
  'Participant reported chest pain in the app and must be contacted by the study physician today.';

function makeDb() {
  const enc = (field, value) =>
    encryptField({
      key: DEK,
      subjectId: SUBJECT_ID,
      fieldName: field,
      plaintext: value,
    });

  const state = {
    requests: [],
    approvals: [],
    subject: {
      id: SUBJECT_ID,
      subject_code: 'TUD-DFG01-0042',
      given_name_ct: enc(PII_FIELDS.givenName, 'Anna'),
      family_name_ct: enc(PII_FIELDS.familyName, 'Müller'),
      dob_ct: enc(PII_FIELDS.dateOfBirth, '1990-01-01'),
      email_ct: enc(PII_FIELDS.email, 'anna@example.invalid'),
      phone_ct: enc(PII_FIELDS.phone, '+49 351 000'),
      address_ct: enc(PII_FIELDS.address, 'Musterweg 1'),
      external_id_ct: null,
      notes_ct: null,
    },
    links: [],
    register: {
      id: REGISTER_ID,
      kek_version: 1,
      dek_wrapped: wrapDek({
        kek: keys.kek,
        registerId: REGISTER_ID,
        kekVersion: 1,
        dek: DEK,
      }),
    },
  };

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (
      s.startsWith('BEGIN') ||
      s.startsWith('COMMIT') ||
      s.startsWith('ROLLBACK')
    ) {
      return { rows: [], rowCount: 0 };
    }
    if (
      s.includes('SELECT id, dek_wrapped, kek_version FROM study_registers')
    ) {
      return { rows: [state.register] };
    }
    if (s.startsWith('INSERT INTO reidentification_requests')) {
      const row = {
        id: randomUUID(),
        register_id: params[0],
        subject_code: params[1],
        keycloak_sub_bi: params[2],
        request_type: params[3],
        legal_basis: params[4],
        reason: params[5],
        fields_requested: params[6],
        approvers_required: params[7],
        requested_by: params[8],
        status: 'pending',
        requested_at: new Date(),
        reveal_expires_at: null,
        reveal_count: 0,
      };
      state.requests.push(row);
      return { rows: [row] };
    }
    if (s.includes('FROM reidentification_requests WHERE id = $1 FOR UPDATE')) {
      const r = state.requests.find((x) => x.id === params[0]);
      return { rows: r ? [r] : [] };
    }
    if (s.startsWith('INSERT INTO reidentification_approvals')) {
      const [requestId, approver, decision, note] = params;
      const req = state.requests.find((x) => x.id === requestId);
      // The database trigger, modelled.
      if (req.requested_by === approver) {
        throw new Error(
          'four-eyes violation: cannot approve their own request'
        );
      }
      if (
        state.approvals.some(
          (a) => a.request_id === requestId && a.approver_sub === approver
        )
      ) {
        throw new Error(
          'duplicate key value violates unique constraint "one_decision_per_approver"'
        );
      }
      state.approvals.push({
        request_id: requestId,
        approver_sub: approver,
        decision,
        note,
      });
      return { rows: [], rowCount: 1 };
    }
    if (s.includes("SET status = 'rejected'")) {
      state.requests.find((x) => x.id === params[0]).status = 'rejected';
      return { rows: [], rowCount: 1 };
    }
    if (s.includes('count(*)::int AS n FROM reidentification_approvals')) {
      const n = state.approvals.filter(
        (a) => a.request_id === params[0] && a.decision === 'approved'
      ).length;
      return { rows: [{ n }] };
    }
    if (s.includes("SET status = 'approved'")) {
      const r = state.requests.find((x) => x.id === params[0]);
      r.status = 'approved';
      r.reveal_expires_at = new Date(Date.now() + Number(params[1]) * 60_000);
      return { rows: [], rowCount: 1 };
    }
    if (s.includes('FROM reidentification_requests WHERE id = $1')) {
      const r = state.requests.find((x) => x.id === params[0]);
      // Copy, as the real driver does — so a service that mutates or aliases
      // a result row fails here rather than in production.
      return { rows: r ? [{ ...r }] : [] };
    }
    if (s.includes("SET status = 'expired' WHERE id = $1")) {
      state.requests.find((x) => x.id === params[0]).status = 'expired';
      return { rows: [], rowCount: 1 };
    }
    if (
      s.includes('FROM subjects WHERE register_id = $1 AND subject_code = $2')
    ) {
      return {
        rows: params[1] === state.subject.subject_code ? [state.subject] : [],
      };
    }
    if (s.includes('JOIN subject_account_links')) {
      const hit = state.links.find((l) => l.keycloak_sub_bi.equals(params[1]));
      return { rows: hit ? [state.subject] : [] };
    }
    if (s.includes('SET reveal_count = reveal_count + 1')) {
      const r = state.requests.find((x) => x.id === params[0]);
      r.reveal_count += 1;
      return { rows: [{ reveal_count: r.reveal_count }], rowCount: 1 };
    }
    if (s.includes("SET status = 'revoked'")) {
      const r = state.requests.find(
        (x) => x.id === params[0] && x.status === 'approved'
      );
      if (!r) return { rows: [], rowCount: 0 };
      r.status = 'revoked';
      return { rows: [], rowCount: 1 };
    }
    if (s.includes("SET status = 'expired' WHERE status = 'approved'")) {
      let n = 0;
      for (const r of state.requests) {
        if (r.status === 'approved' && r.reveal_expires_at < new Date()) {
          r.status = 'expired';
          n++;
        }
      }
      return { rows: [], rowCount: n };
    }
    throw new Error(`unhandled SQL: ${s.slice(0, 80)}`);
  }

  const db = { query, state };
  db.connect = async () => ({ query, release() {} });
  return db;
}

const baseRequest = (db, over = {}) =>
  createRequest({
    db,
    keys,
    registerId: REGISTER_ID,
    actorSub: 'manager-1',
    subjectCode: 'TUD-DFG01-0042',
    legalBasis: 'sae',
    reason: REASON,
    fieldsRequested: ['familyName', 'phone'],
    ...over,
  });

describe('createRequest', () => {
  it('creates a pending request', async () => {
    const db = makeDb();
    const r = await baseRequest(db);
    assert.equal(r.status, 'pending');
    assert.ok(r.id);
  });

  it('REQUIRES a substantive reason', async () => {
    // The reason is read by the approver and by any later auditor.
    const db = makeDb();
    await assert.rejects(
      () => baseRequest(db, { reason: 'because' }),
      (e) => e instanceof ReidError && e.code === 'reason_too_short'
    );
  });

  it('rejects an unknown legal basis', async () => {
    await assert.rejects(
      () => baseRequest(makeDb(), { legalBasis: 'curiosity' }),
      (e) => e.code === 'invalid_legal_basis'
    );
  });

  it('rejects a field that is not revealable', async () => {
    await assert.rejects(
      () =>
        baseRequest(makeDb(), { fieldsRequested: ['familyName', 'password'] }),
      (e) => e.code === 'unknown_field'
    );
  });

  it('requires at least one field', async () => {
    await assert.rejects(
      () => baseRequest(makeDb(), { fieldsRequested: [] }),
      (e) => e.code === 'no_fields_requested'
    );
  });

  it('restricts reverse account lookup to safety bases', async () => {
    // "Who is user 8f3a…?" is a different act from "contact subject 0042", and
    // only the safety cases justify it.
    const db = makeDb();
    await assert.rejects(
      () =>
        baseRequest(db, {
          requestType: 'deanonymize_account',
          subjectCode: null,
          keycloakSub: 'kc-1',
          legalBasis: 'participant_request',
        }),
      (e) => e.code === 'basis_not_permitted'
    );

    const ok = await baseRequest(db, {
      requestType: 'deanonymize_account',
      subjectCode: null,
      keycloakSub: 'kc-1',
      legalBasis: 'sae',
    });
    assert.equal(ok.status, 'pending');
  });

  it('requires a target appropriate to the request type', async () => {
    await assert.rejects(
      () => baseRequest(makeDb(), { subjectCode: null }),
      (e) => e.code === 'missing_target'
    );
  });

  it('exposes exactly the encrypted fields as revealable', () => {
    assert.deepEqual(
      [...REVEALABLE_FIELDS].sort(),
      Object.keys(PII_FIELDS).sort()
    );
  });
});

describe('decide — four eyes', () => {
  it('REFUSES self-approval', async () => {
    // Enforced by a database trigger, so it survives a refactor of the service.
    const db = makeDb();
    const { id } = await baseRequest(db);
    await assert.rejects(
      () =>
        decide({
          db,
          requestId: id,
          approverSub: 'manager-1',
          decision: 'approved',
        }),
      (e) => e.code === 'four_eyes_violation' && e.status === 403
    );
    assert.equal(db.state.requests[0].status, 'pending');
  });

  it('approves when a different principal decides', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db);
    const out = await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    assert.equal(out.status, 'approved');
    assert.ok(db.state.requests[0].reveal_expires_at > new Date());
  });

  it('requires two distinct approvers in two-approver mode', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db, { approversRequired: 2 });

    const first = await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    assert.equal(first.status, 'pending', 'one approval is not enough');
    assert.equal(first.required, 2);

    const second = await decide({
      db,
      requestId: id,
      approverSub: 'monitor-2',
      decision: 'approved',
    });
    assert.equal(second.status, 'approved');
  });

  it('will not let one approver vote twice to reach the threshold', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db, { approversRequired: 2 });
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    await assert.rejects(
      () =>
        decide({
          db,
          requestId: id,
          approverSub: 'monitor-1',
          decision: 'approved',
        }),
      (e) => e.code === 'already_voted'
    );
  });

  it('rejects outright on a single rejection', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db, { approversRequired: 2 });
    const out = await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'rejected',
    });
    assert.equal(out.status, 'rejected');
  });

  it('refuses to decide an already-decided request', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db);
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    await assert.rejects(
      () =>
        decide({
          db,
          requestId: id,
          approverSub: 'monitor-2',
          decision: 'approved',
        }),
      (e) => e.code === 'already_decided'
    );
  });

  it('404s an unknown request', async () => {
    await assert.rejects(
      () =>
        decide({
          db: makeDb(),
          requestId: randomUUID(),
          approverSub: 'm',
          decision: 'approved',
        }),
      (e) => e.status === 404
    );
  });
});

describe('reveal', () => {
  async function approved(db, over = {}) {
    const { id } = await baseRequest(db, over);
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
      revealTtlMinutes: 60,
    });
    return id;
  }

  it('returns ONLY the requested fields', async () => {
    // Asking for a phone number must not also hand over an address.
    const db = makeDb();
    const id = await approved(db);
    const out = await reveal({
      db,
      keys,
      requestId: id,
      actorSub: 'manager-1',
    });

    assert.deepEqual(Object.keys(out.fields).sort(), ['familyName', 'phone']);
    assert.equal(out.fields.familyName, 'Müller');
    assert.equal(out.fields.phone, '+49 351 000');
    assert.equal(
      out.fields.address,
      undefined,
      'unrequested fields must be absent'
    );
    assert.equal(out.subjectCode, 'TUD-DFG01-0042');
  });

  it('REFUSES anyone but the original requester', async () => {
    const db = makeDb();
    const id = await approved(db);
    await assert.rejects(
      () => reveal({ db, keys, requestId: id, actorSub: 'monitor-1' }),
      (e) => e.code === 'not_requester' && e.status === 403
    );
  });

  it('REFUSES a request that was never approved', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db);
    await assert.rejects(
      () => reveal({ db, keys, requestId: id, actorSub: 'manager-1' }),
      (e) => e.code === 'not_approved'
    );
  });

  it('REFUSES once the window has closed, and records the expiry', async () => {
    const db = makeDb();
    const id = await approved(db);
    db.state.requests[0].reveal_expires_at = new Date(Date.now() - 1000);

    await assert.rejects(
      () => reveal({ db, keys, requestId: id, actorSub: 'manager-1' }),
      (e) => e.code === 'reveal_expired'
    );
    assert.equal(
      db.state.requests[0].status,
      'expired',
      'expiry is durable, not merely computed'
    );
  });

  it('counts every reveal — they are never deduplicated', async () => {
    const db = makeDb();
    const id = await approved(db);
    assert.equal(
      (await reveal({ db, keys, requestId: id, actorSub: 'manager-1' }))
        .revealCount,
      1
    );
    assert.equal(
      (await reveal({ db, keys, requestId: id, actorSub: 'manager-1' }))
        .revealCount,
      2
    );
  });

  it('reports an erased subject rather than failing obscurely', async () => {
    // Art. 17: the person is gone, so there is nothing to reveal. That is the
    // intended outcome, not an error to work around.
    const db = makeDb();
    const id = await approved(db);
    db.state.subject.subject_code = 'GONE';
    await assert.rejects(
      () => reveal({ db, keys, requestId: id, actorSub: 'manager-1' }),
      (e) => e.code === 'subject_not_found' && /erased/i.test(e.message)
    );
  });

  it('resolves the reverse direction through the account link', async () => {
    const db = makeDb();
    db.state.links.push({
      keycloak_sub_bi: blindIndex(keys.peppers.keycloakSub, 'kc-9'),
    });
    const { id } = await baseRequest(db, {
      requestType: 'deanonymize_account',
      subjectCode: null,
      keycloakSub: 'kc-9',
      legalBasis: 'sae',
    });
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    const out = await reveal({
      db,
      keys,
      requestId: id,
      actorSub: 'manager-1',
    });
    assert.equal(out.fields.familyName, 'Müller');
  });

  it('404s an unlinked account', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db, {
      requestType: 'deanonymize_account',
      subjectCode: null,
      keycloakSub: 'kc-unknown',
      legalBasis: 'sae',
    });
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    await assert.rejects(
      () => reveal({ db, keys, requestId: id, actorSub: 'manager-1' }),
      (e) => e.code === 'account_not_linked'
    );
  });
});

describe('revoke and expiry', () => {
  it('revokes an approved but unused grant', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db);
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });

    assert.deepEqual(await revoke({ db, requestId: id }), { revoked: true });
    await assert.rejects(
      () => reveal({ db, keys, requestId: id, actorSub: 'manager-1' }),
      (e) => e.code === 'not_approved'
    );
  });

  it('does not revoke a pending request', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db);
    assert.deepEqual(await revoke({ db, requestId: id }), { revoked: false });
  });

  it('sweeps grants whose window has passed', async () => {
    const db = makeDb();
    const { id } = await baseRequest(db);
    await decide({
      db,
      requestId: id,
      approverSub: 'monitor-1',
      decision: 'approved',
    });
    db.state.requests[0].reveal_expires_at = new Date(Date.now() - 1000);

    assert.deepEqual(await expireStaleApprovals({ db }), { expired: 1 });
    assert.equal(db.state.requests[0].status, 'expired');
  });
});

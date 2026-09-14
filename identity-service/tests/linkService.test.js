import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseMasterKey, deriveKeys } from '../src/crypto/keys.js';
import { generateDek, wrapDek } from '../src/crypto/envelope.js';
import { blindIndex } from '../src/crypto/blindIndex.js';
import {
  reserveCode,
  confirmReservation,
  releaseReservation,
  sweepStaleReservations,
  LinkError,
} from '../src/services/linkService.js';

const keys = deriveKeys({
  master: parseMasterKey(randomBytes(32).toString('base64')),
  kekVersion: 1,
  biVersion: 1,
});

const REGISTER_ID = randomUUID();
const SUBJECT_ID = randomUUID();

/**
 * A small SQL-shaped fake. Not a Postgres emulator — it recognises the handful
 * of statements this service issues and applies their semantics, in the same
 * hand-rolled style as the backend's unit tests.
 */
function makeDb({
  code = 'HHV-4K7P2-9QX3R',
  status = 'issued',
  expiresAt = null,
} = {}) {
  const state = {
    codes: [
      {
        id: randomUUID(),
        subject_id: SUBJECT_ID,
        code_hash: blindIndex(keys.peppers.code, code),
        status,
        reservation_id: null,
        reserved_at: null,
        expires_at: expiresAt,
      },
    ],
    links: [],
    subjects: [
      {
        id: SUBJECT_ID,
        register_id: REGISTER_ID,
        subject_code: 'TUD-DFG01-0042',
        status: 'code_issued',
      },
    ],
    registers: [
      {
        id: REGISTER_ID,
        hhh_study_id: '507f1f77bcf86cd799439011',
        kek_version: 1,
        dek_wrapped: wrapDek({
          kek: keys.kek,
          registerId: REGISTER_ID,
          kekVersion: 1,
          dek: generateDek(),
        }),
      },
    ],
    committed: false,
    rolledBack: false,
  };

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (
      s.startsWith('BEGIN') ||
      s.startsWith('COMMIT') ||
      s.startsWith('ROLLBACK')
    ) {
      if (s.startsWith('COMMIT')) state.committed = true;
      if (s.startsWith('ROLLBACK')) state.rolledBack = true;
      return { rows: [], rowCount: 0 };
    }

    if (s.includes("SET status = 'reserved'")) {
      const now = new Date();
      const hit = state.codes.find(
        (c) =>
          c.code_hash.equals(params[0]) &&
          c.status === 'issued' &&
          (c.expires_at == null || c.expires_at > now)
      );
      if (!hit) return { rows: [], rowCount: 0 };
      hit.status = 'reserved';
      hit.reservation_id = randomUUID();
      hit.reserved_at = now;
      return { rows: [{ ...hit }], rowCount: 1 };
    }

    if (s.includes('FROM subjects s JOIN study_registers r')) {
      const subj = state.subjects.find((x) => x.id === params[0]);
      if (!subj) return { rows: [], rowCount: 0 };
      const reg = state.registers.find((r) => r.id === subj.register_id);
      return {
        rows: [
          { subject_code: subj.subject_code, hhh_study_id: reg.hhh_study_id },
        ],
      };
    }

    if (s.includes('FROM enrollment_codes WHERE reservation_id')) {
      const hit = state.codes.find(
        (c) => c.reservation_id === params[0] && c.status === 'reserved'
      );
      return { rows: hit ? [{ id: hit.id, subject_id: hit.subject_id }] : [] };
    }

    if (s.includes('FROM study_registers r JOIN subjects s')) {
      const subj = state.subjects.find((x) => x.id === params[0]);
      const reg = state.registers.find((r) => r.id === subj.register_id);
      return {
        rows: [
          {
            id: reg.id,
            dek_wrapped: reg.dek_wrapped,
            kek_version: reg.kek_version,
          },
        ],
      };
    }

    if (s.includes('UPDATE subject_account_links SET superseded_at')) {
      let n = 0;
      for (const l of state.links) {
        if (l.subject_id === params[0] && !l.superseded_at) {
          l.superseded_at = new Date();
          n++;
        }
      }
      return { rows: [], rowCount: n };
    }

    if (s.includes('INSERT INTO subject_account_links')) {
      state.links.push({
        subject_id: params[0],
        keycloak_sub_ct: params[1],
        keycloak_sub_bi: params[2],
        hhh_group_id: params[3],
        superseded_at: null,
      });
      return { rows: [], rowCount: 1 };
    }

    if (s.includes("SET status = 'redeemed'")) {
      const hit = state.codes.find((c) => c.id === params[0]);
      hit.status = 'redeemed';
      hit.redeemed_at = new Date();
      return { rows: [], rowCount: 1 };
    }

    if (s.includes("UPDATE subjects SET status = 'enrolled'")) {
      state.subjects.find((x) => x.id === params[0]).status = 'enrolled';
      return { rows: [], rowCount: 1 };
    }

    if (s.includes('SELECT subject_code FROM subjects')) {
      const subj = state.subjects.find((x) => x.id === params[0]);
      return { rows: [{ subject_code: subj.subject_code }] };
    }

    if (
      s.includes("SET status = 'issued'") &&
      s.includes('reservation_id = $1')
    ) {
      const hit = state.codes.find(
        (c) => c.reservation_id === params[0] && c.status === 'reserved'
      );
      if (!hit) return { rows: [], rowCount: 0 };
      hit.status = 'issued';
      hit.reservation_id = null;
      hit.reserved_at = null;
      return { rows: [], rowCount: 1 };
    }

    if (s.includes("SET status = 'issued'") && s.includes('reserved_at <')) {
      const cutoff = Date.now() - Number(params[0]) * 60_000;
      let n = 0;
      for (const c of state.codes) {
        if (
          c.status === 'reserved' &&
          c.reserved_at &&
          c.reserved_at.getTime() < cutoff
        ) {
          c.status = 'issued';
          c.reservation_id = null;
          c.reserved_at = null;
          n++;
        }
      }
      return { rows: [], rowCount: n };
    }

    throw new Error(`unhandled SQL in fake: ${s.slice(0, 90)}`);
  }

  const db = { query, state };
  db.connect = async () => ({ query, release() {} });
  return db;
}

describe('reserveCode', () => {
  it('claims an issued code and returns the routing fields', async () => {
    const db = makeDb();
    const out = await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    assert.ok(out.reservationId);
    assert.equal(out.subjectCode, 'TUD-DFG01-0042');
    assert.equal(out.hhhStudyId, '507f1f77bcf86cd799439011');
    assert.equal(db.state.codes[0].status, 'reserved');
  });

  it('RETURNS NO PERSONAL DATA — the boundary invariant', async () => {
    // If this ever fails, the separation the whole design rests on is gone.
    const db = makeDb();
    const out = await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    assert.deepEqual(
      Object.keys(out).sort(),
      ['expiresAt', 'hhhStudyId', 'reservationId', 'subjectCode'],
      'the reserve response shape must not grow person-identifying fields'
    );
  });

  it('accepts a code typed with the characters people misread', async () => {
    const db = makeDb({ code: 'HHV-4K7P1-9QX30' });
    // A participant reading O for 0 and I for 1 off a printed sheet.
    const out = await reserveCode({ db, keys, code: 'hhv-4k7pI-9qx3O' });
    assert.equal(out.subjectCode, 'TUD-DFG01-0042');
  });

  it('refuses an unknown code', async () => {
    const db = makeDb();
    await assert.rejects(
      () => reserveCode({ db, keys, code: 'HHV-ZZZZZ-ZZZZZ' }),
      (e) => e instanceof LinkError && e.code === 'code_not_redeemable'
    );
  });

  it('refuses a code that is already redeemed', async () => {
    const db = makeDb({ status: 'redeemed' });
    await assert.rejects(() =>
      reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' })
    );
  });

  it('refuses an expired code', async () => {
    const db = makeDb({ expiresAt: new Date(Date.now() - 1000) });
    await assert.rejects(() =>
      reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' })
    );
  });

  it('cannot be reserved twice — a double tap loses the race', async () => {
    const db = makeDb();
    await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    await assert.rejects(
      () => reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' }),
      (e) => e.code === 'code_not_redeemable'
    );
  });

  it('gives one generic error for every failure mode', async () => {
    // Distinguishing "no such code" from "already used" would let an attacker
    // probe which codes exist.
    const unknown = await reserveCode({
      db: makeDb(),
      keys,
      code: 'HHV-ZZZZZ-ZZZZZ',
    }).catch((e) => e);
    const used = await reserveCode({
      db: makeDb({ status: 'redeemed' }),
      keys,
      code: 'HHV-4K7P2-9QX3R',
    }).catch((e) => e);
    assert.equal(unknown.code, used.code);
    assert.equal(unknown.message, used.message);
  });

  it('rejects empty input', async () => {
    await assert.rejects(() => reserveCode({ db: makeDb(), keys, code: '' }));
  });
});

describe('confirmReservation', () => {
  it('links the account and marks the code redeemed', async () => {
    const db = makeDb();
    const { reservationId } = await reserveCode({
      db,
      keys,
      code: 'HHV-4K7P2-9QX3R',
    });
    const out = await confirmReservation({
      db,
      keys,
      reservationId,
      keycloakSub: 'kc-sub-1',
      hhhGroupId: 'g1',
    });
    assert.equal(out.ok, true);
    assert.equal(out.subjectCode, 'TUD-DFG01-0042');
    assert.equal(db.state.codes[0].status, 'redeemed');
    assert.equal(db.state.subjects[0].status, 'enrolled');
    assert.equal(db.state.links.length, 1);
    assert.ok(db.state.committed);
  });

  it('encrypts the Keycloak sub rather than storing it in the clear', async () => {
    const db = makeDb();
    const { reservationId } = await reserveCode({
      db,
      keys,
      code: 'HHV-4K7P2-9QX3R',
    });
    await confirmReservation({
      db,
      keys,
      reservationId,
      keycloakSub: 'kc-sub-1',
    });
    const link = db.state.links[0];
    assert.ok(Buffer.isBuffer(link.keycloak_sub_ct));
    assert.ok(
      !link.keycloak_sub_ct.toString('utf8').includes('kc-sub-1'),
      'the sub must not be readable in the stored ciphertext'
    );
    assert.ok(
      Buffer.isBuffer(link.keycloak_sub_bi),
      'a blind index is needed for reverse lookup'
    );
  });

  it('supersedes a previous link instead of creating a second live one', async () => {
    // A participant who lost their passphrase gets a new Keycloak sub and must
    // not appear in the research data as two subjects.
    const db = makeDb();
    const first = await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    await confirmReservation({
      db,
      keys,
      reservationId: first.reservationId,
      keycloakSub: 'sub-old',
    });

    db.state.codes[0].status = 'issued'; // nurse issues a replacement
    db.state.codes[0].reservation_id = null;
    const second = await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    await confirmReservation({
      db,
      keys,
      reservationId: second.reservationId,
      keycloakSub: 'sub-new',
    });

    assert.equal(db.state.links.length, 2, 'history is kept');
    assert.equal(
      db.state.links.filter((l) => !l.superseded_at).length,
      1,
      'exactly one live link per subject'
    );
  });

  it('refuses an unknown or already-swept reservation', async () => {
    const db = makeDb();
    await assert.rejects(
      () =>
        confirmReservation({
          db,
          keys,
          reservationId: randomUUID(),
          keycloakSub: 'x',
        }),
      (e) => e.code === 'reservation_not_found' && e.status === 409
    );
  });

  it('requires both a reservation and a subject', async () => {
    const db = makeDb();
    await assert.rejects(() =>
      confirmReservation({ db, keys, reservationId: null, keycloakSub: 'x' })
    );
    const { reservationId } = await reserveCode({
      db,
      keys,
      code: 'HHV-4K7P2-9QX3R',
    });
    await assert.rejects(() =>
      confirmReservation({ db, keys, reservationId, keycloakSub: '' })
    );
  });
});

describe('releaseReservation', () => {
  it('returns a reserved code to issued so the participant can retry', async () => {
    const db = makeDb();
    const { reservationId } = await reserveCode({
      db,
      keys,
      code: 'HHV-4K7P2-9QX3R',
    });
    assert.deepEqual(await releaseReservation({ db, reservationId }), {
      released: true,
    });
    assert.equal(db.state.codes[0].status, 'issued');

    // The same code works again — this is the point.
    const again = await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    assert.ok(again.reservationId);
  });

  it('is idempotent and never throws on the error path', async () => {
    // It runs while another error is being handled; throwing here would mask it.
    const db = makeDb();
    assert.deepEqual(await releaseReservation({ db, reservationId: null }), {
      released: false,
    });
    assert.deepEqual(
      await releaseReservation({ db, reservationId: randomUUID() }),
      { released: false }
    );
  });
});

describe('sweepStaleReservations', () => {
  it('reclaims a reservation abandoned past the TTL', async () => {
    const db = makeDb();
    await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    db.state.codes[0].reserved_at = new Date(Date.now() - 30 * 60_000);

    assert.deepEqual(await sweepStaleReservations({ db, ttlMinutes: 10 }), {
      reclaimed: 1,
    });
    assert.equal(db.state.codes[0].status, 'issued');
  });

  it('leaves a reservation inside the window alone', async () => {
    const db = makeDb();
    await reserveCode({ db, keys, code: 'HHV-4K7P2-9QX3R' });
    assert.deepEqual(await sweepStaleReservations({ db, ttlMinutes: 10 }), {
      reclaimed: 0,
    });
    assert.equal(db.state.codes[0].status, 'reserved');
  });

  it('never touches redeemed codes', async () => {
    const db = makeDb({ status: 'redeemed' });
    assert.deepEqual(await sweepStaleReservations({ db, ttlMinutes: 0 }), {
      reclaimed: 0,
    });
    assert.equal(db.state.codes[0].status, 'redeemed');
  });
});

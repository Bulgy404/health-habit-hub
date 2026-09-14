import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveIdentityConfig,
  isVerifiedStudy,
  frozenFieldChanges,
  DEFAULT_IDENTITY,
} from '../../services/identityConfig.js';

describe('resolveIdentityConfig', () => {
  it('treats a study with no identity field as anonymous', () => {
    // Every study that predates this feature. This is the case that must
    // never regress: it is the entire "existing studies are unaffected"
    // guarantee, and there is no migration backing it up.
    for (const study of [undefined, null, {}, { identity: null }]) {
      assert.equal(resolveIdentityConfig(study).mode, 'anonymous');
      assert.equal(isVerifiedStudy(study), false);
    }
  });

  it('ignores a malformed identity value rather than throwing', () => {
    for (const bad of ['verified', 42, []]) {
      const cfg = resolveIdentityConfig({ identity: bad });
      assert.equal(cfg.mode, 'anonymous');
    }
  });

  it('treats any unrecognised mode as anonymous, never verified', () => {
    // Fail closed: a typo must not silently turn identity collection on.
    for (const mode of ['VERIFIED', 'Verified', 'yes', '', null]) {
      assert.equal(
        resolveIdentityConfig({ identity: { mode } }).mode,
        'anonymous'
      );
    }
  });

  it('reads a verified study', () => {
    const cfg = resolveIdentityConfig({
      identity: { mode: 'verified', subjectCodePrefix: 'TUD-DFG01' },
    });
    assert.equal(cfg.mode, 'verified');
    assert.equal(cfg.subjectCodePrefix, 'TUD-DFG01');
    assert.equal(isVerifiedStudy({ identity: { mode: 'verified' } }), true);
  });

  it('forces researcher scoping on for verified studies', () => {
    // Even if 'open' is stored. Scoping is enforced exactly where identity
    // data exists, without breaking every existing researcher elsewhere.
    const cfg = resolveIdentityConfig({
      identity: { mode: 'verified', researcherScoping: 'open' },
    });
    assert.equal(cfg.researcherScoping, 'scoped');
  });

  it('leaves anonymous studies open by default', () => {
    assert.equal(resolveIdentityConfig({}).researcherScoping, 'open');
    assert.equal(
      resolveIdentityConfig({
        identity: { mode: 'anonymous', researcherScoping: 'scoped' },
      }).researcherScoping,
      'scoped',
      'an anonymous study may still opt in to scoping'
    );
  });

  it('clamps the approver count to 1 or 2', () => {
    const of = (n) =>
      resolveIdentityConfig({ identity: { reidentificationApprovers: n } })
        .reidentificationApprovers;
    assert.equal(of(2), 2);
    assert.equal(of(1), 1);
    for (const bad of [0, 3, -1, 'two', null, 1.5]) assert.equal(of(bad), 1);
  });

  it('rejects an implausibly short reveal window', () => {
    const of = (n) =>
      resolveIdentityConfig({ identity: { revealTtlMinutes: n } })
        .revealTtlMinutes;
    assert.equal(of(30), 30);
    assert.equal(of(1440), 1440);
    for (const bad of [0, 4, -10, null, 'sixty']) {
      assert.equal(of(bad), DEFAULT_IDENTITY.revealTtlMinutes);
    }
  });

  it('defaults verification methods to in-person', () => {
    assert.deepEqual(resolveIdentityConfig({}).verificationMethods, [
      'in_person',
    ]);
    assert.deepEqual(
      resolveIdentityConfig({ identity: { verificationMethods: [] } })
        .verificationMethods,
      ['in_person'],
      'an empty list must not mean "no way to verify anyone"'
    );
    assert.deepEqual(
      resolveIdentityConfig({
        identity: { verificationMethods: ['email', 'sms'] },
      }).verificationMethods,
      ['email', 'sms']
    );
  });

  it('defaults auditReads to on and only honours an explicit false', () => {
    assert.equal(resolveIdentityConfig({}).auditReads, true);
    assert.equal(
      resolveIdentityConfig({ identity: { auditReads: false } }).auditReads,
      false
    );
    assert.equal(
      resolveIdentityConfig({ identity: { auditReads: null } }).auditReads,
      true
    );
  });

  it('does not return a shared mutable default', () => {
    const a = resolveIdentityConfig({});
    a.mode = 'verified';
    a.verificationMethods.push('sms');
    assert.equal(resolveIdentityConfig({}).mode, 'anonymous');
    assert.deepEqual(resolveIdentityConfig({}).verificationMethods, [
      'in_person',
    ]);
  });
});

describe('frozenFieldChanges', () => {
  const verified = {
    identity: { mode: 'verified', subjectCodePrefix: 'TUD-DFG01' },
  };

  it('detects a mode flip', () => {
    assert.deepEqual(frozenFieldChanges(verified, { mode: 'anonymous' }), [
      'mode',
    ]);
    assert.deepEqual(frozenFieldChanges({}, { mode: 'verified' }), ['mode']);
  });

  it('detects a prefix change', () => {
    assert.deepEqual(
      frozenFieldChanges(verified, { subjectCodePrefix: 'OTHER' }),
      ['subjectCodePrefix']
    );
  });

  it('allows unchanged values through', () => {
    assert.deepEqual(
      frozenFieldChanges(verified, {
        mode: 'verified',
        subjectCodePrefix: 'TUD-DFG01',
      }),
      []
    );
  });

  it('ignores unrelated fields, which stay editable after enrollment', () => {
    assert.deepEqual(
      frozenFieldChanges(verified, { revealTtlMinutes: 30, auditReads: false }),
      []
    );
  });

  it('treats an absent field as "not changing it"', () => {
    assert.deepEqual(frozenFieldChanges(verified, {}), []);
    assert.deepEqual(frozenFieldChanges(verified, { mode: undefined }), []);
    assert.deepEqual(frozenFieldChanges(verified, null), []);
  });
});

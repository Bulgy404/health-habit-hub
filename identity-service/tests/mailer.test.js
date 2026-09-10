import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMailer,
  buildInviteMessage,
  buildRevealAlertMessage,
} from '../src/services/mailer.js';

const silent = { warn() {}, error() {} };

/** Records what would be sent, without an SMTP server. */
function recordingTransport() {
  const sent = [];
  return {
    sent,
    async sendMail(msg) {
      sent.push(msg);
      return { messageId: 'test' };
    },
  };
}

describe('invite message', () => {
  const msg = buildInviteMessage({
    code: 'HHV-4K7P2-9QX3R',
    studyName: 'DFG Study',
    expiresAt: '2026-12-01T00:00:00Z',
  });

  it('contains the code', () => {
    assert.ok(msg.text.includes('HHV-4K7P2-9QX3R'));
    assert.ok(msg.subject.includes('DFG Study'));
  });

  it('does NOT name the participant', () => {
    // The recipient already knows who they are. Naming them only puts a name
    // into a mail server's logs, an inbox, and any onward forward.
    for (const name of ['Müller', 'Anna', 'TUD-DFG01-0042']) {
      assert.ok(!msg.text.includes(name), `${name} must not appear`);
    }
  });

  it('states the code is single-use and personal', () => {
    assert.match(msg.text, /for you alone/i);
    assert.match(msg.text, /once/i);
  });

  it('handles a code with no expiry without printing "Invalid Date"', () => {
    const m = buildInviteMessage({
      code: 'HHV-1',
      studyName: 'S',
      expiresAt: null,
    });
    assert.ok(!m.text.includes('Invalid Date'));
  });
});

describe('reveal alert message', () => {
  const msg = buildRevealAlertMessage({
    subjectCode: 'TUD-DFG01-0042',
    actorSub: 'mgr-1',
    legalBasis: 'sae',
    fields: ['familyName', 'phone'],
  });

  it('carries the subject code, actor and legal basis', () => {
    assert.ok(msg.text.includes('TUD-DFG01-0042'));
    assert.ok(msg.text.includes('mgr-1'));
    assert.ok(msg.text.includes('sae'));
  });

  it('carries field NAMES, never values', () => {
    // The point of the alert is that someone was identified, not who.
    assert.ok(msg.text.includes('familyName'));
    assert.ok(msg.text.includes('phone'));
    assert.ok(!/Müller|\+49/.test(msg.text));
    assert.match(msg.text, /No participant data is included/i);
  });

  it('tolerates an empty field list', () => {
    const m = buildRevealAlertMessage({
      subjectCode: 'S-1',
      fields: undefined,
    });
    assert.ok(m.text.includes('S-1'));
  });
});

describe('sending', () => {
  it('sends an invite through the transport', async () => {
    const transport = recordingTransport();
    const m = createMailer({
      smtp: { host: 'smtp.invalid', from: 'noreply@x.invalid' },
      logger: silent,
      transport,
    });
    const out = await m.sendInvite({
      to: 'participant@example.invalid',
      code: 'HHV-4K7P2-9QX3R',
      studyName: 'DFG',
    });

    assert.equal(out.sent, true);
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'participant@example.invalid');
    assert.ok(transport.sent[0].text.includes('HHV-4K7P2-9QX3R'));
  });

  it('reports failure instead of throwing', async () => {
    // A mail failure must not deny a clinician an identity they were approved
    // to see, nor break a nurse's workflow.
    const m = createMailer({
      smtp: { host: 'smtp.invalid' },
      logger: silent,
      transport: {
        async sendMail() {
          throw new Error('connection refused');
        },
      },
    });
    assert.deepEqual(await m.sendInvite({ to: 'a@b.invalid', code: 'X' }), {
      sent: false,
      reason: 'send_failed',
    });
  });

  it('no-ops safely when SMTP is not configured', async () => {
    // A pilot deployment legitimately has none. It must degrade, not throw.
    const m = createMailer({ smtp: {}, logger: silent });
    assert.equal(m.configured, false);
    assert.deepEqual(await m.sendInvite({ to: 'a@b.invalid', code: 'X' }), {
      sent: false,
      reason: 'smtp_not_configured',
    });
  });
});

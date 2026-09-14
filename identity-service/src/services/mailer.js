/**
 * Outbound mail: enrolment invites, and DPO notification on every reveal.
 *
 * Uses the register's OWN SMTP credentials, duplicated from the platform's on
 * purpose — sharing one mail credential between a PII-holding service and a
 * non-PII one means a single leaked file compromises both.
 *
 * Two rules the content must obey:
 *
 * 1. An invite carries the code and nothing else identifying. The recipient
 *    already knows who they are; naming them adds no value and puts a name in
 *    a mail server's logs, an inbox, and any onward forward.
 * 2. A reveal alert carries the subject CODE, never the revealed data. The
 *    point is that someone was identified, not who.
 */

import nodemailer from 'nodemailer';

function buildTransport(smtp) {
  if (!smtp?.host) return null;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.starttls && smtp.port !== 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}

/**
 * Invite body. Pure and exported so its content contract — the code is
 * present, the participant is NOT named — is testable directly.
 */
export function buildInviteMessage({ code, studyName, expiresAt }) {
  return {
    subject: `Your enrolment code for ${studyName}`,
    text:
      `Your personal enrolment code is:\n\n    ${code}\n\n` +
      `Enter it in the Health Habit Hub app when asked for a study code.\n\n` +
      `This code is for you alone and can be used once` +
      (expiresAt
        ? `. It expires on ${new Date(expiresAt).toLocaleDateString()}.`
        : '.') +
      `\n\nIf you did not expect this message, please ignore it and tell ` +
      `the study team.\n`,
  };
}

/**
 * Reveal-alert body. Carries the subject CODE and the fields' NAMES — never
 * the revealed values. The point is that someone was identified, not who.
 */
export function buildRevealAlertMessage({
  subjectCode,
  actorSub,
  legalBasis,
  fields,
}) {
  return {
    subject: `[Identity] Re-identification performed — ${subjectCode}`,
    text:
      `A participant was re-identified.\n\n` +
      `  Subject code : ${subjectCode}\n` +
      `  Performed by : ${actorSub}\n` +
      `  Legal basis  : ${legalBasis}\n` +
      `  Fields shown : ${(fields ?? []).join(', ')}\n` +
      `  When         : ${new Date().toISOString()}\n\n` +
      `This was approved by a second person and is recorded permanently ` +
      `in the identity audit log. No participant data is included in this ` +
      `message.\n\nIf this was not expected, review the audit log now.\n`,
  };
}

/**
 * @param {{ smtp: object, logger: object, transport?: object }} deps
 *   `transport` is injectable so tests can assert what would be sent without
 *   an SMTP server.
 */
export function createMailer({ smtp, logger, transport: injected }) {
  const transport = injected ?? buildTransport(smtp);
  if (!transport) {
    logger?.warn(
      'SMTP not configured — invites and reveal alerts will be skipped'
    );
  }

  async function send({ to, subject, text }) {
    if (!transport) return { sent: false, reason: 'smtp_not_configured' };
    try {
      await transport.sendMail({ from: smtp.from, to, subject, text });
      // Deliberately does NOT log the recipient: this is the one place a
      // participant's address exists in this process, and a log line would
      // give it a second, longer-lived home.
      return { sent: true };
    } catch (err) {
      logger?.error({ err: { message: err.message } }, 'mail send failed');
      return { sent: false, reason: 'send_failed' };
    }
  }

  return {
    /**
     * Enrolment invite. `to` is decrypted by the caller, used here, and
     * discarded — it is never passed to HHH and never written to a log.
     */
    sendInvite({ to, code, studyName, expiresAt }) {
      return send({
        to,
        ...buildInviteMessage({ code, studyName, expiresAt }),
      });
    },

    /**
     * Reveal notification.
     *
     * A re-identification nobody noticed is the failure mode that ends
     * studies, so this is sent on every reveal rather than on a threshold.
     */
    sendRevealAlert({ to, subjectCode, actorSub, legalBasis, fields }) {
      return send({
        to,
        ...buildRevealAlertMessage({
          subjectCode,
          actorSub,
          legalBasis,
          fields,
        }),
      });
    },

    configured: Boolean(transport),
  };
}

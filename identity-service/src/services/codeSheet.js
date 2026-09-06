/**
 * The printable code sheet a study nurse works from.
 *
 * This is the most PII-dense artefact the system produces — a table of names,
 * dates of birth and the credentials that enrol them — so two rules apply:
 *
 * 1. IT IS NEVER STORED. Generated on demand, streamed, and forgotten.
 *    `participants.tokenCardPdf` in HHH persists a generated PDF as a blob;
 *    that pattern is deliberately not copied here. A stored sheet would be a
 *    second, unencrypted copy of the register sitting in the database.
 *
 * 2. Generating one is an audited `pii_read` naming every subject on it, so
 *    "who printed the roster, and when" is answerable.
 */

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * @param {{ studyName, subjectCodePrefix, rows: Array<{subjectCode, givenName, familyName, dateOfBirth, code}> }} data
 * @returns {Promise<Buffer>}
 */
export async function buildCodeSheet({ studyName, subjectCodePrefix, rows }) {
  const qrByCode = new Map();
  for (const r of rows) {
    if (!r.code) continue;
    // The deep link the app understands, so a nurse can let a participant scan
    // rather than type a 10-character code.
    qrByCode.set(
      r.code,
      await QRCode.toBuffer(`hhh://enrol?code=${encodeURIComponent(r.code)}`, {
        type: 'png',
        width: 120,
        margin: 1,
      })
    );
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(studyName ?? 'Study', { continued: false });
    doc
      .fontSize(9)
      .fillColor('#555')
      .text(
        `Register ${subjectCodePrefix} · generated ${new Date().toISOString()}`
      );

    // Printed on the sheet itself, because the sheet outlives this process and
    // whoever finds it later needs to know what they are holding.
    doc.moveDown(0.4);
    doc
      .fontSize(8)
      .fillColor('#a00')
      .text(
        'CONFIDENTIAL — contains participant identifying data and single-use ' +
          'enrolment credentials. Hand each row to its participant and destroy ' +
          'the remainder. Do not photocopy, scan or email.',
        { width: 520 }
      );
    doc.fillColor('#000').moveDown(0.8);

    for (const r of rows) {
      if (doc.y > 700) doc.addPage();

      const top = doc.y;
      const qr = qrByCode.get(r.code);
      if (qr) doc.image(qr, 470, top, { width: 70 });

      doc.fontSize(11).text(r.subjectCode, 36, top);
      doc
        .fontSize(10)
        .fillColor('#333')
        .text(
          [r.givenName, r.familyName].filter(Boolean).join(' ') || '—',
          36,
          top + 15
        );
      if (r.dateOfBirth) {
        doc
          .fontSize(9)
          .fillColor('#666')
          .text(`geb. ${r.dateOfBirth}`, 36, top + 30);
      }
      doc
        .fontSize(14)
        .fillColor('#000')
        .text(r.code ?? '— no code issued —', 200, top + 12);

      doc
        .moveTo(36, top + 78)
        .lineTo(559, top + 78)
        .strokeColor('#ddd')
        .stroke();
      doc.y = top + 88;
      doc.fillColor('#000');
    }

    doc.end();
  });
}

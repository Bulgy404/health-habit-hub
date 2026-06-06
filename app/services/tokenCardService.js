import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Generate a participant token card as a PDF buffer.
 *
 * @param {string} userId     - Participant UUID
 * @param {string} username   - Participant username (e.g. p-<uuid>)
 * @param {string} password   - Participant password / login token
 * @param {'qr'|'print'|'both'} format - What to include in the PDF
 * @returns {Promise<Buffer>} PDF as a Buffer
 */
export async function generateTokenCard(userId, username, password, format) {
  const includeQr = format === 'qr' || format === 'both';
  const includePrint = format === 'print' || format === 'both';

  let qrImageBuffer = null;
  if (includeQr) {
    const qrData = `hhh://login?user=${encodeURIComponent(username)}&token=${encodeURIComponent(password)}`;
    qrImageBuffer = await QRCode.toBuffer(qrData, {
      type: 'png',
      width: 200,
      margin: 2,
    });
  }

  // PDFKit uses a writable stream model; we wrap it in a Promise so callers
  // can use async/await rather than passing callbacks.
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 30 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header: HHH Logo / title
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Health Habit Hub', { align: 'center' });

    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555555')
      .text('Participant Access Card', { align: 'center' });

    doc.moveDown(1);
    doc
      .fontSize(9)
      .fillColor('#000000')
      .text(`Participant ID: ${userId}`, { align: 'center' });

    doc.moveDown(1);

    // QR code section
    if (includeQr && qrImageBuffer) {
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const qrSize = 140;
      const qrX = doc.page.margins.left + (pageWidth - qrSize) / 2;
      doc.image(qrImageBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
      doc.y += qrSize + 10;
      doc
        .fontSize(8)
        .fillColor('#777777')
        .text('Scan to log in', { align: 'center' });
      doc.moveDown(0.5);
    }

    // Username / password section
    if (includePrint) {
      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text('Login Credentials', { align: 'center' });

      doc.moveDown(0.5);

      const labelX = doc.page.margins.left + 10;
      const valueX = labelX + 70;

      doc
        .fontSize(9)
        .font('Helvetica')
        .text('Username:', labelX, doc.y)
        .text(username, valueX, doc.y - doc.currentLineHeight());

      doc.moveDown(0.5);

      doc
        .text('Password:', labelX, doc.y)
        .text(password, valueX, doc.y - doc.currentLineHeight());
    }

    doc.moveDown(1);
    doc
      .fontSize(7)
      .fillColor('#aaaaaa')
      .text('Keep this card safe. Do not share your credentials.', {
        align: 'center',
      });

    doc.end();
  });
}

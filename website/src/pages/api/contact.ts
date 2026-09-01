import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

export const prerender = false;

const TO_EMAIL = 'felix.reinsch@tu-dresden.de';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const org = String(body.org ?? '').trim();
  const msg = String(body.msg ?? '').trim();
  const honeypot = String(body.website ?? '').trim();

  // Bots tend to fill every field, including the hidden honeypot.
  if (honeypot) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (!name || !email || !msg) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_fields' }), { status: 400 });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_email' }), { status: 400 });
  }

  if (name.length > 200 || email.length > 200 || org.length > 200 || msg.length > 5000) {
    return new Response(JSON.stringify({ ok: false, error: 'too_long' }), { status: 400 });
  }

  // In the Docker/production runtime these come from real process.env
  // (set via docker-compose.yml's `environment:` block). In `astro dev`
  // locally, Vite loads website/.env into import.meta.env instead of
  // process.env, so fall back to that — no secret ever ends up baked into
  // the built bundle, since the Docker build context has no .env file, so
  // import.meta.env.SMTP_* is always `undefined` at build time there.
  const env = { ...import.meta.env, ...process.env } as Record<string, string | undefined>;
  const {
    SMTP_HOST,
    SMTP_PORT = '587',
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    SMTP_STARTTLS = 'true',
  } = env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.error('contact: missing SMTP_* env vars');
    return new Response(JSON.stringify({ ok: false, error: 'server_not_configured' }), { status: 500 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      requireTLS: SMTP_STARTTLS !== 'false',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: TO_EMAIL,
      replyTo: email,
      subject: `Health Habit Hub — Kontaktformular: ${name}`,
      text: `Name: ${name}\nE-Mail: ${email}\nOrganisation: ${org || '—'}\n\n${msg}`,
      html: `<p><strong>Name:</strong> ${escapeHtml(name)}<br/>
<strong>E-Mail:</strong> ${escapeHtml(email)}<br/>
<strong>Organisation:</strong> ${escapeHtml(org || '—')}</p>
<p>${escapeHtml(msg).replace(/\n/g, '<br/>')}</p>`,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('contact: sendMail failed', err);
    return new Response(JSON.stringify({ ok: false, error: 'send_failed' }), { status: 502 });
  }
};

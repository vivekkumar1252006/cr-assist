import nodemailer from 'nodemailer';
import { config } from '../config.js';

/**
 * True when the SMTP settings are complete enough to attempt a send.
 * Gmail (and any authenticated relay) needs both a user and an app password;
 * an unauthenticated relay only needs a host.
 */
export const isMailConfigured = () =>
  Boolean(config.smtp.host) && (!config.smtp.user || Boolean(config.smtp.pass));

let transporter;
function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    // Port 587: STARTTLS (secure=false, then upgrade). Port 465: implicit TLS.
    secure: config.smtp.secure,
    requireTLS: config.smtp.requireTls,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/**
 * Verifies the SMTP connection and login without sending a message.
 * Used by `npm run test:smtp` and the health check.
 */
export async function verifyMailer() {
  if (!isMailConfigured()) {
    return {
      ok: false,
      message:
        'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_APP_PASSWORD in server/.env.',
    };
  }
  try {
    await getTransporter().verify();
    return {
      ok: true,
      message: `SMTP connection verified for ${config.smtp.user || config.smtp.host} (${config.smtp.host}:${config.smtp.port}).`,
    };
  } catch (err) {
    return { ok: false, message: `SMTP verification failed: ${err.message}` };
  }
}

/** Plain-text email. Throws if sending fails. */
export async function sendMail({ to, subject, text, html }) {
  await getTransporter().sendMail({ from: config.smtp.from, to, subject, text, html });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const htmlLines = (s) => escapeHtml(s).replace(/\r?\n/g, '<br />');

/** Shared blue-and-white shell used by every transactional email. */
function wrapHtml(inner) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f7fd;font-family:Arial,Helvetica,sans-serif;color:#1f3357;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3ebf7;border-radius:14px;overflow:hidden;">
      <div style="padding:22px 26px;background:#0b1f4b;color:#ffffff;">
        <div style="font-size:18px;font-weight:700;">CR-Assist</div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8fb8ea;">Class Representative Assist</div>
      </div>
      <div style="padding:26px;">${inner}</div>
    </div>
  </body>
</html>`;
}

/**
 * Sends a batch of emails with bounded concurrency. Individual failures are
 * logged and counted, never thrown, so one bad address cannot stop the batch.
 * Returns { total, sent, failed, failures: [{ email, error }] }.
 */
export async function sendBulk(recipients, sendOne, { concurrency = 8, label = 'email' } = {}) {
  const list = Array.isArray(recipients) ? recipients : [];
  const summary = { total: list.length, sent: 0, failed: 0, failures: [] };
  if (!list.length) return summary;

  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const recipient = list[next++];
      try {
        await sendOne(recipient);
        summary.sent += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failures.push({ email: recipient?.email ?? null, error: err.message });
        console.error(`[mail] ${label} to ${recipient?.email ?? 'recipient'} failed:`, err.message);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return summary;
}

/**
 * Admin notice email — the full notice text, so it can be read without signing in.
 * The subject/body contain nothing except the notice and a short explanation.
 */
export async function sendNoticeEmail(to, { name, title, description }) {
  const safeName = escapeHtml(name || 'Student');
  const safeTitle = escapeHtml(title);

  await sendMail({
    to,
    subject: `CR-Assist notice: ${title}`,
    text:
      `Hi ${name || 'Student'},\n\n` +
      `A new notice has been published on CR-Assist:\n\n` +
      `${title}\n` +
      `${'-'.repeat(Math.min(60, Math.max(title.length, 10)))}\n\n` +
      `${description}\n\n` +
      'You can also read this notice in the app under Notices & Announcements.\n\n' +
      'This is an automated message from the college administration. Please do not reply.',
    html: wrapHtml(`
        <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#44567a;">
          A new notice has been published on CR-Assist.
        </p>
        <div style="margin:0 0 20px;padding:16px;border-radius:12px;background:#eef4fd;border:1px solid #d7e5fa;">
          <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7c9b;">Notice</div>
          <div style="margin-top:6px;font-size:18px;font-weight:700;line-height:1.4;color:#0b1f4b;">${safeTitle}</div>
        </div>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#2b3d60;white-space:normal;">
          ${htmlLines(description)}
        </p>
        <p style="margin:0 0 18px;font-size:12px;color:#8a99b5;">
          You can also read this notice in the app under Notices &amp; Announcements.
        </p>
        <p style="margin:0;font-size:12px;color:#8a99b5;">
          This is an automated message from the college administration. Please do not reply.
        </p>`),
  });
}

/**
 * Account creation email — a welcome note with the student's registration details.
 * Never includes a password: the student chose it during registration.
 */
export async function sendWelcomeEmail(
  to,
  { name, email, enrollmentNumber, studentId, course, academicYear, semester },
) {
  const safeName = escapeHtml(name || 'Student');
  const details = [
    ['Email', email],
    ['Enrollment number', enrollmentNumber],
    ['Student ID', studentId],
    ['Course', course],
    ['Academic year', academicYear],
    ['Semester', semester],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  const detailsText = details.map(([label, value]) => `${label}: ${value}`).join('\n');
  const detailsHtml = details
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7c9b;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1f3357;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  await sendMail({
    to,
    subject: 'Welcome to CR-Assist - your account is ready',
    text:
      `Hi ${name || 'Student'},\n\n` +
      'Welcome to CR-Assist! Your student account has been created successfully.\n\n' +
      `${detailsText}\n\n` +
      `You can sign in with the password you chose during registration at ${config.clientOrigin}.\n\n` +
      'If you did not create this account, please contact the college administration.',
    html: wrapHtml(`
        <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#44567a;">
          Welcome to <strong>CR-Assist</strong>! Your student account has been created successfully.
        </p>
        <div style="margin:0 0 20px;padding:16px;border-radius:12px;background:#eef4fd;border:1px solid #d7e5fa;">
          <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7c9b;">Your account</div>
          <table style="margin-top:8px;border-collapse:collapse;">${detailsHtml}</table>
        </div>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#44567a;">
          You can sign in with the password you chose during registration at
          <a href="${escapeHtml(config.clientOrigin)}" style="color:#1d5fd0;">${escapeHtml(config.clientOrigin)}</a>.
        </p>
        <p style="margin:0;font-size:12px;color:#8a99b5;">
          If you did not create this account, please contact the college administration.
        </p>`),
  });
}

/**
 * Sends the 6-digit password-reset verification code and nothing else.
 * The code is never logged — only the recipient, subject and any SMTP error are.
 */
export async function sendOtpEmail(to, otp, ttlMinutes) {
  const safeOtp = escapeHtml(otp);

  await sendMail({
    to,
    subject: 'Your CR-Assist verification code',
    text:
      `Your CR-Assist password reset verification code is:\n\n` +
      `    ${otp}\n\n` +
      `It expires in ${ttlMinutes} minutes and can be used only once.`,
    html: wrapHtml(`
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#44567a;">
          Use the verification code below to reset your CR-Assist password.
          It expires in <strong>${ttlMinutes} minutes</strong> and can be used only once.
        </p>
        <div style="margin:0 0 18px;padding:16px;border-radius:12px;background:#eef4fd;border:1px solid #d7e5fa;text-align:center;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b7c9b;">Verification code</div>
          <div style="margin-top:8px;font-size:34px;font-weight:700;letter-spacing:.32em;color:#0b1f4b;font-family:Consolas,Menlo,monospace;">${safeOtp}</div>
        </div>
        <p style="margin:0;font-size:12px;color:#8a99b5;">
          Never share this code with anyone. If you did not request it, ignore this email.
        </p>`),
  });
}

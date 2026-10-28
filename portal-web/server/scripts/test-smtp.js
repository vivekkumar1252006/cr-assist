// Verifies the Gmail SMTP connection/login and optionally sends a test email.
//
// Usage (from portal-web/server):
//   npm run test:smtp                    # connection + login check only
//   npm run test:smtp -- you@gmail.com   # also send a test email
//
// Uses the same SMTP_* values from server/.env as the running API.
import { config } from '../src/config.js';
import { isMailConfigured, sendMail, verifyMailer } from '../src/utils/mailer.js';

const recipient = process.argv[2];

console.log('SMTP configuration');
console.log('------------------');
console.log(`Host      : ${config.smtp.host || '(not set)'}`);
console.log(`Port      : ${config.smtp.port} (secure=${config.smtp.secure}, STARTTLS=${config.smtp.requireTls})`);
console.log(`User      : ${config.smtp.user || '(not set)'}`);
console.log(`From      : ${config.smtp.from}`);
console.log(`Password  : ${config.smtp.pass ? `set (${config.smtp.pass.length} chars)` : '(not set)'}`);
console.log('');

if (!isMailConfigured()) {
  console.error('✖ SMTP is not configured. Fill in SMTP_HOST, SMTP_USER and SMTP_APP_PASSWORD in server/.env.');
  process.exit(1);
}

const check = await verifyMailer();
if (!check.ok) {
  console.error(`✖ ${check.message}`);
  console.error('  • Gmail: use a 16-character App Password, not your normal password.');
  console.error('  • Make sure 2-Step Verification is enabled and the App Password is for this account.');
  process.exit(1);
}
console.log(`✔ ${check.message}`);

if (!recipient) {
  console.log('ℹ Connection verified. To send a test email:');
  console.log('    npm run test:smtp -- you@gmail.com');
  process.exit(0);
}

try {
  await sendMail({
    to: recipient,
    subject: 'SmartAttend SMTP test',
    text: 'This is a test email from your SmartAttend backend. SMTP is working correctly.',
    html: '<p>This is a test email from your <strong>SmartAttend</strong> backend.</p><p>SMTP is working correctly. ✅</p>',
  });
  console.log(`✔ Test email sent to ${recipient}. Check the inbox (and spam folder).`);
} catch (err) {
  console.error(`✖ Could not send the test email: ${err.message}`);
  process.exit(1);
}

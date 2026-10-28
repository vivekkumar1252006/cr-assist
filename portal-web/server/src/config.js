import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true });

const isProd = process.env.NODE_ENV === 'production';

// SMTP credentials. `SMTP_APP_PASSWORD` is the preferred name for Gmail app
// passwords (the legacy `SMTP_PASS` is still honoured). Gmail shows the
// 16-character app password grouped with spaces — strip them for the server.
const smtpUser = (process.env.SMTP_USER || '').trim();
const smtpPass = (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  if (isProd) throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  console.warn('[config] JWT_SECRET is missing or short — set a long random value in .env');
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || '0.0.0.0',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:8080',
  clientOrigins: process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(',').map((o) => o.trim())
    : [
        process.env.CLIENT_ORIGIN || 'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ],
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smartattend',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me-please',
  requireApproval: process.env.REQUIRE_APPROVAL !== 'false',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  // Email OTP password reset. The code is single-use, short-lived and stored
  // only as a bcrypt hash; these values are the abuse limits around it.
  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES) || 5,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    maxRequests: Number(process.env.OTP_MAX_REQUESTS) || 3,
    requestWindowMinutes: Number(process.env.OTP_REQUEST_WINDOW_MINUTES) || 15,
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
    resetTicketTtlMinutes: Number(process.env.OTP_RESET_TICKET_TTL_MINUTES) || 10,
    // bcrypt cost for the 6-digit code. 10 keeps verification fast while a
    // leaked hash is still far too slow to brute force inside the 5-minute TTL.
    hashRounds: Number(process.env.OTP_HASH_ROUNDS) || 10,
  },
  attendanceTokenTtlSeconds: Number(process.env.ATTENDANCE_TOKEN_TTL_SECONDS) || 45,
  lateAfterMinutes: Number(process.env.LATE_AFTER_MINUTES) || 15,
  minAttendancePercent: Number(process.env.MIN_ATTENDANCE_PERCENT) || 75,
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR || 'uploads'),
  smtp: {
    // Defaults to Gmail when an SMTP user is supplied.
    host: process.env.SMTP_HOST || (smtpUser ? 'smtp.gmail.com' : ''),
    port: Number(process.env.SMTP_PORT) || 587,
    // Port 587 uses STARTTLS, so `secure` stays false and TLS is upgraded.
    secure: process.env.SMTP_SECURE === 'true',
    requireTls: process.env.SMTP_REQUIRE_TLS !== 'false',
    user: smtpUser,
    pass: smtpPass,
    from:
      process.env.SMTP_FROM ||
      process.env.MAIL_FROM ||
      (smtpUser ? `CR-Assist <${smtpUser}>` : 'CR-Assist <no-reply@example.com>'),
  },
  complaints: {
    maxFileBytes: (Number(process.env.COMPLAINT_MAX_FILE_MB) || 10) * 1024 * 1024,
    maxFiles: Number(process.env.COMPLAINT_MAX_FILES) || 10,
    allowReopen: process.env.ALLOW_COMPLAINT_REOPEN !== 'false',
    reopenWindowDays: Number(process.env.COMPLAINT_REOPEN_DAYS) || 14,
    maxReopens: Number(process.env.COMPLAINT_MAX_REOPENS) || 1,
    submitLimitPerHour: Number(process.env.COMPLAINT_SUBMIT_LIMIT_PER_HOUR) || 5,
  },
};

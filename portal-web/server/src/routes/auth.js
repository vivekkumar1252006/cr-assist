import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth, USER_COLUMNS } from '../middleware/auth.js';
import { clearSession, issueSession, publicUser } from '../utils/auth.js';
import { checkPassword, isEmail, validateRegistration } from '../utils/validation.js';
import { isMailConfigured, sendOtpEmail, sendWelcomeEmail } from '../utils/mailer.js';

const router = Router();

const limiter = (windowMinutes, limit, message, extra = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message },
    ...extra,
  });

const loginLimiter = limiter(15, 10, 'Too many login attempts. Please try again in 15 minutes.', {
  skipSuccessfulRequests: true,
});
const registerLimiter = limiter(60, 20, 'Too many registration attempts. Please try again later.');

// IP-based limits for the OTP flow. Per-email limits (3 codes / 15 min, 60 s
// cooldown, 5 wrong guesses per code) are enforced in the database so they work
// across restarts and multiple API instances.
const otpRequestLimiter = limiter(15, 15, 'Too many verification code requests. Please try again later.');
const otpVerifyLimiter = limiter(15, 30, 'Too many verification attempts. Please try again later.');
const resetPasswordLimiter = limiter(15, 10, 'Too many password reset attempts. Please try again later.');

// Compared against when the user does not exist, so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', config.bcryptRounds);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const OTP_RE = /^\d{6}$/;
const RESET_TICKET_RE = /^[a-f0-9]{64}$/;

// Used when no OTP row exists, so a wrong email costs the same bcrypt work as a
// real check and response timing cannot reveal whether an account exists.
const DUMMY_OTP_HASH = bcrypt.hashSync('000000', config.otp.hashRounds);

/**
 * Creates the OTP tables on first use. The same DDL lives in
 * database/migrations/013_password_otp.sql and schema.sql; doing it here too
 * means an existing deployment keeps working without a manual db:init.
 */
let otpSchemaReady = null;
function ensureOtpSchema() {
  otpSchemaReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_otps (
        id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id           INT UNSIGNED NOT NULL,
        email             VARCHAR(191) NOT NULL,
        otp_hash          VARCHAR(100) NOT NULL,
        attempts          TINYINT UNSIGNED NOT NULL DEFAULT 0,
        expires_at        DATETIME NOT NULL,
        consumed_at       DATETIME NULL,
        reset_token_hash  CHAR(64) NULL,
        reset_expires_at  DATETIME NULL,
        reset_used_at     DATETIME NULL,
        created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_password_otps_user (user_id),
        KEY idx_password_otps_email (email, created_at),
        KEY idx_password_otps_reset (reset_token_hash),
        CONSTRAINT fk_password_otps_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_otp_requests (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        email       VARCHAR(191) NOT NULL,
        ip          VARCHAR(45) NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_password_otp_requests_email (email, created_at),
        KEY idx_password_otp_requests_created (created_at)
      ) ENGINE=InnoDB`);
  })().catch((err) => {
    otpSchemaReady = null; // allow a later request to retry
    throw err;
  });
  return otpSchemaReady;
}

const toDate = (value) => (value instanceof Date ? value : new Date(`${value}Z`));
const secondsBetween = (from, to = Date.now()) => Math.max(0, Math.floor((to - toDate(from).getTime()) / 1000));

/** Drops expired codes and stale request-log rows so the tables stay small. */
async function pruneOtpTables() {
  await pool.execute(
    'DELETE FROM password_otps WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 200',
  );
  await pool.execute(
    'DELETE FROM password_otp_requests WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 200',
  );
}

// ---------------------------------------------------------------- register
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { data, errors } = validateRegistration(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
    }

    const [existing] = await pool.execute(
      `SELECT u.enrollment_number, u.student_id, u.email, p.mobile
         FROM users u LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.enrollment_number = ? OR u.student_id = ? OR u.email = ? OR p.mobile = ?`,
      [data.enrollment_number, data.student_id, data.email, data.mobile],
    );
    const dupErrors = duplicateErrors(existing, data);
    if (Object.keys(dupErrors).length) {
      return res.status(409).json({ message: 'An account already exists with these details', errors: dupErrors });
    }

    const passwordHash = await bcrypt.hash(req.body.password, config.bcryptRounds);
    // Role is always 'student' here — never taken from the request body.
    // Accounts are active immediately: registration signs the student straight in.
    const status = 'active';

    const conn = await pool.getConnection();
    let userId;
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute(
        `INSERT INTO users (full_name, email, enrollment_number, student_id, password_hash, role, account_status)
         VALUES (?, ?, ?, ?, ?, 'student', ?)`,
        [data.full_name, data.email, data.enrollment_number, data.student_id, passwordHash, status],
      );
      userId = result.insertId;
      await conn.execute(
        `INSERT INTO student_profiles (user_id, course, academic_year, semester, student_group, mobile, dob)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, data.course, data.academic_year, data.semester, data.student_group, data.mobile, data.dob],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      // Lost a race with a concurrent registration using the same identifiers.
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'An account already exists with these details' });
      }
      throw err;
    } finally {
      conn.release();
    }

    // Welcome email is best-effort: registration must succeed even if SMTP is
    // down, so the result is never awaited and errors are only logged.
    if (isMailConfigured()) {
      sendWelcomeEmail(data.email, {
        name: data.full_name,
        email: data.email,
        enrollmentNumber: data.enrollment_number,
        studentId: data.student_id,
        course: data.course,
        academicYear: data.academic_year,
        semester: data.semester,
      }).catch((err) => console.error(`[auth] Welcome email to ${data.email} failed:`, err.message));
    }

    // Start the session immediately so the new student lands in the app.
    const [[created]] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
    const token = issueSession(res, created, false);

    res.status(201).json({
      status,
      message: 'Account created successfully. You are now signed in.',
      user: publicUser(created),
      token,
    });
  } catch (err) {
    next(err);
  }
});

function duplicateErrors(rows, data) {
  const errors = {};
  for (const row of rows) {
    if (row.enrollment_number === data.enrollment_number) errors.enrollmentNumber = 'This enrollment number is already registered';
    if (row.student_id === data.student_id) errors.studentId = 'This student ID is already registered';
    if (row.email === data.email) errors.email = 'This email address is already registered';
    if (row.mobile === data.mobile) errors.mobile = 'This mobile number is already registered';
  }
  return errors;
}

// ---------------------------------------------------------------- login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Email/enrollment number and password are required' });
    }

    const byEmail = identifier.includes('@');
    const [rows] = await pool.execute(
      `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE ${byEmail ? 'email' : 'enrollment_number'} = ?`,
      [byEmail ? identifier.toLowerCase() : identifier.toUpperCase()],
    );
    const user = rows[0];

    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Incorrect email/enrollment number or password' });
    }

    const requestedRole = typeof req.body.role === 'string' ? req.body.role.trim().toLowerCase() : null;
    if (requestedRole) {
      if (requestedRole === 'admin' && user.role !== 'admin') {
        return res.status(403).json({
          code: 'ROLE_UNAUTHORIZED',
          message: 'Access denied. This account does not have administrator privileges.',
        });
      }
      if (requestedRole === 'faculty' && user.role !== 'faculty' && user.role !== 'admin') {
        return res.status(403).json({
          code: 'ROLE_UNAUTHORIZED',
          message: 'Access denied. This account is registered as a student. Please select Student Login.',
        });
      }
      if (requestedRole === 'student' && user.role !== 'student') {
        return res.status(403).json({
          code: 'ROLE_UNAUTHORIZED',
          message: `This account is registered as ${user.role}. Please select ${user.role === 'faculty' ? 'Faculty' : 'Admin'} Login.`,
        });
      }
    }

    // Status is only revealed after the password has been verified.
    const statusErrors = {
      suspended: 'Your account has been suspended. Please contact the college administration.',
      rejected: 'Your registration was not approved. Please contact the college administration.',
    };
    if (user.is_demo) {
      return res.status(403).json({ code: 'DEMO_LOGIN_DISABLED', message: 'Demo login is not enabled.' });
    }
    // Registration no longer needs college approval. Accounts still marked
    // "pending" from before are activated on their first successful login.
    if (user.account_status === 'pending') {
      await pool.execute("UPDATE users SET account_status = 'active' WHERE id = ?", [user.id]);
      user.account_status = 'active';
    }
    if (user.account_status !== 'active') {
      return res.status(403).json({
        code: `ACCOUNT_${user.account_status.toUpperCase()}`,
        message: statusErrors[user.account_status] ?? 'Your account is not active',
      });
    }

    const token = issueSession(res, user, req.body.remember === true);
    res.json({ user: publicUser(user), token });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- logout / me
router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------------------------------------------------------------- forgot / reset password (email OTP)
router.post('/forgot-password', otpRequestLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!isEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address', errors: { email: 'Enter a valid email address' } });
    }

    if (!isMailConfigured()) {
      return res.status(503).json({
        code: 'EMAIL_NOT_CONFIGURED',
        message:
          'Password reset by email is not available yet because the email service has not been configured. Please contact the college administration to reset your password.',
      });
    }

    await ensureOtpSchema();
    await pruneOtpTables().catch(() => {});

    // Per-email limits are checked for every address, registered or not, so the
    // limits themselves cannot be used to discover accounts.
    const [[usage]] = await pool.execute(
      `SELECT COUNT(*) AS requests, MIN(created_at) AS first_request, MAX(created_at) AS last_request
         FROM password_otp_requests
        WHERE email = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)`,
      [email, config.otp.requestWindowMinutes],
    );

    if (usage.last_request) {
      const sinceLast = secondsBetween(usage.last_request);
      if (sinceLast < config.otp.resendCooldownSeconds) {
        const retryAfter = config.otp.resendCooldownSeconds - sinceLast;
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          code: 'OTP_COOLDOWN',
          message: `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before requesting another code.`,
          retryAfterSeconds: retryAfter,
        });
      }
    }

    if (Number(usage.requests) >= config.otp.maxRequests) {
      const retryAfter = usage.first_request
        ? Math.max(1, config.otp.requestWindowMinutes * 60 - secondsBetween(usage.first_request))
        : config.otp.requestWindowMinutes * 60;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        code: 'OTP_RATE_LIMITED',
        message: 'Too many verification code requests for this email. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
    }

    await pool.execute('INSERT INTO password_otp_requests (email, ip) VALUES (?, ?)', [
      email,
      (req.ip || '').slice(0, 45),
    ]);

    // Generate + hash the code before looking the user up, so a registered and
    // an unknown address take the same amount of time.
    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = await bcrypt.hash(otp, config.otp.hashRounds);

    // Demo accounts are excluded: their address may belong to a real person.
    const [rows] = await pool.execute(
      `SELECT id, full_name, email FROM users
        WHERE email = ? AND account_status IN ('active', 'pending') AND is_demo = 0`,
      [email],
    );
    const user = rows[0];

    if (user) {
      // Only one code may be live at a time; requesting a new one kills the old.
      await pool.execute(
        'UPDATE password_otps SET consumed_at = UTC_TIMESTAMP() WHERE user_id = ? AND consumed_at IS NULL',
        [user.id],
      );
      await pool.execute(
        `INSERT INTO password_otps (user_id, email, otp_hash, expires_at)
         VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
        [user.id, user.email, otpHash, config.otp.ttlMinutes],
      );

      try {
        await sendOtpEmail(user.email, otp, config.otp.ttlMinutes);
      } catch (err) {
        // Never surface delivery failures: a 500 would reveal that the account exists.
        console.error(`[auth] Failed to send password reset code to ${user.email}:`, err.message);
      }
    }

    // Same response (and shape) whether or not the account exists.
    res.json({
      message:
        'If an account exists for that email, a 6-digit verification code has been sent. ' +
        `It expires in ${config.otp.ttlMinutes} minutes.`,
      expiresInSeconds: config.otp.ttlMinutes * 60,
      resendAfterSeconds: config.otp.resendCooldownSeconds,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', otpVerifyLimiter, async (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
  if (!isEmail(email) || !OTP_RE.test(otp)) {
    return res.status(400).json({ code: 'OTP_INVALID', message: 'That verification code is invalid or has expired.' });
  }

  await ensureOtpSchema();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the live code so parallel guesses cannot share the attempt budget.
    const [rows] = await conn.execute(
      `SELECT id, user_id, otp_hash, attempts, (expires_at <= UTC_TIMESTAMP()) AS expired
         FROM password_otps
        WHERE email = ? AND consumed_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [email],
    );
    const record = rows[0];

    if (!record || record.expired) {
      // Spend the same bcrypt work as a real check (timing side channel).
      await bcrypt.compare(otp, DUMMY_OTP_HASH);
      await conn.rollback();
      return res.status(400).json({ code: 'OTP_INVALID', message: 'That verification code is invalid or has expired.' });
    }

    if (Number(record.attempts) >= config.otp.maxAttempts) {
      await conn.rollback();
      return res.status(429).json({
        code: 'OTP_ATTEMPTS_EXCEEDED',
        message: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    const matches = await bcrypt.compare(otp, record.otp_hash);
    if (!matches) {
      const attempts = Number(record.attempts) + 1;
      const exhausted = attempts >= config.otp.maxAttempts;
      await conn.execute(
        `UPDATE password_otps SET attempts = ?${exhausted ? ', consumed_at = UTC_TIMESTAMP()' : ''} WHERE id = ?`,
        [attempts, record.id],
      );
      await conn.commit();
      if (exhausted) {
        return res.status(429).json({
          code: 'OTP_ATTEMPTS_EXCEEDED',
          message: 'Too many incorrect attempts. Please request a new code.',
        });
      }
      const remaining = config.otp.maxAttempts - attempts;
      return res.status(400).json({
        code: 'OTP_INVALID',
        message: `That verification code is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`,
        attemptsRemaining: remaining,
      });
    }

    // Correct code: consume it and hand back a short-lived, single-use ticket
    // that the browser keeps in memory. No link is ever emailed.
    const resetToken = crypto.randomBytes(32).toString('hex');
    await conn.execute(
      `UPDATE password_otps
          SET consumed_at = UTC_TIMESTAMP(),
              reset_token_hash = ?,
              reset_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),
              reset_used_at = NULL
        WHERE id = ?`,
      [sha256(resetToken), config.otp.resetTicketTtlMinutes, record.id],
    );
    await conn.commit();

    res.json({
      message: 'Verification successful. Choose a new password.',
      resetToken,
      expiresInMinutes: config.otp.resetTicketTtlMinutes,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
  const { resetToken, password, confirmPassword } = req.body;
  if (typeof resetToken !== 'string' || !RESET_TICKET_RE.test(resetToken)) {
    return res.status(400).json({
      code: 'RESET_SESSION_INVALID',
      message: 'Your reset session is invalid or has expired. Please request a new code.',
    });
  }

  const pwError = checkPassword(password);
  if (pwError) return res.status(400).json({ message: pwError, errors: { password: pwError } });
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match', errors: { confirmPassword: 'Passwords do not match' } });
  }

  await ensureOtpSchema();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, user_id, reset_used_at,
              (reset_expires_at IS NULL OR reset_expires_at <= UTC_TIMESTAMP()) AS expired
         FROM password_otps
        WHERE reset_token_hash = ?
        FOR UPDATE`,
      [sha256(resetToken)],
    );
    const record = rows[0];

    // Unknown, already-used or expired tickets are indistinguishable to the caller.
    if (!record || record.reset_used_at || record.expired) {
      await conn.rollback();
      return res.status(400).json({
        code: 'RESET_SESSION_INVALID',
        message: 'Your reset session is invalid or has expired. Please request a new code.',
      });
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, record.user_id]);
    // Invalidate every outstanding code and ticket for this account.
    await conn.execute(
      `UPDATE password_otps
          SET reset_used_at = COALESCE(reset_used_at, UTC_TIMESTAMP()),
              consumed_at = COALESCE(consumed_at, UTC_TIMESTAMP()),
              reset_token_hash = NULL
        WHERE user_id = ?`,
      [record.user_id],
    );
    await conn.commit();

    res.json({ message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

export default router;

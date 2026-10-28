import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifyAttendanceToken } from '../utils/attendanceToken.js';

const router = Router();

const scanLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, message: { message: 'Too many scans. Slow down.' } });

const TOKEN_PREFIX = 'SATT1.';

/**
 * Works out which student a scanned payload belongs to.
 *
 * The web portal and the mobile app both render the student's identity QR as their
 * enrollment number, while the API can additionally issue signed `SATT1.` attendance
 * tokens. Both formats are accepted here:
 *   - `SATT1.<jwt>`  -> verified signature/expiry, student id comes from the subject claim
 *   - enrollment number / college id / user id -> looked up in `users`
 */
async function resolveScannedStudent(payload) {
  if (payload.startsWith(TOKEN_PREFIX)) {
    let claims;
    try {
      claims = verifyAttendanceToken(payload);
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      return {
        error: {
          status: 400,
          code: expired ? 'QR_EXPIRED' : 'QR_INVALID',
          message: expired
            ? 'This QR code has expired. Ask the student to refresh it.'
            : 'This is not a valid CR-Assist attendance QR code.',
        },
      };
    }
    const [[student]] = await pool.execute(
      `SELECT u.id, u.full_name, u.enrollment_number, u.student_id, p.course, p.semester, p.student_group, p.photo_path
         FROM users u JOIN student_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.role = 'student' AND u.account_status = 'active'`,
      [claims.userId],
    );
    if (!student) {
      return {
        error: { status: 404, code: 'STUDENT_NOT_FOUND', message: 'No active student matches this QR code.' },
      };
    }
    return { student, sessionIdFromToken: claims.sessionId };
  }

  // Identity QR. Accept the enrollment number (the format both apps generate), and as a
  // fallback the college roll number or the numeric user id so older QR images still work.
  const normalized = payload.replace(/^SMARTATTEND:(?:STUDENT|IDENTITY):/i, '').trim();
  if (!normalized || normalized.length > 64) {
    return {
      error: {
        status: 400,
        code: 'QR_INVALID',
        message: 'This is not a valid CR-Assist student QR code.',
      },
    };
  }

  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.enrollment_number, u.student_id, p.course, p.semester, p.student_group, p.photo_path
       FROM users u JOIN student_profiles p ON p.user_id = u.id
      WHERE u.role = 'student' AND u.account_status = 'active'
        AND (u.enrollment_number = ? OR u.student_id = ? OR CAST(u.id AS CHAR) = ?)
      LIMIT 2`,
    [normalized, normalized, normalized],
  );
  if (!rows.length) {
    return {
      error: {
        status: 404,
        code: 'STUDENT_NOT_FOUND',
        message: `No active student matches the scanned code "${normalized}".`,
      },
    };
  }
  if (rows.length > 1) {
    return {
      error: {
        status: 409,
        code: 'AMBIGUOUS_QR',
        message: 'More than one student matches this QR code. Use the student QR from the app.',
      },
    };
  }
  return { student: rows[0], sessionIdFromToken: null };
}

function cohortLabel(session) {
  return `${session.course} · Sem ${session.semester}${session.student_group ? ` · Group ${session.student_group}` : ''}`;
}

/**
 * Marks attendance from a scanned student QR. Only faculty/admin can call this —
 * a student can never mark themselves by generating or displaying a QR.
 *
 * `sessionId` in the body is the session the scanner is running (the admin scanner
 * creates it first). It is required for identity QRs and preferred for signed tokens;
 * signed tokens without a body session fall back to their own `sid` claim, which keeps
 * the original faculty flow working.
 */
router.post('/mark', requireAuth, requireRole('faculty', 'admin'), scanLimiter, async (req, res, next) => {
  const raw = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!raw) {
    return res.status(400).json({ code: 'QR_INVALID', message: 'No QR code data was received.' });
  }

  try {
    const resolved = await resolveScannedStudent(raw);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        code: resolved.error.code,
        message: resolved.error.message,
      });
    }
    const { student, sessionIdFromToken } = resolved;

    const requestedSessionId = Number.parseInt(req.body?.sessionId, 10);
    const sessionId = Number.isInteger(requestedSessionId) && requestedSessionId > 0
      ? requestedSessionId
      : sessionIdFromToken;
    if (!sessionId) {
      return res.status(400).json({
        code: 'SESSION_REQUIRED',
        message: 'Start an attendance session before scanning student QR codes.',
      });
    }

    const [[session]] = await pool.execute(
      `SELECT id, subject, course, semester, student_group, faculty_id, faculty_name, room, starts_at, ends_at,
              (status = 'active' AND UTC_TIMESTAMP() BETWEEN starts_at AND ends_at) AS is_open
         FROM attendance_sessions WHERE id = ?`,
      [sessionId],
    );
    if (!session || !session.is_open) {
      return res.status(409).json({ code: 'SESSION_CLOSED', message: 'This attendance session is not active.' });
    }
    if (req.user.role !== 'admin' && session.faculty_id !== req.user.id) {
      return res.status(403).json({ code: 'NOT_YOUR_SESSION', message: 'You can only take attendance for your own sessions.' });
    }

    const inCohort =
      student.course === session.course &&
      Number(student.semester) === Number(session.semester) &&
      (session.student_group === null || session.student_group === student.student_group);
    if (!inCohort) {
      return res.status(403).json({
        code: 'NOT_IN_CLASS',
        message: `${student.full_name} is not enrolled in ${cohortLabel(session)}.`,
      });
    }

    const lateCutoff = new Date(new Date(session.starts_at).getTime() + config.lateAfterMinutes * 60 * 1000);
    const status = new Date() > lateCutoff ? 'late' : 'present';
    let markedAt;
    try {
      const [result] = await pool.execute(
        `INSERT INTO attendance_records (session_id, student_id, status, method, marked_by) VALUES (?, ?, ?, 'qr', ?)`,
        [session.id, student.id, status, req.user.id],
      );
      const [[row]] = await pool.execute('SELECT marked_at FROM attendance_records WHERE id = ?', [result.insertId]);
      markedAt = row?.marked_at ?? new Date();
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ code: 'ALREADY_MARKED', message: `${student.full_name} is already marked for this session.` });
      }
      throw err;
    }

    // Returned so the faculty member can visually confirm the person in front of them.
    res.status(201).json({
      message: `${student.full_name} marked ${status}.`,
      status,
      markedAt,
      student: {
        id: student.id,
        fullName: student.full_name,
        enrollmentNumber: student.enrollment_number,
        studentId: student.student_id,
        course: student.course,
        semester: student.semester,
        studentGroup: student.student_group,
        hasPhoto: Boolean(student.photo_path),
      },
      session: {
        id: session.id,
        subject: session.subject,
        course: session.course,
        semester: session.semester,
        studentGroup: session.student_group,
        facultyName: session.faculty_name,
        room: session.room,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

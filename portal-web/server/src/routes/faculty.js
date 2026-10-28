import { Router } from 'express';
import QRCode from 'qrcode';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

// Protect all faculty endpoints — strictly accessible to faculty and admins.
router.use(requireAuth, requireRole('faculty', 'admin'));

// Helper: check if faculty owns session or is admin
async function verifySessionOwnership(sessionId, user) {
  const [[session]] = await pool.execute(
    `SELECT id, subject, course, semester, student_group, faculty_id, room, starts_at, ends_at, status
       FROM attendance_sessions WHERE id = ?`,
    [sessionId],
  );
  if (!session) return { error: { status: 404, message: 'Attendance session not found' } };
  if (user.role !== 'admin' && session.faculty_id !== user.id) {
    return { error: { status: 403, message: 'You are only authorized to manage your own sessions' } };
  }
  return { session };
}

// ----------------------------------------------------------------------------
// 1. DASHBOARD
// ----------------------------------------------------------------------------
router.get('/dashboard', async (req, res, next) => {
  try {
    const facultyId = req.user.id;

    // Total assigned classes (either incharge or subject teacher)
    const [[{ totalClasses }]] = await pool.execute(
      `SELECT COUNT(DISTINCT CONCAT(course, '-', semester, '-', IFNULL(student_group, 'ALL'))) AS totalClasses
         FROM (
           SELECT course, semester, student_group FROM class_incharges WHERE faculty_user_id = ?
           UNION
           SELECT course, semester, student_group FROM subject_assignments WHERE faculty_user_id = ?
           UNION
           SELECT course, semester, student_group FROM attendance_sessions WHERE faculty_id = ?
         ) AS assigned`,
      [facultyId, facultyId, facultyId],
    );

    // Total subjects
    const [[{ totalSubjects }]] = await pool.execute(
      `SELECT COUNT(DISTINCT subject) AS totalSubjects
         FROM (
           SELECT subject FROM subject_assignments WHERE faculty_user_id = ?
           UNION
           SELECT subject FROM attendance_sessions WHERE faculty_id = ?
         ) AS subjects`,
      [facultyId, facultyId],
    );

    // Total sessions conducted
    const [[{ totalSessions }]] = await pool.execute(
      `SELECT COUNT(*) AS totalSessions FROM attendance_sessions WHERE faculty_id = ?`,
      [facultyId],
    );

    // Active sessions right now
    const [activeSessions] = await pool.execute(
      `SELECT id, subject, course, semester, student_group, room, starts_at, ends_at, status
         FROM attendance_sessions
        WHERE faculty_id = ? AND status = 'active' AND UTC_TIMESTAMP() <= ends_at
        ORDER BY starts_at DESC`,
      [facultyId],
    );

    // Today's sessions
    const [todaySessions] = await pool.execute(
      `SELECT s.id, s.subject, s.course, s.semester, s.student_group, s.room, s.starts_at, s.ends_at, s.status,
              COUNT(r.id) AS marked_count
         FROM attendance_sessions s
         LEFT JOIN attendance_records r ON r.session_id = s.id AND r.status IN ('present', 'late')
        WHERE s.faculty_id = ? AND DATE(s.starts_at) = CURRENT_DATE()
        GROUP BY s.id
        ORDER BY s.starts_at ASC`,
      [facultyId],
    );

    // Recent 5 completed sessions
    const [recentSessions] = await pool.execute(
      `SELECT s.id, s.subject, s.course, s.semester, s.student_group, s.room, s.starts_at, s.ends_at, s.status,
              COUNT(r.id) AS present_count
         FROM attendance_sessions s
         LEFT JOIN attendance_records r ON r.session_id = s.id AND r.status IN ('present', 'late')
        WHERE s.faculty_id = ?
        GROUP BY s.id
        ORDER BY s.starts_at DESC
        LIMIT 5`,
      [facultyId],
    );

    // Overall attendance rate across this faculty's sessions
    const [[{ totalRecords, presentRecords }]] = await pool.execute(
      `SELECT COUNT(r.id) AS totalRecords,
              SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) AS presentRecords
         FROM attendance_sessions s
         JOIN attendance_records r ON r.session_id = s.id
        WHERE s.faculty_id = ?`,
      [facultyId],
    );

    const overallRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 85;

    res.json({
      summary: {
        totalClasses: Number(totalClasses) || 0,
        totalSubjects: Number(totalSubjects) || 0,
        totalSessions: Number(totalSessions) || 0,
        activeSessionsCount: activeSessions.length,
        overallAttendanceRate: overallRate,
      },
      activeSessions,
      todaySessions,
      recentSessions,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 2. ASSIGNED CLASSES & SUBJECTS
// ----------------------------------------------------------------------------
router.get('/classes', async (req, res, next) => {
  try {
    const facultyId = req.user.id;

    const [rows] = await pool.execute(
      `SELECT DISTINCT
              c.course,
              c.semester,
              c.student_group,
              (ci.id IS NOT NULL) AS is_incharge,
              ci.office_hours,
              ci.contact_number,
              (SELECT COUNT(*) FROM student_profiles sp
                WHERE sp.course = c.course AND sp.semester = c.semester
                  AND (c.student_group IS NULL OR sp.student_group = c.student_group)) AS student_count
         FROM (
           SELECT course, semester, student_group FROM class_incharges WHERE faculty_user_id = ?
           UNION
           SELECT course, semester, student_group FROM subject_assignments WHERE faculty_user_id = ?
           UNION
           SELECT course, semester, student_group FROM attendance_sessions WHERE faculty_id = ?
         ) AS c
         LEFT JOIN class_incharges ci
           ON ci.faculty_user_id = ? AND ci.course = c.course AND ci.semester = c.semester
          AND (ci.student_group = c.student_group OR (ci.student_group IS NULL AND c.student_group IS NULL))
        ORDER BY c.course, c.semester, c.student_group`,
      [facultyId, facultyId, facultyId, facultyId],
    );

    // Also get subjects taught for each class
    const [subjects] = await pool.execute(
      `SELECT course, semester, student_group, subject
         FROM subject_assignments
        WHERE faculty_user_id = ?
        UNION
        SELECT DISTINCT course, semester, student_group, subject
          FROM attendance_sessions
         WHERE faculty_id = ?`,
      [facultyId, facultyId],
    );

    const classesWithSubjects = rows.map((cls) => {
      const classSubjects = subjects
        .filter(
          (s) =>
            s.course === cls.course &&
            s.semester === cls.semester &&
            (!cls.student_group || !s.student_group || s.student_group === cls.student_group),
        )
        .map((s) => s.subject);

      return {
        ...cls,
        is_incharge: Boolean(cls.is_incharge),
        subjects: [...new Set(classSubjects)],
      };
    });

    res.json({ classes: classesWithSubjects });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 3. STUDENTS ROSTER IN A CLASS
// ----------------------------------------------------------------------------
router.get('/classes/:course/:semester/:group/students', async (req, res, next) => {
  try {
    const { course, semester, group } = req.params;
    const semNum = parseInt(semester, 10);
    const facultyId = req.user.id;

    // Fetch students in this cohort
    const [students] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.enrollment_number, u.student_id,
              sp.course, sp.semester, sp.student_group, sp.mobile, sp.academic_year
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
        WHERE u.role = 'student' AND u.account_status = 'active'
          AND sp.course = ? AND sp.semester = ? AND sp.student_group = ?
        ORDER BY u.full_name ASC`,
      [course, semNum, group],
    );

    // Calculate attendance percentage for each student in this faculty's sessions
    const studentIds = students.map((s) => s.id);
    let attendanceStats = {};

    if (studentIds.length > 0) {
      const placeholders = studentIds.map(() => '?').join(',');
      const [stats] = await pool.execute(
        `SELECT r.student_id,
                COUNT(r.id) AS sessions_attended,
                (SELECT COUNT(*) FROM attendance_sessions s
                  WHERE s.faculty_id = ? AND s.course = ? AND s.semester = ?
                    AND (s.student_group IS NULL OR s.student_group = ?) AND s.status = 'closed') AS total_sessions
           FROM attendance_records r
           JOIN attendance_sessions s ON s.id = r.session_id
          WHERE r.student_id IN (${placeholders})
            AND s.faculty_id = ? AND s.course = ? AND s.semester = ?
            AND (s.student_group IS NULL OR s.student_group = ?)
            AND r.status IN ('present', 'late')
          GROUP BY r.student_id`,
        [facultyId, course, semNum, group, ...studentIds, facultyId, course, semNum, group],
      );

      for (const row of stats) {
        attendanceStats[row.student_id] = {
          attended: row.sessions_attended,
          total: row.total_sessions,
          percentage: row.total_sessions > 0 ? Math.round((row.sessions_attended / row.total_sessions) * 100) : 100,
        };
      }
    }

    const roster = students.map((s) => {
      const stat = attendanceStats[s.id] || { attended: 0, total: 0, percentage: 100 };
      return {
        ...s,
        sessionsAttended: stat.attended,
        totalSessions: stat.total,
        attendancePercentage: stat.percentage,
      };
    });

    res.json({ students: roster });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 4. SESSIONS (List, Create, Close, Details)
// ----------------------------------------------------------------------------
router.get('/sessions', async (req, res, next) => {
  try {
    const facultyId = req.user.id;
    const { status, limit = 50 } = req.query;

    let query = `
      SELECT s.id, s.subject, s.course, s.semester, s.student_group, s.room,
             s.starts_at, s.ends_at, s.status,
             (s.status = 'active' AND UTC_TIMESTAMP() <= s.ends_at) AS is_open,
             COUNT(r.id) AS marked_students,
             (SELECT COUNT(*) FROM student_profiles sp
               WHERE sp.course = s.course AND sp.semester = s.semester
                 AND (s.student_group IS NULL OR sp.student_group = s.student_group)) AS total_cohort_students
        FROM attendance_sessions s
        LEFT JOIN attendance_records r ON r.session_id = s.id AND r.status IN ('present', 'late')
       WHERE s.faculty_id = ?
    `;
    const params = [facultyId];

    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    query += ` GROUP BY s.id ORDER BY s.starts_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const [sessions] = await pool.execute(query, params);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions', async (req, res, next) => {
  try {
    const { subject, course, semester, studentGroup = null, room = 'LH-101', durationMinutes = 45 } = req.body;

    if (!subject || !course || !semester) {
      return res.status(400).json({ message: 'Subject, course, and semester are required.' });
    }

    const duration = Math.min(Math.max(parseInt(durationMinutes, 10) || 45, 5), 180);
    const semNum = parseInt(semester, 10);
    const groupVal = studentGroup && ['A', 'B'].includes(studentGroup.toUpperCase()) ? studentGroup.toUpperCase() : null;

    const [result] = await pool.execute(
      `INSERT INTO attendance_sessions (subject, course, semester, student_group, faculty_id, room, starts_at, ends_at, status, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), 'active', 0)`,
      [subject.trim(), course.trim().toUpperCase(), semNum, groupVal, req.user.id, room.trim(), duration],
    );

    const sessionId = result.insertId;

    // Generate a quick QR payload for faculty display
    const qrPayload = `SMARTATTEND:SESSION:${sessionId}:${Date.now()}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

    res.status(201).json({
      message: 'Attendance session started successfully.',
      session: {
        id: sessionId,
        subject,
        course,
        semester: semNum,
        studentGroup: groupVal,
        room,
        durationMinutes: duration,
        qrCode: qrCodeDataUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/close', async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { error, session } = await verifySessionOwnership(sessionId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    await pool.execute(
      `UPDATE attendance_sessions SET status = 'closed', ends_at = UTC_TIMESTAMP() WHERE id = ?`,
      [sessionId],
    );

    res.json({ message: `Session #${sessionId} for ${session.subject} has been closed.` });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:id', async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { error, session } = await verifySessionOwnership(sessionId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    // Fetch enrolled students for this cohort
    const [enrolled] = await pool.execute(
      `SELECT u.id, u.full_name, u.enrollment_number, u.student_id, sp.student_group,
              r.status AS attendance_status, r.method, r.marked_at
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN attendance_records r ON r.session_id = ? AND r.student_id = u.id
        WHERE u.role = 'student' AND u.account_status = 'active'
          AND sp.course = ? AND sp.semester = ?
          AND (? IS NULL OR sp.student_group = ?)
        ORDER BY u.full_name ASC`,
      [sessionId, session.course, session.semester, session.student_group, session.student_group],
    );

    // Generate Session QR code for live display
    const qrPayload = `SMARTATTEND:SESSION:${sessionId}:${session.subject}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, { width: 320, margin: 2 });

    res.json({
      session: {
        ...session,
        qrCode: qrCodeDataUrl,
      },
      students: enrolled,
    });
  } catch (err) {
    next(err);
  }
});

// Manual attendance mark/toggle by faculty
router.post('/sessions/:id/attendance', async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { error } = await verifySessionOwnership(sessionId, req.user);
    if (error) return res.status(error.status).json({ message: error.message });

    const { studentId, status } = req.body;
    if (!studentId || !['present', 'late', 'absent'].includes(status)) {
      return res.status(400).json({ message: 'Valid studentId and status (present, late, absent) are required.' });
    }

    if (status === 'absent') {
      // Remove record or mark absent
      await pool.execute(
        `INSERT INTO attendance_records (session_id, student_id, status, method, marked_by)
         VALUES (?, ?, 'absent', 'manual', ?)
         ON DUPLICATE KEY UPDATE status = 'absent', method = 'manual', marked_by = VALUES(marked_by)`,
        [sessionId, studentId, req.user.id],
      );
    } else {
      await pool.execute(
        `INSERT INTO attendance_records (session_id, student_id, status, method, marked_by)
         VALUES (?, ?, ?, 'manual', ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), method = 'manual', marked_by = VALUES(marked_by)`,
        [sessionId, studentId, status, req.user.id],
      );
    }

    res.json({ message: `Student attendance updated to ${status}.` });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 5. ATTENDANCE REPORTS & ANALYTICS
// ----------------------------------------------------------------------------
router.get('/reports', async (req, res, next) => {
  try {
    const facultyId = req.user.id;

    // Subject-wise percentage
    const [subjectStats] = await pool.execute(
      `SELECT s.subject, s.course, s.semester,
              COUNT(DISTINCT s.id) AS total_sessions,
              COUNT(r.id) AS total_records,
              SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) AS present_count
         FROM attendance_sessions s
         LEFT JOIN attendance_records r ON r.session_id = s.id
        WHERE s.faculty_id = ?
        GROUP BY s.subject, s.course, s.semester
        ORDER BY s.subject ASC`,
      [facultyId],
    );

    const formattedSubjectStats = subjectStats.map((st) => {
      const percentage = st.total_records > 0 ? Math.round((st.present_count / st.total_records) * 100) : 0;
      return {
        subject: st.subject,
        course: st.course,
        semester: st.semester,
        totalSessions: st.total_sessions,
        attendancePercentage: percentage,
      };
    });

    // Students at risk (< 75% attendance) in this faculty's classes
    const [atRisk] = await pool.execute(
      `SELECT u.id, u.full_name, u.enrollment_number, sp.course, sp.semester, sp.student_group,
              COUNT(r.id) AS attended,
              (SELECT COUNT(*) FROM attendance_sessions s2
                WHERE s2.faculty_id = ? AND s2.course = sp.course AND s2.semester = sp.semester
                  AND (s2.student_group IS NULL OR s2.student_group = sp.student_group)
                  AND s2.status = 'closed') AS total_classes
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         JOIN attendance_records r ON r.student_id = u.id AND r.status IN ('present', 'late')
         JOIN attendance_sessions s ON s.id = r.session_id AND s.faculty_id = ?
        WHERE u.role = 'student' AND u.account_status = 'active'
        GROUP BY u.id, u.full_name, u.enrollment_number, sp.course, sp.semester, sp.student_group
       HAVING total_classes > 0 AND (attended / total_classes) < 0.75
        ORDER BY (attended / total_classes) ASC
        LIMIT 20`,
      [facultyId, facultyId],
    );

    const atRiskFormatted = atRisk.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      enrollmentNumber: r.enrollment_number,
      class: `${r.course} Sem ${r.semester} (${r.student_group})`,
      attended: r.attended,
      totalClasses: r.total_classes,
      percentage: Math.round((r.attended / r.total_classes) * 100),
    }));

    res.json({
      subjectStats: formattedSubjectStats,
      atRiskStudents: atRiskFormatted,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

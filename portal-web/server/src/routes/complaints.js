import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { notifyUserSafe } from '../services/notify.js';
import { getStudentSession } from '../services/attendance.js';
import { cleanFilename, detectFileType, downloadFilename } from '../utils/fileTypes.js';
import {
  CATEGORIES, CORRECTIONS, OPEN_STATUSES, PRIORITIES, STATUSES, validateMessage, validateNewComplaint, validateReason,
} from '../utils/complaintValidation.js';
import {
  ensureComplaintTypesSeeded, getComplaintTypeById, getComplaintTypeByKey, listComplaintTypes,
} from '../utils/complaintTypes.js';

const router = Router();
const STAFF = ['faculty', 'admin'];
const complaintsDir = path.join(config.uploadDir, 'complaints');
await fs.mkdir(complaintsDir, { recursive: true });

router.use(requireAuth);

// ============================================================ helpers
const isStaff = (user) => STAFF.includes(user.role);
const parseId = (value) => (/^\d{1,10}$/.test(String(value)) ? Number(value) : null);
const complaintNumber = (id, date = new Date()) => `CMP-${date.getUTCFullYear()}-${String(id).padStart(6, '0')}`;

// ============================================================ complaint types (database-backed dropdown)
// The student complaint form's "Complaint type" dropdown reads this list; admins manage
// it (add / rename / delete) here so changes reflect on the student form automatically.
// Complaints keep a type_id FK — deleting a type only detaches them (ON DELETE SET NULL)
// and their legacy `category` value keeps them filterable.

router.get('/types', async (req, res, next) => {
  try {
    await ensureComplaintTypesSeeded();
    res.json({ types: await listComplaintTypes() });
  } catch (err) {
    next(err);
  }
});

router.post('/types', requireRole('admin'), async (req, res, next) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  if (!label) return res.status(400).json({ message: 'Type name is required.' });
  if (label.length > 100) return res.status(400).json({ message: 'Type name must be 100 characters or fewer.' });

  try {
    // Append after the last existing type.
    const [result] = await pool.execute(
      'INSERT INTO complaint_types (label, position) SELECT ?, COALESCE(MAX(position), 0) + 1 FROM complaint_types',
      [label],
    );
    res.status(201).json({ message: 'Complaint type added.', type: await getComplaintTypeById(result.insertId) });
  } catch (err) {
    next(err);
  }
});

router.put('/types/:id', requireRole('admin'), async (req, res, next) => {
  const id = parseId(req.params.id);
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  if (!id) return res.status(400).json({ message: 'Invalid complaint type.' });
  if (!label) return res.status(400).json({ message: 'Type name is required.' });
  if (label.length > 100) return res.status(400).json({ message: 'Type name must be 100 characters or fewer.' });

  try {
    const [result] = await pool.execute('UPDATE complaint_types SET label = ? WHERE id = ?', [label, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Complaint type not found.' });
    res.json({ message: 'Complaint type updated.', type: await getComplaintTypeById(id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/types/:id', requireRole('admin'), async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid complaint type.' });

  try {
    // Past complaints survive: type_id falls back to NULL and their legacy category shows.
    const [result] = await pool.execute('DELETE FROM complaint_types WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Complaint type not found.' });
    res.json({ message: 'Complaint type deleted.' });
  } catch (err) {
    next(err);
  }
});

/** SQL condition limiting a faculty member to complaints assigned to them or from their own class. */
const FACULTY_SCOPE = `(c.assigned_to = ? OR EXISTS (
  SELECT 1 FROM class_incharges ci
   WHERE ci.faculty_user_id = ? AND ci.course = p.course AND ci.semester = p.semester AND ci.student_group = p.student_group))`;

/**
 * Loads a complaint the current user is allowed to see, or null. Students: only their own
 * (ownership comes from the session, never the request). Faculty: assigned to them or from
 * a class they are incharge of. Admin: all. Callers answer 404 for null, so guessing IDs
 * reveals nothing.
 */
async function loadComplaint(db, user, id, { forUpdate = false } = {}) {
  const params = [id];
  let scope = '';
  if (user.role === 'student') {
    scope = 'AND c.student_user_id = ?';
    params.push(user.id);
  } else if (user.role === 'faculty') {
    scope = `AND ${FACULTY_SCOPE}`;
    params.push(user.id, user.id);
  } else if (user.role !== 'admin') {
    return null;
  }
  const [rows] = await db.execute(
    `SELECT c.* FROM complaints c
       JOIN student_profiles p ON p.user_id = c.student_user_id
      WHERE c.id = ? ${scope} ${forUpdate ? 'FOR UPDATE' : ''}`,
    params,
  );
  return rows[0] ?? null;
}

async function findIncharge(db, studentUserId) {
  const [[row]] = await db.execute(
    `SELECT ci.faculty_user_id FROM class_incharges ci
       JOIN student_profiles p ON p.course = ci.course AND p.semester = ci.semester AND p.student_group = ci.student_group
       JOIN users u ON u.id = ci.faculty_user_id AND u.account_status = 'active'
      WHERE p.user_id = ?`,
    [studentUserId],
  );
  return row?.faculty_user_id ?? null;
}

async function addHistory(db, complaintId, changedBy, previous, next, reason) {
  await db.execute(
    `INSERT INTO complaint_status_history (complaint_id, changed_by, previous_status, new_status, change_reason)
     VALUES (?, ?, ?, ?, ?)`,
    [complaintId, changedBy, previous, next, reason ?? null],
  );
}

function listItem(r) {
  return {
    id: r.id,
    complaintNumber: r.complaint_number,
    title: r.title,
    category: r.category,
    // Prefer the database-backed complaint type label; the legacy category label is
    // the fallback for rows submitted before complaint_types (or when a type was deleted).
    categoryLabel: r.type_label ?? CATEGORIES[r.category] ?? r.category,
    priority: r.priority,
    status: r.status,
    lectureTime: r.lecture_time ?? null,
    lectureNumber: r.lecture_number ?? null,
    description: r.description ?? null,
    summary: r.summary ?? null,
    assignedTo: r.assigned_name ? { id: r.assigned_to, name: r.assigned_name } : null,
    attachmentCount: Number(r.attachment_count ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
    ...(r.student_name !== undefined && {
      student: {
        id: r.student_user_id,
        name: r.student_name,
        enrollmentNumber: r.enrollment_number,
        course: r.course,
        semester: r.semester,
        group: r.student_group,
      },
    }),
  };
}

function paging(query) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 10, 1), 50);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ============================================================ student: create & list
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.complaints.submitLimitPerHour,
  keyGenerator: (req) => `user:${req.user.id}`,
  skipFailedRequests: true, // validation errors don't use up the allowance
  message: { message: `You can submit up to ${config.complaints.submitLimitPerHour} complaints per hour. Please try again later.` },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// ============================================================ student: attendance complaint form
router.post('/attendance', requireRole('student'), submitLimiter, async (req, res, next) => {
  const lectureTime = typeof req.body.lectureTime === 'string' ? req.body.lectureTime.trim() : '';
  const lectureNumber = typeof req.body.lectureNumber === 'string' ? req.body.lectureNumber.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';

  const errors = {};
  if (!lectureTime) {
    errors.lectureTime = 'Lecture time is required';
  }
  if (!lectureNumber) {
    errors.lectureNumber = 'Lecture number is required';
  }
  // Description is optional — only the 5000-character cap applies when provided.
  if (description.length > 5000) {
    errors.description = 'Description must be 5000 characters or fewer.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
  }

  const conn = await pool.getConnection();
  try {
    const [[profile]] = await conn.execute(
      `SELECT u.full_name, u.email, u.enrollment_number, u.student_id, p.course, p.academic_year, p.semester, p.student_group, p.mobile
         FROM users u LEFT JOIN student_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [req.user.id],
    );

    const submissionTime = new Date();
    const snapshot = {
      fullName: profile?.full_name ?? req.user.full_name,
      email: profile?.email ?? req.user.email,
      enrollmentNumber: profile?.enrollment_number ?? req.user.enrollment_number,
      studentId: profile?.student_id ?? req.user.student_id,
      course: profile?.course ?? 'N/A',
      academicYear: profile?.academic_year ?? 'N/A',
      semester: profile?.semester ?? 1,
      group: profile?.student_group ?? 'A',
      mobile: profile?.mobile ?? null,
      lectureTime,
      lectureNumber,
      submittedAt: submissionTime.toISOString(),
    };

    const title = `Attendance Complaint: Lecture ${lectureNumber} (${lectureTime})`;
    const summary = `Lecture ${lectureNumber} (${lectureTime}): ${description.slice(0, 150)}`;
    const category = 'attendance_marked_absent';
    const priority = 'medium';

    await conn.beginTransaction();
    const assignee = await findIncharge(conn, req.user.id);
    const [result] = await conn.execute(
      `INSERT INTO complaints (student_user_id, title, category, summary, description, priority,
                               lecture_time, lecture_number, status, assigned_to, student_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
      [
        req.user.id, title, category, summary, description, priority,
        lectureTime, lectureNumber, assignee, JSON.stringify(snapshot),
      ],
    );
    const id = result.insertId;
    const number = complaintNumber(id, submissionTime);
    await conn.execute('UPDATE complaints SET complaint_number = ? WHERE id = ?', [number, id]);
    await addHistory(conn, id, req.user.id, null, 'submitted', 'Attendance complaint submitted by student');

    await audit(conn, req, 'complaint.created', 'complaint', id, {
      number, category, lectureTime, lectureNumber, assignedTo: assignee,
    });
    await conn.commit();

    if (assignee) {
      notifyUserSafe(assignee, {
        type: 'complaint_assigned',
        title: `New attendance complaint ${number}`,
        message: `${snapshot.fullName} (${snapshot.enrollmentNumber}) submitted complaint for Lecture ${lectureNumber} (${lectureTime}).`,
        link: `/staff/complaints/${id}`,
      });
    }

    res.status(201).json({
      message: `Complaint ${number} submitted successfully.`,
      complaint: {
        id,
        complaintNumber: number,
        title,
        status: 'submitted',
        lectureTime,
        lectureNumber,
        description,
        createdAt: submissionTime.toISOString(),
        assigned: Boolean(assignee),
      },
    });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/', requireRole('student'), submitLimiter, async (req, res, next) => {
  // The complaint type is resolved against the database — never trusted from the client.
  // A legacy bare `category` (old deep-links / clients) maps to the seeded type.
  const requestedTypeId = parseId(req.body?.typeId ?? '');
  const legacyKey = Object.hasOwn(CATEGORIES, req.body?.category ?? '') ? req.body.category : null;
  const type = requestedTypeId
    ? await getComplaintTypeById(requestedTypeId)
    : legacyKey
      ? await getComplaintTypeByKey(legacyKey)
      : null;

  const { data, errors } = validateNewComplaint(req.body, type);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields', errors });

  const conn = await pool.getConnection();
  try {
    // Session-related checks use the server's own view of attendance, never client values.
    let currentStatus = null;
    if (data.attendance_session_id) {
      const session = await getStudentSession(conn, req.user.id, data.attendance_session_id);
      if (!session) {
        return res.status(400).json({ message: 'Select one of your own classes', errors: { attendanceSessionId: 'Select one of your own classes' } });
      }
      if (data.attendance_date && session.localDate !== data.attendance_date) {
        return res.status(400).json({ message: 'The selected class is not on that date', errors: { attendanceSessionId: 'This class is not on the selected date' } });
      }
      data.attendance_date = session.localDate;
      currentStatus = session.rawRecord ?? (session.held ? 'not_recorded' : null);
      if (data.requested_correction) {
        if (!session.held) {
          return res.status(400).json({ message: 'You can request a correction once the class has ended.', errors: { attendanceSessionId: 'This class has not ended yet' } });
        }
        if (currentStatus === data.requested_correction) {
          return res.status(400).json({
            message: `Your attendance for this class is already "${currentStatus}".`,
            errors: { requestedCorrection: 'Requested status matches your current attendance' },
          });
        }
        const [[dup]] = await conn.execute(
          `SELECT c.complaint_number FROM attendance_corrections ac JOIN complaints c ON c.id = ac.complaint_id
            WHERE ac.session_id = ? AND ac.student_user_id = ? AND ac.decision = 'pending'`,
          [data.attendance_session_id, req.user.id],
        );
        if (dup) {
          return res.status(409).json({ message: `You already have a pending correction request for this class (${dup.complaint_number}).` });
        }
      }
    }

    const [[profile]] = await conn.execute(
      `SELECT u.full_name, u.email, u.enrollment_number, u.student_id, p.course, p.academic_year, p.semester, p.student_group, p.mobile
         FROM users u JOIN student_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [req.user.id],
    );
    const snapshot = {
      fullName: profile.full_name,
      email: profile.email,
      enrollmentNumber: profile.enrollment_number,
      studentId: profile.student_id,
      course: profile.course,
      academicYear: profile.academic_year,
      semester: profile.semester,
      group: profile.student_group,
      mobile: profile.mobile,
      lectureTime: req.body.lectureTime || null,
      lectureNumber: req.body.lectureNumber || null,
    };

    await conn.beginTransaction();
    const assignee = await findIncharge(conn, req.user.id);
    const [result] = await conn.execute(
      `INSERT INTO complaints (student_user_id, title, category, type_id, summary, description, priority, attendance_date,
                               attendance_session_id, current_attendance_status, requested_correction, lecture_time, lecture_number, assigned_to, student_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, data.title, data.category, data.type_id, data.summary, data.description, data.priority, data.attendance_date,
        data.attendance_session_id, currentStatus, data.requested_correction, req.body.lectureTime || null, req.body.lectureNumber || null, assignee, JSON.stringify(snapshot),
      ],
    );
    const id = result.insertId;
    const number = complaintNumber(id);
    await conn.execute('UPDATE complaints SET complaint_number = ? WHERE id = ?', [number, id]);
    await addHistory(conn, id, req.user.id, null, 'submitted', 'Complaint submitted by student');
    if (data.requested_correction) {
      await conn.execute(
        `INSERT INTO attendance_corrections (complaint_id, session_id, student_user_id, original_status, requested_status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, data.attendance_session_id, req.user.id, currentStatus, data.requested_correction],
      );
    }
    await audit(conn, req, 'complaint.created', 'complaint', id, {
      number, category: data.category, typeId: data.type_id, typeLabel: type.label, assignedTo: assignee,
    });
    await conn.commit();

    if (assignee) {
      notifyUserSafe(assignee, {
        type: 'complaint_assigned',
        title: `New complaint ${number}`,
        message: `${snapshot.fullName} (${snapshot.enrollmentNumber}) submitted "${data.title}".`,
        link: `/staff/complaints/${id}`,
      });
    }
    res.status(201).json({
      message: `Complaint ${number} submitted successfully.`,
      complaint: { id, complaintNumber: number, status: 'submitted', assigned: Boolean(assignee) },
    });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/my', requireRole('student'), async (req, res, next) => {
  try {
    const { limit, page, offset } = paging(req.query);
    const where = ['c.student_user_id = ?'];
    const params = [req.user.id];
    if (STATUSES.includes(req.query.status)) {
      where.push('c.status = ?');
      params.push(req.query.status);
    }

    // Status groups used by the student filter: Pending covers every open status,
    // Approved maps to resolved and Rejected to rejected. Anything else is "All".
    const STATUS_GROUPS = {
      pending: ['submitted', 'under_review', 'in_progress'],
      approved: ['resolved'],
      rejected: ['rejected'],
    };
    const statusGroup = typeof req.query.statusGroup === 'string' ? req.query.statusGroup.trim().toLowerCase() : '';
    if (statusGroup && statusGroup !== 'all') {
      const group = STATUS_GROUPS[statusGroup];
      if (!group) {
        return res.status(400).json({ message: 'Invalid status filter. Allowed: pending, approved, rejected, all.' });
      }
      where.push(`c.status IN (${group.map(() => '?').join(', ')})`);
      params.push(...group);
    }

    // Category filter by the admin-managed complaint type. Legacy rows without a
    // type_id still match through their stored category key (seeded types only).
    const typeId = parseId(req.query.typeId ?? '');
    if (req.query.typeId !== undefined && req.query.typeId !== '' && !typeId) {
      return res.status(400).json({ message: 'Invalid complaint category.' });
    }
    if (typeId) {
      const type = await getComplaintTypeById(typeId);
      if (!type) return res.status(400).json({ message: 'Complaint category not found.' });
      if (type.categoryKey) {
        where.push('(c.type_id = ? OR (c.type_id IS NULL AND c.category = ?))');
        params.push(type.id, type.categoryKey);
      } else {
        where.push('c.type_id = ?');
        params.push(type.id);
      }
    }

    if (Object.hasOwn(CATEGORIES, req.query.category ?? '')) {
      where.push('c.category = ?');
      params.push(req.query.category);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      where.push('(c.complaint_number LIKE ? OR c.title LIKE ?)');
      params.push(`%${likeEscape(q)}%`, `%${likeEscape(q)}%`);
    }
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM complaints c WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT c.*, a.full_name AS assigned_name, ct.label AS type_label,
              (SELECT COUNT(*) FROM complaint_attachments ca WHERE ca.complaint_id = c.id) AS attachment_count
         FROM complaints c LEFT JOIN users a ON a.id = c.assigned_to
         LEFT JOIN complaint_types ct ON ct.id = c.type_id
        WHERE ${whereSql}
        ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({ items: rows.map(listItem), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    next(err);
  }
});

// ============================================================ staff: list & assignees
router.get('/', requireRole(...STAFF), async (req, res, next) => {
  try {
    const { limit, page, offset } = paging(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (req.user.role === 'faculty') {
      where.push(FACULTY_SCOPE);
      params.push(req.user.id, req.user.id);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      where.push('(c.complaint_number LIKE ? OR s.enrollment_number LIKE ? OR c.title LIKE ?)');
      params.push(...Array(3).fill(`%${likeEscape(q)}%`));
    }
    const exact = { status: STATUSES, priority: PRIORITIES };
    for (const [key, allowed] of Object.entries(exact)) {
      if (allowed.includes(req.query[key])) {
        where.push(`c.${key} = ?`);
        params.push(req.query[key]);
      }
    }
    if (Object.hasOwn(CATEGORIES, req.query.category ?? '')) {
      where.push('c.category = ?');
      params.push(req.query.category);
    }
    if (/^[A-Z]{2,6}$/.test(req.query.course ?? '')) {
      where.push('p.course = ?');
      params.push(req.query.course);
    }
    if (/^[1-8]$/.test(req.query.semester ?? '')) {
      where.push('p.semester = ?');
      params.push(Number(req.query.semester));
    }
    if (['A', 'B'].includes(req.query.group)) {
      where.push('p.student_group = ?');
      params.push(req.query.group);
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRe.test(req.query.from ?? '')) {
      where.push(`DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30')) >= ?`);
      params.push(req.query.from);
    }
    if (dateRe.test(req.query.to ?? '')) {
      where.push(`DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30')) <= ?`);
      params.push(req.query.to);
    }
    if (req.query.assigned === 'me') {
      where.push('c.assigned_to = ?');
      params.push(req.user.id);
    } else if (req.query.assigned === 'unassigned') {
      where.push('c.assigned_to IS NULL');
    }

    const from = `FROM complaints c
      JOIN users s ON s.id = c.student_user_id
      JOIN student_profiles p ON p.user_id = c.student_user_id
      LEFT JOIN users a ON a.id = c.assigned_to
      LEFT JOIN complaint_types ct ON ct.id = c.type_id`;
    const whereSql = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT c.*, a.full_name AS assigned_name, s.full_name AS student_name, s.enrollment_number, ct.label AS type_label,
              p.course, p.semester, p.student_group,
              (SELECT COUNT(*) FROM complaint_attachments ca WHERE ca.complaint_id = c.id) AS attachment_count
         ${from} WHERE ${whereSql}
        ORDER BY FIELD(c.status, 'submitted', 'under_review', 'in_progress', 'resolved', 'rejected'),
                 FIELD(c.priority, 'high', 'medium', 'low'), c.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({ items: rows.map(listItem), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    next(err);
  }
});

router.get('/staff/assignees', requireRole(...STAFF), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, role FROM users
        WHERE role IN ('faculty', 'admin') AND account_status = 'active'
        ORDER BY role, full_name`,
    );
    res.json({ assignees: rows.map((r) => ({ id: r.id, name: r.full_name, role: r.role })) });
  } catch (err) {
    next(err);
  }
});

// ============================================================ detail
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const c = id && (await loadComplaint(pool, req.user, id));
    if (!c) return res.status(404).json({ message: 'Complaint not found' });

    // Database-backed complaint type label (falls back to the legacy category label).
    const typeLabel = c.type_id ? await getComplaintTypeById(c.type_id) : null;

    const [[assigned]] = c.assigned_to
      ? await pool.execute('SELECT id, full_name, role FROM users WHERE id = ?', [c.assigned_to])
      : [[null]];
    const [attachments] = await pool.execute(
      `SELECT ca.id, ca.original_filename, ca.mime_type, ca.file_size, ca.uploaded_at, ca.uploaded_by, u.role AS uploader_role
         FROM complaint_attachments ca LEFT JOIN users u ON u.id = ca.uploaded_by
        WHERE ca.complaint_id = ? ORDER BY ca.uploaded_at, ca.id`,
      [c.id],
    );
    const [responses] = await pool.execute(
      `SELECT r.id, r.message, r.created_at, r.author_user_id, u.full_name, u.role
         FROM complaint_responses r LEFT JOIN users u ON u.id = r.author_user_id
        WHERE r.complaint_id = ? ORDER BY r.created_at, r.id`,
      [c.id],
    );
    const [history] = await pool.execute(
      `SELECT h.id, h.previous_status, h.new_status, h.change_reason, h.created_at, u.full_name, u.role
         FROM complaint_status_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.complaint_id = ? ORDER BY h.created_at, h.id`,
      [c.id],
    );
    const [[correction]] = await pool.execute(
      `SELECT ac.*, u.full_name AS decided_by_name FROM attendance_corrections ac
         LEFT JOIN users u ON u.id = ac.decided_by WHERE ac.complaint_id = ?`,
      [c.id],
    );
    let session = null;
    if (c.attendance_session_id) {
      const [[s]] = await pool.execute(
        `SELECT s.id, s.subject, s.room, s.starts_at, s.ends_at, COALESCE(f.full_name, s.faculty_name) AS faculty_name, r.status AS record_status
           FROM attendance_sessions s
           LEFT JOIN users f ON f.id = s.faculty_id
           LEFT JOIN attendance_records r ON r.session_id = s.id AND r.student_id = ?
          WHERE s.id = ?`,
        [c.student_user_id, c.attendance_session_id],
      );
      if (s) {
        session = {
          id: s.id, subject: s.subject, room: s.room, startsAt: s.starts_at, endsAt: s.ends_at,
          faculty: s.faculty_name, currentRecord: s.record_status,
        };
      }
    }

    const open = OPEN_STATUSES.includes(c.status);
    const staff = isStaff(req.user);
    const reopenDeadline = c.resolved_at
      ? new Date(new Date(c.resolved_at).getTime() + config.complaints.reopenWindowDays * 86400000)
      : null;
    const canReopen =
      !staff && config.complaints.allowReopen && c.status === 'resolved' && c.reopen_count < config.complaints.maxReopens &&
      reopenDeadline && reopenDeadline > new Date();

    res.json({
      complaint: {
        ...listItem({ ...c, assigned_name: assigned?.full_name, type_label: typeLabel?.label ?? null }),
        summary: c.summary,
        description: c.description,
        attendanceDate: c.attendance_date,
        currentAttendanceStatus: c.current_attendance_status,
        requestedCorrection: c.requested_correction,
        resolutionNote: c.resolution_note,
        reopenCount: c.reopen_count,
        studentSnapshot: typeof c.student_snapshot === 'string' ? JSON.parse(c.student_snapshot) : c.student_snapshot,
        assignedTo: assigned ? { id: assigned.id, name: assigned.full_name, role: assigned.role } : null,
        session,
        attachments: attachments.map((a) => ({
          id: a.id,
          name: a.original_filename,
          mimeType: a.mime_type,
          size: a.file_size,
          uploadedAt: a.uploaded_at,
          uploadedByStaff: STAFF.includes(a.uploader_role),
          url: `/api/complaints/${c.id}/attachments/${a.id}`,
        })),
        responses: responses.map((r) => ({
          id: r.id,
          message: r.message,
          createdAt: r.created_at,
          author: { name: r.full_name ?? 'Deleted user', role: r.role, isMe: r.author_user_id === req.user.id },
        })),
        history: history.map((h) => ({
          id: h.id, from: h.previous_status, to: h.new_status, reason: h.change_reason, at: h.created_at,
          by: h.full_name ? { name: h.full_name, role: h.role } : null,
        })),
        correction: correction
          ? {
            id: correction.id,
            originalStatus: correction.original_status,
            requestedStatus: correction.requested_status,
            approvedStatus: correction.approved_status,
            decision: correction.decision,
            reason: correction.decision_reason,
            decidedBy: correction.decided_by_name,
            decidedAt: correction.decided_at,
          }
          : null,
      },
      permissions: {
        canFollowUp: open,
        canUpload: open && (staff || attachments.length < config.complaints.maxFiles),
        canReopen: Boolean(canReopen),
        reopenDeadline: canReopen ? reopenDeadline : null,
        canAssign: staff,
        canAssignOthers: req.user.role === 'admin',
        canChangeStatus: staff,
        canDecideCorrection: staff && correction?.decision === 'pending',
      },
      limits: { maxFiles: config.complaints.maxFiles, maxFileBytes: config.complaints.maxFileBytes },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================ attachments
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.complaints.maxFileBytes, files: 1, fields: 5 } });
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { message: 'Too many uploads. Please try again later.' },
});

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ code: 'FILE_TOO_LARGE', message: `Each file must be ${config.complaints.maxFileBytes / 1048576} MB or smaller.` });
      }
      return res.status(400).json({ message: 'Invalid upload. Send one file in the "file" field.' });
    }
    next(err);
  });
}

router.post('/:id/attachments', uploadLimiter, receiveFile, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const c = id && (await loadComplaint(pool, req.user, id));
    if (!c) return res.status(404).json({ message: 'Complaint not found' });
    if (!req.file) return res.status(400).json({ message: 'Choose a file to upload.' });
    if (!OPEN_STATUSES.includes(c.status)) return res.status(409).json({ message: 'Attachments can only be added while the complaint is open.' });

    const type = detectFileType(req.file.buffer);
    if (!type) {
      return res.status(415).json({ code: 'UNSUPPORTED_TYPE', message: 'Unsupported file. Upload a JPEG, PNG, WebP image or a PDF.' });
    }
    const [[{ count }]] = await pool.execute('SELECT COUNT(*) AS count FROM complaint_attachments WHERE complaint_id = ?', [c.id]);
    if (Number(count) >= config.complaints.maxFiles) {
      return res.status(409).json({ code: 'TOO_MANY_FILES', message: `A complaint can have at most ${config.complaints.maxFiles} attachments.` });
    }

    const stored = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
    const storageKey = `complaints/${c.id}/${stored}`;
    const dir = path.join(complaintsDir, String(c.id));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, stored), req.file.buffer, { flag: 'wx' });

    const originalName = cleanFilename(Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    try {
      const [result] = await pool.execute(
        `INSERT INTO complaint_attachments (complaint_id, uploaded_by, original_filename, stored_filename, mime_type, file_size, storage_key, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, req.user.id, originalName, stored, type.mime, req.file.size, storageKey, sha256],
      );
      await audit(pool, req, 'complaint.attachment_added', 'complaint', c.id, { attachmentId: result.insertId, name: originalName, size: req.file.size });
      res.status(201).json({
        message: 'File uploaded',
        attachment: {
          id: result.insertId, name: originalName, mimeType: type.mime, size: req.file.size,
          url: `/api/complaints/${c.id}/attachments/${result.insertId}`,
        },
      });
    } catch (err) {
      await fs.unlink(path.join(dir, stored)).catch(() => { });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// Streams an attachment only after the same access check as the complaint itself.
router.get('/:id/attachments/:attachmentId', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const attachmentId = parseId(req.params.attachmentId);
    const c = id && attachmentId && (await loadComplaint(pool, req.user, id));
    if (!c) return res.status(404).json({ message: 'Attachment not found' });

    const [[a]] = await pool.execute('SELECT * FROM complaint_attachments WHERE id = ? AND complaint_id = ?', [attachmentId, c.id]);
    if (!a) return res.status(404).json({ message: 'Attachment not found' });

    const filePath = path.resolve(config.uploadDir, a.storage_key);
    if (!filePath.startsWith(path.resolve(config.uploadDir) + path.sep)) return res.status(404).json({ message: 'Attachment not found' });

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    // Downloads are named after the student so admins can tell whose evidence it is:
    // Student_Name_Enrollment_Original_File.ext (original extension preserved).
    let downloadName = a.original_filename;
    if (disposition === 'attachment') {
      const [[student]] = await pool.execute('SELECT full_name, enrollment_number FROM users WHERE id = ?', [c.student_user_id]);
      downloadName = downloadFilename(student, a.original_filename);
    }
    res.set({
      'Content-Type': a.mime_type,
      'Content-Disposition': `${disposition}; filename="${downloadName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    // Helmet's default CSP (object-src 'none') stops browsers rendering PDFs inline. Content is
    // already verified as a real PDF by its signature, so drop CSP for PDFs only.
    if (a.mime_type === 'application/pdf') res.removeHeader('Content-Security-Policy');
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Attachment file is missing' });
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================ responses / follow-ups
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { message: 'Too many messages. Please slow down.' },
});

router.post('/:id/responses', messageLimiter, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const c = id && (await loadComplaint(pool, req.user, id));
    if (!c) return res.status(404).json({ message: 'Complaint not found' });
    const { message, errors } = validateMessage(req.body);
    if (errors.message) return res.status(400).json({ message: errors.message, errors });
    if (!isStaff(req.user) && !OPEN_STATUSES.includes(c.status)) {
      return res.status(409).json({ message: 'Follow-up messages can only be added while the complaint is open.' });
    }

    const [result] = await pool.execute('INSERT INTO complaint_responses (complaint_id, author_user_id, message) VALUES (?, ?, ?)', [
      c.id, req.user.id, message,
    ]);
    await pool.execute('UPDATE complaints SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [c.id]);
    await audit(pool, req, isStaff(req.user) ? 'complaint.staff_response' : 'complaint.student_followup', 'complaint', c.id, { responseId: result.insertId });

    if (isStaff(req.user)) {
      notifyUserSafe(c.student_user_id, {
        type: 'complaint_response',
        title: `New response on ${c.complaint_number}`,
        message: `${req.user.full_name} replied to your complaint "${c.title}".`,
        link: `/student/complaints/${c.id}`,
      });
    } else if (c.assigned_to) {
      notifyUserSafe(c.assigned_to, {
        type: 'complaint_followup',
        title: `Follow-up on ${c.complaint_number}`,
        message: `${req.user.full_name} added a follow-up to "${c.title}".`,
        link: `/staff/complaints/${c.id}`,
      });
    }
    res.status(201).json({ message: 'Message added', id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// ============================================================ student: reopen
router.post('/:id/reopen', requireRole('student'), async (req, res, next) => {
  const id = parseId(req.params.id);
  const { reason, error } = validateReason(req.body?.reason, 'Reason for reopening');
  if (error) return res.status(400).json({ message: error, errors: { reason: error } });
  if (!config.complaints.allowReopen) return res.status(403).json({ message: 'Reopening complaints is not permitted by the college.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = id && (await loadComplaint(conn, req.user, id, { forUpdate: true }));
    if (!c) {
      await conn.rollback();
      return res.status(404).json({ message: 'Complaint not found' });
    }
    const deadline = c.resolved_at ? new Date(c.resolved_at).getTime() + config.complaints.reopenWindowDays * 86400000 : 0;
    if (c.status !== 'resolved' || c.reopen_count >= config.complaints.maxReopens || deadline < Date.now()) {
      await conn.rollback();
      return res.status(409).json({
        message: `Only resolved complaints can be reopened, once, within ${config.complaints.reopenWindowDays} days of resolution.`,
      });
    }
    await conn.execute(
      `UPDATE complaints SET status = 'under_review', resolved_at = NULL, reopen_count = reopen_count + 1 WHERE id = ?`,
      [c.id],
    );
    await addHistory(conn, c.id, req.user.id, 'resolved', 'under_review', `Reopened by student: ${reason}`);
    await audit(conn, req, 'complaint.reopened', 'complaint', c.id, { reason });
    await conn.commit();

    if (c.assigned_to) {
      notifyUserSafe(c.assigned_to, {
        type: 'complaint_reopened',
        title: `${c.complaint_number} reopened`,
        message: `The student reopened "${c.title}": ${reason}`,
        link: `/staff/complaints/${c.id}`,
      });
    }
    res.json({ message: 'Complaint reopened and sent back for review.' });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================ staff: assign
router.patch('/:id/assign', requireRole(...STAFF), async (req, res, next) => {
  const id = parseId(req.params.id);
  const assigneeId = req.body?.assigneeId == null || req.body.assigneeId === '' ? null : parseId(req.body.assigneeId);
  if (req.body?.assigneeId != null && req.body.assigneeId !== '' && !assigneeId) {
    return res.status(400).json({ message: 'Invalid staff member' });
  }
  // Faculty may only take a complaint themselves; admins can assign anyone (or unassign).
  if (req.user.role !== 'admin' && assigneeId !== req.user.id) {
    return res.status(403).json({ message: 'Only an administrator can assign complaints to other staff.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = id && (await loadComplaint(conn, req.user, id, { forUpdate: true }));
    if (!c) {
      await conn.rollback();
      return res.status(404).json({ message: 'Complaint not found' });
    }
    let assignee = null;
    if (assigneeId) {
      [[assignee]] = await conn.execute(
        `SELECT id, full_name FROM users WHERE id = ? AND role IN ('faculty', 'admin') AND account_status = 'active'`,
        [assigneeId],
      );
      if (!assignee) {
        await conn.rollback();
        return res.status(400).json({ message: 'Select an active faculty member or administrator.' });
      }
    }
    await conn.execute('UPDATE complaints SET assigned_to = ? WHERE id = ?', [assigneeId, c.id]);
    await audit(conn, req, 'complaint.assigned', 'complaint', c.id, { from: c.assigned_to, to: assigneeId });
    await conn.commit();

    if (assignee && assignee.id !== req.user.id) {
      notifyUserSafe(assignee.id, {
        type: 'complaint_assigned',
        title: `Complaint ${c.complaint_number} assigned to you`,
        message: `${req.user.full_name} assigned "${c.title}" to you.`,
        link: `/staff/complaints/${c.id}`,
      });
    }
    res.json({ message: assignee ? `Assigned to ${assignee.full_name}` : 'Complaint unassigned' });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================ staff: status
const TRANSITIONS = {
  submitted: ['under_review', 'in_progress', 'resolved', 'rejected'],
  under_review: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['under_review', 'resolved', 'rejected'],
  resolved: ['in_progress'],
  rejected: ['under_review'],
};
const STATUS_LABEL = {
  submitted: 'Submitted', under_review: 'Under Review', in_progress: 'In Progress', resolved: 'Resolved', rejected: 'Rejected',
};

router.patch('/:id/status', requireRole(...STAFF), async (req, res, next) => {
  const id = parseId(req.params.id);
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const closing = status === 'resolved' || status === 'rejected';
  const reasonInput = validateReason(req.body?.reason, closing ? 'Resolution note' : 'Reason');
  const reason = reasonInput.reason || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = id && (await loadComplaint(conn, req.user, id, { forUpdate: true }));
    if (!c) {
      await conn.rollback();
      return res.status(404).json({ message: 'Complaint not found' });
    }
    if (!TRANSITIONS[c.status].includes(status)) {
      await conn.rollback();
      return res.status(409).json({ message: `Cannot change status from ${STATUS_LABEL[c.status]} to ${STATUS_LABEL[status]}.` });
    }
    // A reason is required to close or reopen; optional (but validated) otherwise.
    const reopening = c.status === 'resolved' || c.status === 'rejected';
    if ((closing || reopening || reason) && reasonInput.error) {
      await conn.rollback();
      return res.status(400).json({ message: reasonInput.error, errors: { reason: reasonInput.error } });
    }
    if (closing) {
      const [[pending]] = await conn.execute(`SELECT id FROM attendance_corrections WHERE complaint_id = ? AND decision = 'pending'`, [c.id]);
      if (pending) {
        await conn.rollback();
        return res.status(409).json({ message: 'Approve or reject the attendance correction request first.' });
      }
    }

    await conn.execute(
      `UPDATE complaints
          SET status = ?,
              resolution_note = IF(? IN ('resolved', 'rejected'), ?, resolution_note),
              resolved_at = IF(? IN ('resolved', 'rejected'), UTC_TIMESTAMP(), NULL)
        WHERE id = ?`,
      [status, status, reason, status, c.id],
    );
    await addHistory(conn, c.id, req.user.id, c.status, status, reason);
    await audit(conn, req, 'complaint.status_changed', 'complaint', c.id, { from: c.status, to: status, reason });
    await conn.commit();

    notifyUserSafe(c.student_user_id, {
      type: 'complaint_status',
      title: `${c.complaint_number} is now ${STATUS_LABEL[status]}`,
      message: reason ? `"${c.title}" — ${reason}` : `Your complaint "${c.title}" was updated.`,
      link: `/student/complaints/${c.id}`,
    });
    res.json({ message: `Status changed to ${STATUS_LABEL[status]}` });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================ staff: attendance correction decision
router.post('/:id/correction', requireRole(...STAFF), async (req, res, next) => {
  const id = parseId(req.params.id);
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Decision must be approve or reject' });
  const { reason, error } = validateReason(req.body?.reason, 'Reason');
  if (error) return res.status(400).json({ message: error, errors: { reason: error } });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const c = id && (await loadComplaint(conn, req.user, id, { forUpdate: true }));
    if (!c) {
      await conn.rollback();
      return res.status(404).json({ message: 'Complaint not found' });
    }
    const [[corr]] = await conn.execute(`SELECT * FROM attendance_corrections WHERE complaint_id = ? FOR UPDATE`, [c.id]);
    if (!corr) {
      await conn.rollback();
      return res.status(404).json({ message: 'This complaint has no attendance correction request.' });
    }
    if (corr.decision !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ message: `This correction was already ${corr.decision}.` });
    }

    const approvedStatus = decision === 'approve' ? (req.body.approvedStatus || corr.requested_status) : null;
    if (decision === 'approve' && !CORRECTIONS.includes(approvedStatus)) {
      await conn.rollback();
      return res.status(400).json({ message: 'Approved status must be present or late' });
    }

    // Original value at decision time (may differ from submission time).
    const [[record]] = await conn.execute(
      'SELECT id, status FROM attendance_records WHERE session_id = ? AND student_id = ? FOR UPDATE',
      [corr.session_id, corr.student_user_id],
    );
    const originalStatus = record?.status ?? 'not_recorded';

    if (decision === 'approve') {
      if (record) {
        await conn.execute(`UPDATE attendance_records SET status = ?, method = 'manual', marked_by = ? WHERE id = ?`, [
          approvedStatus, req.user.id, record.id,
        ]);
      } else {
        await conn.execute(
          `INSERT INTO attendance_records (session_id, student_id, status, method, marked_by) VALUES (?, ?, ?, 'manual', ?)`,
          [corr.session_id, corr.student_user_id, approvedStatus, req.user.id],
        );
      }
    }
    await conn.execute(
      `UPDATE attendance_corrections
          SET decision = ?, approved_status = ?, original_status = ?, decision_reason = ?, decided_by = ?, decided_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [decision === 'approve' ? 'approved' : 'rejected', approvedStatus, originalStatus, reason, req.user.id, corr.id],
    );

    const newStatus = decision === 'approve' ? 'resolved' : 'rejected';
    const note =
      decision === 'approve'
        ? `Attendance corrected from ${originalStatus.replace('_', ' ')} to ${approvedStatus}. ${reason}`
        : `Attendance correction rejected. ${reason}`;
    await conn.execute(
      `UPDATE complaints SET status = ?, resolution_note = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?`,
      [newStatus, note, c.id],
    );
    await addHistory(conn, c.id, req.user.id, c.status, newStatus, note);
    await audit(conn, req, decision === 'approve' ? 'attendance.correction_approved' : 'attendance.correction_rejected', 'attendance_correction', corr.id, {
      complaintId: c.id,
      sessionId: corr.session_id,
      studentUserId: corr.student_user_id,
      originalStatus,
      requestedStatus: corr.requested_status,
      approvedStatus,
      reason,
    });
    await conn.commit();

    notifyUserSafe(c.student_user_id, {
      type: 'attendance_correction',
      title: decision === 'approve' ? `Attendance corrected (${c.complaint_number})` : `Correction request rejected (${c.complaint_number})`,
      message: note,
      link: `/student/complaints/${c.id}`,
    });
    res.json({ message: decision === 'approve' ? 'Attendance corrected and complaint resolved.' : 'Correction rejected.' });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

export default router;

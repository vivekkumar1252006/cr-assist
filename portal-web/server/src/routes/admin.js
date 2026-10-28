import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import multer from 'multer';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { notifyUserSafe } from '../services/notify.js';
import { checkPassword, isEmail, validateAdminStudentUpdate } from '../utils/validation.js';
import { ensureComplaintOptionsSeeded, listComplaintOptions } from '../utils/complaintOptions.js';
import { resolveClassBranch } from '../utils/classBranch.js';

const router = Router();

// Enforce that all admin endpoints require a valid session with 'admin' role
router.use(requireAuth, requireRole('admin'));

// ============================================================================
// ATTENDANCE COMPLAINTS
// ============================================================================
// 'approved' is the admin-panel decision; 'in_review' / 'resolved' are legacy
// values kept so older rows remain valid (see migration 014).
const ATTENDANCE_STATUSES = new Set(['pending', 'approved', 'in_review', 'resolved', 'rejected']);
const ATTENDANCE_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  in_review: 'In Review',
  resolved: 'Approved',
  rejected: 'Rejected',
};

const ATTENDANCE_COMPLAINT_SELECT = `
  SELECT ac.id, ac.lecture_time, ac.lecture_number, ac.incident_date, ac.description, ac.status,
         ac.attachments, ac.admin_remarks, ac.submitted_at,
         u.id AS student_user_id, u.full_name AS student_name, u.email AS student_email,
         u.enrollment_number, u.student_id,
         p.course, p.semester, p.student_group, p.mobile
    FROM attendance_complaints ac
    JOIN users u ON u.id = ac.student_user_id
    LEFT JOIN student_profiles p ON p.user_id = u.id`;

/** Shapes a joined complaint row for the admin panel (parses the JSON attachments column). */
function mapAttendanceComplaint(row) {
  let attachments = [];
  if (row.attachments) {
    try {
      attachments = typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments;
    } catch (_) {
      attachments = [];
    }
  }
  return {
    ...row,
    status: row.status || 'pending',
    attachments: Array.isArray(attachments) ? attachments : [],
  };
}

// Department codes shown in the admin panel map to the course codes stored in
// student_profiles (CS -> CSE, EC -> ECE).
const ATTENDANCE_DEPARTMENTS = { CS: 'CSE', IT: 'IT', EC: 'ECE' };

router.get('/attendance-complaints', async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Optional filters from the panel. They are applied in SQL so pagination and
    // the total count always describe the filtered set, not just the current page.
    const where = [];
    const params = [];

    const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'Invalid date filter. Use YYYY-MM-DD.' });
      }
      where.push('ac.incident_date = ?');
      params.push(date);
    }

    const enrollment = typeof req.query.enrollment === 'string' ? req.query.enrollment.trim().toUpperCase() : '';
    if (enrollment) {
      if (enrollment.length > 20) {
        return res.status(400).json({ message: 'Enrollment filter is too long.' });
      }
      where.push('u.enrollment_number LIKE ?');
      params.push(`%${enrollment}%`);
    }

    const department = typeof req.query.department === 'string' ? req.query.department.trim().toUpperCase() : '';
    if (department) {
      const course = ATTENDANCE_DEPARTMENTS[department];
      if (!course) {
        return res.status(400).json({ message: 'Invalid department filter. Allowed: CS, IT, EC.' });
      }
      where.push('p.course = ?');
      params.push(course);
    }

    // Enrollment order. The trailing digits are compared as a number (so
    // ...251016 sorts after ...251014, and ...25999 before ...251000), never as
    // text. Ascending is the default view; the panel can flip it.
    const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'enrollment_asc';
    if (sort !== 'enrollment_asc' && sort !== 'enrollment_desc') {
      return res.status(400).json({ message: 'Invalid sort. Allowed: enrollment_asc, enrollment_desc.' });
    }
    const enrollmentTail = "CAST(REGEXP_SUBSTR(u.enrollment_number, '[0-9]+$') AS UNSIGNED)";
    const orderSql =
      sort === 'enrollment_desc'
        ? `ORDER BY (u.enrollment_number IS NULL), ${enrollmentTail} DESC, u.enrollment_number DESC, ac.submitted_at DESC`
        : `ORDER BY (u.enrollment_number IS NULL), ${enrollmentTail} ASC, u.enrollment_number ASC, ac.submitted_at DESC`;

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM attendance_complaints ac
         JOIN users u ON u.id = ac.student_user_id
         LEFT JOIN student_profiles p ON p.user_id = u.id${whereSql}`,
      params,
    );
    const [rawComplaints] = await pool.execute(
      `${ATTENDANCE_COMPLAINT_SELECT}${whereSql}
        ${orderSql}
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    res.json({
      complaints: rawComplaints.map(mapAttendanceComplaint),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ATTENDANCE COMPLAINTS — EXCEL REPORT
// ============================================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Strict YYYY-MM-DD check that also rejects impossible dates like 2026-02-30
 * (the Date constructor would silently roll those over to the next month).
 * Returns the original string, or null when the value is not a real date.
 */
function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

/** "2026-10-05" -> "05 Oct 2026" (used in messages and the sheet header). */
function formatIsoDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** Local-midnight Date so the calendar day survives ExcelJS's serial conversion. */
function isoToLocalDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const REPORT_COLUMNS = [
  { header: 'Student Name', key: 'student_name', width: 26 },
  { header: 'Enrollment Number', key: 'enrollment_number', width: 20 },
  { header: 'Lecture Date', key: 'lecture_date', width: 15 },
  { header: 'Lecture Time', key: 'lecture_time', width: 24 },
  { header: 'Lecture Number', key: 'lecture_number', width: 16 },
  { header: 'Description', key: 'description', width: 62 },
  { header: 'Complaint Status', key: 'status', width: 18 },
];

// Status badge colours reused inside the sheet (matches the admin panel).
const REPORT_STATUS_STYLES = {
  pending: { fill: 'FFFEF3C7', font: 'FF92400E' },
  in_review: { fill: 'FFDBEAFE', font: 'FF1D4ED8' },
  approved: { fill: 'FFD1FAE5', font: 'FF047857' },
  resolved: { fill: 'FFD1FAE5', font: 'FF047857' },
  rejected: { fill: 'FFFFE4E6', font: 'FFBE123C' },
};

/** Builds the formatted workbook from the joined complaint rows. */
async function buildAttendanceReportWorkbook(rows, from, to) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CR-Assist';
  workbook.lastModifiedBy = 'CR-Assist';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Attendance Complaints', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Widths/keys only — the header text is written explicitly on row 4 below, so
  // ExcelJS does not create its own header row at the top of the sheet.
  sheet.columns = REPORT_COLUMNS.map(({ key, width }) => ({ key, width }));

  // Title block (rows 1-2), a spacer (row 3), then the table header on row 4.
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Attendance Complaints Report';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:G2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value =
    `Period: ${formatIsoDate(from)} to ${formatIsoDate(to)}` +
    `   |   Total complaints: ${rows.length}` +
    `   |   Generated: ${formatIsoDate(new Date().toISOString().slice(0, 10))}`;
  subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 8;

  const headerRow = sheet.getRow(4);
  headerRow.height = 24;
  REPORT_COLUMNS.forEach((column, index) => {
    headerRow.getCell(index + 1).value = column.header;
  });
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E40AF' } },
      left: { style: 'thin', color: { argb: 'FF1E40AF' } },
      bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
      right: { style: 'thin', color: { argb: 'FF1E40AF' } },
    };
  });

  rows.forEach((row, index) => {
    const status = (row.status || 'pending').toLowerCase();
    const statusStyle = REPORT_STATUS_STYLES[status] || REPORT_STATUS_STYLES.pending;
    const dataRow = sheet.addRow({
      student_name: row.student_name || '—',
      enrollment_number: row.enrollment_number || '—',
      lecture_date: isoToLocalDate(row.incident_date),
      lecture_time: row.lecture_time || '—',
      lecture_number: row.lecture_number ? `Lecture ${row.lecture_number}` : '—',
      description: row.description?.trim() || '—',
      status: ATTENDANCE_STATUS_LABELS[status] || row.status || 'Pending',
    });
    // Give wrapped descriptions room instead of clipping them to one line.
    const descriptionLength = (row.description || '').trim().length;
    dataRow.height = Math.max(20, Math.ceil(descriptionLength / 62) * 15);

    const banded = index % 2 === 1;
    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
      if (banded) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      if (colNumber === 7) {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: statusStyle.font } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusStyle.fill } };
        cell.alignment = { vertical: 'top', horizontal: 'center' };
      }
    });

    dataRow.getCell('lecture_date').numFmt = 'dd-mmm-yyyy';
    dataRow.getCell('lecture_date').alignment = { vertical: 'top', horizontal: 'left' };
  });

  // Table behaviour: filterable header, repeating header row when printed.
  sheet.autoFilter = { from: 'A4', to: `G${Math.max(4, rows.length + 4)}` };
  sheet.pageSetup.printTitlesRow = '4:4';

  return workbook;
}

/**
 * Excel export of every attendance complaint whose lecture date falls inside
 * [from, to] (both days inclusive). Only the date range narrows the set — the
 * panel's other filters are intentionally ignored so the report is complete.
 */
router.get('/attendance-complaints/report', async (req, res, next) => {
  try {
    const from = parseIsoDate(req.query.from);
    const to = parseIsoDate(req.query.to);

    if (!from || !to) {
      return res.status(400).json({ message: 'Select a valid From date and To date (YYYY-MM-DD).' });
    }
    if (from > to) {
      return res.status(400).json({ message: 'The From date must be on or before the To date.' });
    }

    const [rows] = await pool.execute(
      `SELECT u.full_name AS student_name, u.enrollment_number,
              ac.incident_date, ac.lecture_time, ac.lecture_number, ac.description, ac.status
         FROM attendance_complaints ac
         JOIN users u ON u.id = ac.student_user_id
        WHERE ac.incident_date BETWEEN ? AND ?
        ORDER BY ac.incident_date ASC,
                 (u.enrollment_number IS NULL) ASC,
                 CAST(REGEXP_SUBSTR(u.enrollment_number, '[0-9]+$') AS UNSIGNED) ASC,
                 u.enrollment_number ASC,
                 ac.submitted_at ASC`,
      [from, to],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: `No attendance complaints were submitted between ${formatIsoDate(from)} and ${formatIsoDate(to)}.`,
      });
    }

    const workbook = await buildAttendanceReportWorkbook(rows, from, to);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `attendance-complaints_${from}_to_${to}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * Admin decision on a complaint. The panel sends { status: 'approved' | 'rejected' };
 * saving remarks sends the current status plus `adminRemarks`.
 * `adminRemarks` is only written when the field is present, so a plain
 * approve/reject never erases a note an admin already added.
 */
router.patch('/attendance-complaints/:id/status', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = typeof req.body.status === 'string' ? req.body.status.trim() : '';
  const hasRemarks = Object.prototype.hasOwnProperty.call(req.body, 'adminRemarks');
  const adminRemarks = hasRemarks && typeof req.body.adminRemarks === 'string' ? req.body.adminRemarks.trim() : '';

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid complaint id.' });
  }
  if (!ATTENDANCE_STATUSES.has(status)) {
    return res.status(400).json({
      message: 'Invalid status. Allowed: pending, approved, in_review, resolved, rejected.',
    });
  }
  if (adminRemarks.length > 1000) {
    return res.status(400).json({ message: 'Admin remarks must be 1000 characters or fewer.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the row so two admins cannot overwrite each other's decision silently.
    const [[existing]] = await conn.execute(
      `SELECT id, student_user_id, status, lecture_time, lecture_number, incident_date
         FROM attendance_complaints
        WHERE id = ?
        FOR UPDATE`,
      [id],
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Attendance complaint not found.' });
    }

    if (hasRemarks) {
      await conn.execute('UPDATE attendance_complaints SET status = ?, admin_remarks = ? WHERE id = ?', [
        status,
        adminRemarks || null,
        id,
      ]);
    } else {
      await conn.execute('UPDATE attendance_complaints SET status = ? WHERE id = ?', [status, id]);
    }

    await audit(conn, req, 'attendance_complaint.status', 'attendance_complaint', id, {
      prevStatus: existing.status,
      newStatus: status,
      ...(hasRemarks ? { adminRemarks: adminRemarks || null } : {}),
    });
    await conn.commit();

    const [[updated]] = await pool.execute(`${ATTENDANCE_COMPLAINT_SELECT} WHERE ac.id = ?`, [id]);

    // Let the student's portal know straight away (in-app notification + email).
    if (existing.status !== status) {
      const when = existing.incident_date
        ? new Date(`${existing.incident_date}T00:00:00`).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'the reported lecture';
      notifyUserSafe(existing.student_user_id, {
        type: 'attendance_complaint_status',
        title: `Attendance complaint ${ATTENDANCE_STATUS_LABELS[status] || status}`,
        message:
          `Your attendance complaint for ${when} (${existing.lecture_time}, lecture ${existing.lecture_number}) ` +
          `has been ${(ATTENDANCE_STATUS_LABELS[status] || status).toLowerCase()}.` +
          (adminRemarks ? ` Remarks: ${adminRemarks}` : ''),
        link: '/student/attendance-complaint',
      });
    }

    res.json({
      message: `Complaint status updated to ${ATTENDANCE_STATUS_LABELS[status] || status}.`,
      status,
      complaint: updated ? mapAttendanceComplaint(updated) : null,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/attendance-complaints/file/:filename', async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(config.uploadDir, 'attendance-complaints', filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found.' });
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// COMPLAINT FORM OPTIONS — Lecture Time & Lecture Number dropdown lists
// (these feed the student attendance complaint form; see complaintOptions.js)
// ============================================================================
const COMPLAINT_OPTION_TYPES = new Set(['lecture_time', 'lecture_number']);

router.get('/complaint-options', async (req, res, next) => {
  try {
    await ensureComplaintOptionsSeeded();
    res.json(await listComplaintOptions());
  } catch (err) {
    next(err);
  }
});

router.post('/complaint-options', async (req, res, next) => {
  const optionType = req.body?.optionType;
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';

  if (!COMPLAINT_OPTION_TYPES.has(optionType)) {
    return res.status(400).json({ message: 'Invalid option type.' });
  }
  if (!label) {
    return res.status(400).json({ message: 'Option text is required.' });
  }
  if (label.length > 100) {
    return res.status(400).json({ message: 'Option text must be 100 characters or fewer.' });
  }

  try {
    // Appends after the last existing option of this type.
    const [result] = await pool.execute(
      `INSERT INTO complaint_options (option_type, label, position)
       SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM complaint_options WHERE option_type = ?`,
      [optionType, label, optionType],
    );
    res.status(201).json({ message: 'Option added.', option: { id: result.insertId, label } });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This option already exists.' });
    }
    next(err);
  }
});

router.put('/complaint-options/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid option.' });
  }
  if (!label) {
    return res.status(400).json({ message: 'Option text is required.' });
  }
  if (label.length > 100) {
    return res.status(400).json({ message: 'Option text must be 100 characters or fewer.' });
  }

  try {
    const [result] = await pool.execute('UPDATE complaint_options SET label = ? WHERE id = ?', [label, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Option not found.' });
    }
    res.json({ message: 'Option updated.', option: { id, label } });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This option already exists.' });
    }
    next(err);
  }
});

router.delete('/complaint-options/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid option.' });
  }
  try {
    const [result] = await pool.execute('DELETE FROM complaint_options WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Option not found.' });
    }
    res.json({ message: 'Option deleted.' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 1. DASHBOARD
// ============================================================================
router.get('/dashboard', async (req, res, next) => {
  try {
    // Basic counts
    const [[{ totalStudents }]] = await pool.query(
      `SELECT COUNT(*) AS totalStudents FROM users WHERE role = 'student'`
    );
    const [[{ totalFaculty }]] = await pool.query(
      `SELECT COUNT(*) AS totalFaculty FROM users WHERE role = 'faculty'`
    );
    const [[{ totalClasses }]] = await pool.query(
      `SELECT COUNT(DISTINCT CONCAT(course, '-', semester, '-', student_group)) AS totalClasses FROM student_profiles`
    );
    const [[{ totalSessions }]] = await pool.query(
      `SELECT COUNT(*) AS totalSessions FROM attendance_sessions`
    );

    // Today's attendance counts (India/local date based on UTC)
    const [[{ todayPresent }]] = await pool.query(
      `SELECT COUNT(*) AS todayPresent FROM attendance_records
        WHERE DATE(marked_at) = CURRENT_DATE() AND status = 'present'`
    );
    const [[{ todayLate }]] = await pool.query(
      `SELECT COUNT(*) AS todayLate FROM attendance_records
        WHERE DATE(marked_at) = CURRENT_DATE() AND status = 'late'`
    );
    const [[{ todayAbsent }]] = await pool.query(
      `SELECT COUNT(*) AS todayAbsent FROM attendance_records
        WHERE DATE(marked_at) = CURRENT_DATE() AND status = 'absent'`
    );

    // Complaint counts
    const [[{ pendingComplaints }]] = await pool.query(
      `SELECT COUNT(*) AS pendingComplaints FROM complaints
        WHERE status IN ('submitted', 'under_review', 'in_progress')`
    );
    const [[{ resolvedComplaints }]] = await pool.query(
      `SELECT COUNT(*) AS resolvedComplaints FROM complaints WHERE status = 'resolved'`
    );

    // 1. Daily attendance trends (last 7 days)
    const [dailyTrends] = await pool.query(
      `SELECT DATE(s.starts_at) AS date,
              COUNT(DISTINCT s.id) AS sessionsCount,
              SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS presentCount,
              SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS lateCount,
              SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absentCount
         FROM attendance_sessions s
         LEFT JOIN attendance_records r ON r.session_id = s.id
        WHERE s.starts_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        GROUP BY DATE(s.starts_at)
        ORDER BY date ASC`
    );

    // 2. Class-wise attendance percentage
    const [classWise] = await pool.query(
      `SELECT p.course, p.semester, p.student_group,
              COUNT(DISTINCT p.user_id) AS totalStudents,
              COUNT(r.id) AS totalAttendances,
              SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attendedCount
         FROM student_profiles p
         LEFT JOIN attendance_records r ON r.student_id = p.user_id
        GROUP BY p.course, p.semester, p.student_group
        ORDER BY p.course, p.semester, p.student_group`
    );

    // Format class-wise attendance with percentage
    const classWiseFormatted = classWise.map((c) => {
      const pct = c.totalAttendances > 0 ? Math.round((c.attendedCount / c.totalAttendances) * 100) : 85;
      return {
        className: `${c.course} Sem ${c.semester} (${c.student_group})`,
        students: c.totalStudents,
        percentage: Math.min(100, Math.max(0, pct)),
      };
    });

    // 3. Complaint status distribution
    const [complaintStats] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM complaints GROUP BY status`
    );

    // 4. Complaints by category
    const [complaintCategories] = await pool.query(
      `SELECT category, COUNT(*) AS count FROM complaints GROUP BY category ORDER BY count DESC LIMIT 6`
    );

    res.json({
      summary: {
        totalStudents,
        totalFaculty,
        totalClasses: Math.max(totalClasses, 1),
        totalSessions,
        todayPresent,
        todayLate,
        todayAbsent,
        pendingComplaints,
        resolvedComplaints,
      },
      charts: {
        dailyTrends,
        classWise: classWiseFormatted,
        complaintStats,
        complaintCategories,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. STUDENT MANAGEMENT
// ============================================================================
router.get('/students', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const offset = (page - 1) * limit;

    const { search, course, semester, group, status } = req.query;
    const conditions = ["u.role = 'student'"];
    const params = [];

    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.enrollment_number LIKE ? OR u.student_id LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    if (course) {
      conditions.push('p.course = ?');
      params.push(course);
    }
    if (semester) {
      conditions.push('p.semester = ?');
      params.push(semester);
    }
    if (group) {
      conditions.push('p.student_group = ?');
      params.push(group);
    }
    if (status) {
      conditions.push('u.account_status = ?');
      params.push(status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
       ${whereClause}`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.enrollment_number, u.student_id, u.account_status, u.created_at,
              p.course, p.academic_year, p.semester, p.student_group, p.mobile, p.dob, p.photo_path, p.updated_at AS profile_updated_at,
              (
                SELECT ROUND(
                  (SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0)) * 100
                )
                FROM attendance_records r
                WHERE r.student_id = u.id
              ) AS attendance_percent,
              (SELECT COUNT(*) FROM complaints c WHERE c.student_user_id = u.id) AS complaint_count
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
       ${whereClause}
       ORDER BY u.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const students = rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      enrollmentNumber: r.enrollment_number,
      studentId: r.student_id,
      accountStatus: r.account_status,
      course: r.course,
      academicYear: r.academic_year,
      semester: r.semester,
      group: r.student_group,
      mobile: r.mobile,
      dob: r.dob,
      hasPhoto: Boolean(r.photo_path),
      photoUrl: r.photo_path ? `/api/admin/students/${r.id}/photo?v=${r.profile_updated_at ? new Date(r.profile_updated_at).getTime() : 0}` : null,
      attendancePercent: r.attendance_percent !== null ? Number(r.attendance_percent) : null,
      complaintCount: r.complaint_count,
      createdAt: r.created_at,
    }));

    res.json({ students, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    next(err);
  }
});

router.post('/students', async (req, res, next) => {
  const {
    fullName,
    email,
    password,
    enrollmentNumber,
    studentId,
    course,
    academicYear = 'First Year',
    semester = 1,
    studentGroup = 'A',
    mobile,
    dob,
    accountStatus = 'active',
  } = req.body;

  if (!fullName || !email || !enrollmentNumber || !studentId || !password) {
    return res.status(400).json({ message: 'Name, email, enrollment number, student ID, and password are required.' });
  }

  // Same rules as edit + a required password.
  const { data, errors } = validateAdminStudentUpdate({ ...req.body, password });
  if (!password) errors.password = 'Password is required to register a student.';
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const mobileConds = data.mobile ? 'OR (p.mobile IS NOT NULL AND p.mobile = ?)' : '';
    const dupParams = [data.email, data.enrollment_number, data.student_id];
    if (data.mobile) dupParams.push(data.mobile);
    const [dup] = await conn.execute(
      `SELECT u.email, u.enrollment_number, u.student_id, p.mobile
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.email = ? OR u.enrollment_number = ? OR u.student_id = ? ${mobileConds}`,
      dupParams
    );

    if (dup.length > 0) {
      const match = dup[0];
      if (match.email === data.email) { await conn.rollback(); return res.status(409).json({ message: 'Email already registered.', errors: { email: 'Email already registered.' } }); }
      if (match.enrollment_number === data.enrollment_number) { await conn.rollback(); return res.status(409).json({ message: 'Enrollment number already registered.', errors: { enrollmentNumber: 'Enrollment number already registered.' } }); }
      if (match.student_id === data.student_id) { await conn.rollback(); return res.status(409).json({ message: 'Student ID already registered.', errors: { studentId: 'Student ID already registered.' } }); }
      if (data.mobile && match.mobile === data.mobile) { await conn.rollback(); return res.status(409).json({ message: 'Mobile number already registered.', errors: { mobile: 'Mobile number already registered.' } }); }
    }

    const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

    const [userRes] = await conn.execute(
      `INSERT INTO users (full_name, email, enrollment_number, student_id, password_hash, role, account_status)
       VALUES (?, ?, ?, ?, ?, 'student', ?)`,
      [data.full_name, data.email, data.enrollment_number, data.student_id, passwordHash, data.account_status]
    );

    const newUserId = userRes.insertId;

    await conn.execute(
      `INSERT INTO student_profiles (user_id, course, academic_year, semester, student_group, mobile, dob)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newUserId, data.course, data.academic_year, data.semester, data.student_group, data.mobile, data.dob]
    );

    await audit(conn, req, 'student.create', 'user', newUserId, {
      enrollmentNumber: data.enrollment_number, course: data.course, semester: data.semester, group: data.student_group,
    });
    await conn.commit();

    res.status(201).json({ message: 'Student registered successfully', studentId: newUserId });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/students/:id', async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const [[student]] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.enrollment_number, u.student_id, u.account_status, u.created_at,
              p.course, p.academic_year, p.semester, p.student_group, p.mobile, p.dob, p.photo_path
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.role = 'student'`,
      [studentId]
    );

    if (!student) return res.status(404).json({ message: 'Student not found.' });

    // Attendance summary
    const [records] = await pool.execute(
      `SELECT r.id, r.status, r.method, r.marked_at, s.subject, s.starts_at, s.ends_at, s.room,
              COALESCE(u.full_name, s.faculty_name) AS faculty_name
         FROM attendance_records r
         JOIN attendance_sessions s ON s.id = r.session_id
         LEFT JOIN users u ON u.id = s.faculty_id
        WHERE r.student_id = ?
        ORDER BY r.marked_at DESC
        LIMIT 50`,
      [studentId]
    );

    // Attendance counts
    const [[stats]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS presentCount,
              SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS lateCount,
              SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absentCount
         FROM attendance_records WHERE student_id = ?`,
      [studentId]
    );

    // Complaints
    const [complaints] = await pool.execute(
      `SELECT c.id, c.complaint_number, c.title, c.category, c.priority, c.status, c.created_at, c.resolved_at
         FROM complaints c
        WHERE c.student_user_id = ?
        ORDER BY c.created_at DESC`,
      [studentId]
    );

    // Attendance complaints — same table the Attendance Complaint system writes to
    // (attendance_complaints), so this list is always in sync with the admin
    // Attendance Complaints page and the student's submissions.
    const [attendanceComplaints] = await pool.execute(
      `SELECT id, lecture_time, lecture_number, incident_date, description, status, submitted_at
         FROM attendance_complaints
        WHERE student_user_id = ?
        ORDER BY submitted_at DESC`,
      [studentId]
    );

    const attended = (stats.presentCount || 0) + (stats.lateCount || 0);
    const percentage = stats.total > 0 ? Math.round((attended / stats.total) * 100) : 0;

    res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        email: student.email,
        enrollmentNumber: student.enrollment_number,
        studentId: student.student_id,
        accountStatus: student.account_status,
        course: student.course,
        academicYear: student.academic_year,
        semester: student.semester,
        group: student.student_group,
        mobile: student.mobile,
        dob: student.dob,
        hasPhoto: Boolean(student.photo_path),
        photoUrl: student.photo_path ? `/api/admin/students/${student.id}/photo?v=${Date.now()}` : null,
        createdAt: student.created_at,
      },
      attendance: {
        total: stats.total || 0,
        present: stats.presentCount || 0,
        late: stats.lateCount || 0,
        absent: stats.absentCount || 0,
        percentage,
        records: records.map((r) => ({
          id: r.id,
          subject: r.subject,
          status: r.status,
          method: r.method,
          room: r.room,
          faculty: r.faculty_name,
          markedAt: r.marked_at,
        })),
      },
      complaints,
      attendanceComplaints: attendanceComplaints.map((c) => ({
        id: c.id,
        lectureTime: c.lecture_time,
        lectureNumber: c.lecture_number,
        incidentDate: c.incident_date,
        description: c.description || '',
        status: c.status || 'pending',
        submittedAt: c.submitted_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/students/:id', async (req, res, next) => {
  const studentId = parseInt(req.params.id, 10);
  if (!Number.isInteger(studentId) || studentId < 1) {
    return res.status(400).json({ message: 'Invalid student id.' });
  }

  const { data, errors } = validateAdminStudentUpdate(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.execute(
      `SELECT u.id, p.user_id AS has_profile
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.role = 'student'
        FOR UPDATE`,
      [studentId]
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Uniqueness across every other account (email / enrollment / student ID / mobile).
    const mobileConds = data.mobile ? 'OR p.mobile = ?' : '';
    const dupParams = [studentId, data.email, data.enrollment_number, data.student_id];
    if (data.mobile) dupParams.push(data.mobile);
    const [dup] = await conn.execute(
      `SELECT u.id, u.email, u.enrollment_number, u.student_id, p.mobile
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.id <> ? AND (u.email = ? OR u.enrollment_number = ? OR u.student_id = ? ${mobileConds})`,
      dupParams
    );
    if (dup.length > 0) {
      const match = dup[0];
      const message =
        match.email === data.email ? 'Email already registered to another account.'
        : match.enrollment_number === data.enrollment_number ? 'Enrollment number already registered to another account.'
        : match.student_id === data.student_id ? 'Student ID already registered to another account.'
        : 'Mobile number already registered to another account.';
      await conn.rollback();
      return res.status(409).json({ message });
    }

    if (data.password) {
      const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);
      await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, studentId]);
    }

    await conn.execute(
      `UPDATE users
          SET full_name = ?, email = ?, enrollment_number = ?, student_id = ?, account_status = ?
        WHERE id = ?`,
      [data.full_name, data.email, data.enrollment_number, data.student_id, data.account_status, studentId]
    );

    // Profiles can be missing for older accounts — create the row when needed.
    await conn.execute(
      `INSERT INTO student_profiles (user_id, course, academic_year, semester, student_group, mobile, dob)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         course = VALUES(course), academic_year = VALUES(academic_year), semester = VALUES(semester),
         student_group = VALUES(student_group), mobile = VALUES(mobile), dob = VALUES(dob)`,
      [studentId, data.course, data.academic_year, data.semester, data.student_group, data.mobile, data.dob]
    );

    await audit(conn, req, 'student.update', 'user', studentId, {
      fullName: data.full_name,
      enrollmentNumber: data.enrollment_number,
      studentId: data.student_id,
      accountStatus: data.account_status,
      passwordChanged: Boolean(data.password),
    });
    await conn.commit();

    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    // 1062 = duplicate key; surfaced as a friendly message instead of a 500.
    if (err?.code === 'ER_DUP_ENTRY') {
      await conn.rollback().catch(() => { });
      return res.status(409).json({ message: 'That email, enrollment number, student ID or mobile is already in use.' });
    }
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// ----------------------------------------------------------------------------
// PROFILE PHOTO — admin-managed copy of the student's avatar.
// (The student-facing /api/student/profile/photo route is student-only, so the
//  panel needs its own route to display and replace a student's photo.)
// ----------------------------------------------------------------------------
const avatarDir = path.join(config.uploadDir, 'avatars');
await fs.mkdir(avatarDir, { recursive: true });

const IMAGE_TYPES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function receivePhoto(req, res, next) {
  photoUpload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        message: err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller.' : 'Invalid upload.',
        errors: { photo: err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller.' : 'Invalid upload.' },
      });
    }
    next(err);
  });
}

async function removeAvatar(fileName) {
  if (!fileName) return;
  await fs.unlink(path.join(avatarDir, path.basename(fileName))).catch(() => { });
}

/** Verifies the student exists and is a student; 404s otherwise. */
async function findStudent(conn, id) {
  const [[row]] = await conn.execute(
    "SELECT id FROM users WHERE id = ? AND role = 'student'",
    [id]
  );
  return row || null;
}

router.get('/students/:id/photo', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid student id.' });

    const [[row]] = await pool.execute(
      `SELECT p.photo_path FROM student_profiles p
         JOIN users u ON u.id = p.user_id
        WHERE p.user_id = ? AND u.role = 'student'`,
      [id]
    );
    if (!row?.photo_path) return res.status(404).json({ message: 'No profile photo' });

    const fileName = path.basename(row.photo_path);
    const ext = fileName.split('.').pop().toLowerCase();
    res.set('Cache-Control', 'private, max-age=300');
    res.type(ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
    res.sendFile(path.join(avatarDir, fileName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'No profile photo' });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/students/:id/photo', receivePhoto, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid student id.' });
    if (!req.file) return res.status(400).json({ message: 'Choose a photo to upload.', errors: { photo: 'Choose a photo to upload.' } });

    const conn = await pool.getConnection();
    try {
      const student = await findStudent(conn, id);
      if (!student) return res.status(404).json({ message: 'Student not found.' });

      // Trust the file's actual bytes, never the client-supplied name or MIME type.
      const type = IMAGE_TYPES.find((t) => t.test(req.file.buffer));
      if (!type) return res.status(400).json({ message: 'Photo must be a JPG, PNG or WebP image.', errors: { photo: 'Photo must be a JPG, PNG or WebP image.' } });

      const fileName = `${id}-${crypto.randomBytes(12).toString('hex')}.${type.ext}`;
      await fs.writeFile(path.join(avatarDir, fileName), req.file.buffer);

      const [[old]] = await conn.execute('SELECT photo_path FROM student_profiles WHERE user_id = ?', [id]);
      await conn.execute('UPDATE student_profiles SET photo_path = ? WHERE user_id = ?', [fileName, id]);
      await removeAvatar(old?.photo_path);

      res.json({
        message: 'Profile photo updated',
        photoUrl: `/api/admin/students/${id}/photo?v=${Date.now()}`,
        hasPhoto: true,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/students/:id/photo', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid student id.' });

    const conn = await pool.getConnection();
    try {
      const student = await findStudent(conn, id);
      if (!student) return res.status(404).json({ message: 'Student not found.' });

      const [[row]] = await conn.execute('SELECT photo_path FROM student_profiles WHERE user_id = ?', [id]);
      if (!row?.photo_path) return res.status(404).json({ message: 'No profile photo' });

      await conn.execute('UPDATE student_profiles SET photo_path = NULL WHERE user_id = ?', [id]);
      await removeAvatar(row.photo_path);

      res.json({ message: 'Profile photo removed', photoUrl: null, hasPhoto: false });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.patch('/students/:id/status', async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!['active', 'pending', 'suspended', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    await pool.execute('UPDATE users SET account_status = ? WHERE id = ? AND role = "student"', [status, studentId]);
    await audit(pool, req, 'student.status_change', 'user', studentId, { newStatus: status });

    notifyUserSafe(studentId, {
      type: 'account_status',
      title: 'Account Status Updated',
      message: `Your CR-Assist account status is now ${status}.`,
    });

    res.json({ message: `Student status updated to ${status}` });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// DELETE STUDENT — permanently removes the account.
// Every child table (student_profiles, attendance_records, complaints,
// notifications, student_notice_status, ...) references users.id with
// ON DELETE CASCADE / SET NULL, so the row and its records go together inside
// one transaction. Uploaded files are cleaned up best-effort afterwards.
// ----------------------------------------------------------------------------
router.delete('/students/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid student id.' });
  if (req.user.id === id) return res.status(400).json({ message: 'You cannot delete your own account.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[student]] = await conn.execute(
      `SELECT u.id, u.full_name, u.email, p.photo_path
         FROM users u
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.role = 'student'
        FOR UPDATE`,
      [id]
    );
    if (!student) {
      await conn.rollback();
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Collect the complaint upload dirs before the cascade removes their rows.
    const [complaintRows] = await conn.execute('SELECT id FROM complaints WHERE student_user_id = ?', [id]);
    const [attRows] = await conn.execute('SELECT attachments FROM attendance_complaints WHERE student_user_id = ?', [id]);

    // Single statement: FK cascade removes profile, attendance, complaints,
    // notifications and notice status rows in the same transaction.
    await conn.execute('DELETE FROM users WHERE id = ? AND role = ?', [id, 'student']);

    await audit(conn, req, 'student.delete', 'user', id, {
      fullName: student.full_name,
      email: student.email,
      complaintsRemoved: complaintRows.length,
    });
    await conn.commit();

    // --- best-effort file cleanup (records are already gone) ---
    await removeAvatar(student.photo_path);
    for (const c of complaintRows) {
      await fs.rm(path.join(config.uploadDir, 'complaints', String(c.id)), { recursive: true, force: true }).catch(() => { });
    }
    for (const row of attRows) {
      let list = [];
      try { list = row.attachments ? JSON.parse(row.attachments) : []; } catch (_) { list = []; }
      for (const meta of Array.isArray(list) ? list : []) {
        const name = meta?.storedName;
        if (name) await fs.unlink(path.join(config.uploadDir, 'attendance-complaints', path.basename(name))).catch(() => { });
      }
    }

    res.json({ message: 'Student account and associated records deleted permanently.' });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================================
// 3. FACULTY & CLASS INCHARGE MANAGEMENT
// ============================================================================
router.get('/faculty', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.account_status, u.created_at,
              fp.department, fp.designation, fp.mobile, fp.office_room,
              (
                SELECT GROUP_CONCAT(CONCAT(ci.course, ' Sem ', ci.semester, ' (', ci.student_group, ')') SEPARATOR ', ')
                  FROM class_incharges ci
                 WHERE ci.faculty_user_id = u.id
              ) AS assigned_incharges,
              (
                SELECT COUNT(*) FROM attendance_sessions s WHERE s.faculty_id = u.id
              ) AS total_sessions_conducted
         FROM users u
         LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
        WHERE u.role = 'faculty'
        ORDER BY u.full_name ASC`
    );

    const faculty = rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      accountStatus: r.account_status,
      department: r.department || 'Computer Science',
      designation: r.designation || 'Faculty Member',
      mobile: r.mobile,
      officeRoom: r.office_room,
      assignedClasses: r.assigned_incharges,
      totalSessions: r.total_sessions_conducted,
      createdAt: r.created_at,
    }));

    res.json({ faculty });
  } catch (err) {
    next(err);
  }
});

router.post('/faculty', async (req, res, next) => {
  const { fullName, email, password, department = 'Computer Science', designation = 'Assistant Professor', mobile, officeRoom } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dup] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (dup.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

    const [uRes] = await conn.execute(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES (?, ?, ?, 'faculty', 'active')`,
      [fullName.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const newFacultyId = uRes.insertId;

    await conn.execute(
      `INSERT INTO faculty_profiles (user_id, department, designation, mobile, office_room)
       VALUES (?, ?, ?, ?, ?)`,
      [newFacultyId, department, designation, mobile || null, officeRoom || null]
    );

    await audit(conn, req, 'faculty.create', 'user', newFacultyId, { fullName, department });
    await conn.commit();

    res.status(201).json({ message: 'Faculty member created successfully', facultyId: newFacultyId });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

router.put('/faculty/:id', async (req, res, next) => {
  const facultyId = parseInt(req.params.id, 10);
  const { fullName, email, department, designation, mobile, officeRoom, accountStatus, password } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (password && password.length >= 6) {
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, facultyId]);
    }

    await conn.execute(
      `UPDATE users
          SET full_name = COALESCE(?, full_name),
              email = COALESCE(?, email),
              account_status = COALESCE(?, account_status)
        WHERE id = ? AND role = 'faculty'`,
      [fullName, email, accountStatus, facultyId]
    );

    await conn.execute(
      `INSERT INTO faculty_profiles (user_id, department, designation, mobile, office_room)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         department = VALUES(department),
         designation = VALUES(designation),
         mobile = VALUES(mobile),
         office_room = VALUES(office_room)`,
      [facultyId, department, designation, mobile, officeRoom]
    );

    await audit(conn, req, 'faculty.update', 'user', facultyId, { fullName, department });
    await conn.commit();

    res.json({ message: 'Faculty details updated successfully' });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// Class incharges
router.get('/incharges', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ci.id, ci.course, ci.semester, ci.student_group, ci.office_hours, ci.contact_number, ci.created_at,
              u.id AS faculty_id, u.full_name AS faculty_name, u.email AS faculty_email,
              fp.department, fp.designation
         FROM class_incharges ci
         JOIN users u ON u.id = ci.faculty_user_id
         LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
        ORDER BY ci.course, ci.semester, ci.student_group`
    );

    res.json({ incharges: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/incharges', async (req, res, next) => {
  const { facultyId, course, semester, studentGroup, officeHours, contactNumber } = req.body;

  if (!facultyId || !course || !semester || !studentGroup) {
    return res.status(400).json({ message: 'Faculty, course, semester, and group are required.' });
  }

  try {
    await pool.execute(
      `INSERT INTO class_incharges (faculty_user_id, course, semester, student_group, office_hours, contact_number)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         faculty_user_id = VALUES(faculty_user_id),
         office_hours = VALUES(office_hours),
         contact_number = VALUES(contact_number)`,
      [
        facultyId,
        course,
        semester,
        studentGroup,
        officeHours || 'Monday – Friday, 10:00 AM – 4:00 PM',
        contactNumber || null,
      ]
    );

    await audit(pool, req, 'incharge.assign', 'class_incharge', null, { facultyId, course, semester, studentGroup });

    res.json({ message: 'Class incharge assigned successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/incharges/:id', async (req, res, next) => {
  try {
    const inchargeId = parseInt(req.params.id, 10);
    await pool.execute('DELETE FROM class_incharges WHERE id = ?', [inchargeId]);
    await audit(pool, req, 'incharge.remove', 'class_incharge', inchargeId);
    res.json({ message: 'Class incharge removed successfully' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// DEPARTMENTS
// ============================================================================
router.get('/departments', async (req, res, next) => {
  try {
    const [departments] = await pool.query(
      `SELECT id, code, name, created_at FROM departments ORDER BY code`
    );
    res.json({ departments });
  } catch (err) {
    next(err);
  }
});

router.post('/departments', async (req, res, next) => {
  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

  if (!code || !name) {
    return res.status(400).json({ message: 'Department code and name are required.' });
  }
  if (!/^[A-Z0-9]{2,20}$/.test(code)) {
    return res.status(400).json({ message: 'Code must be 2–20 letters or digits (e.g. CSE, MBA).' });
  }
  if (name.length > 100) {
    return res.status(400).json({ message: 'Department name must be 100 characters or fewer.' });
  }

  try {
    const [[existing]] = await pool.execute('SELECT id FROM departments WHERE code = ?', [code]);
    if (existing) {
      return res.status(409).json({ message: `A department with code "${code}" already exists.` });
    }

    const [result] = await pool.execute('INSERT INTO departments (code, name) VALUES (?, ?)', [code, name]);
    await audit(pool, req, 'department.create', 'department', result.insertId, { code, name });

    res.status(201).json({ message: 'Department added successfully', department: { id: result.insertId, code, name } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: `A department with code "${code}" already exists.` });
    }
    next(err);
  }
});

router.put('/departments/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid department id.' });
  }

  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

  if (!code || !name) {
    return res.status(400).json({ message: 'Department code and name are required.' });
  }
  if (!/^[A-Z0-9]{2,20}$/.test(code)) {
    return res.status(400).json({ message: 'Code must be 2–20 letters or digits (e.g. CSE, MBA).' });
  }
  if (name.length > 100) {
    return res.status(400).json({ message: 'Department name must be 100 characters or fewer.' });
  }

  try {
    const [[existing]] = await pool.execute('SELECT id FROM departments WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    // Duplicate-code check against every OTHER department (keeping your own code is fine).
    const [[dupe]] = await pool.execute('SELECT id FROM departments WHERE code = ? AND id <> ?', [code, id]);
    if (dupe) {
      return res.status(409).json({ message: `A department with code "${code}" already exists.` });
    }

    await pool.execute('UPDATE departments SET code = ?, name = ? WHERE id = ?', [code, name, id]);
    await audit(pool, req, 'department.update', 'department', id, { code, name });

    res.json({ message: 'Department updated successfully', department: { id, code, name } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: `A department with code "${code}" already exists.` });
    }
    next(err);
  }
});

router.delete('/departments/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid department id.' });
  }

  try {
    const [[existing]] = await pool.execute('SELECT id, code, name FROM departments WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    // Nothing references departments (verified: no foreign keys), so a plain delete is safe.
    await pool.execute('DELETE FROM departments WHERE id = ?', [id]);
    await audit(pool, req, 'department.delete', 'department', id, { code: existing.code, name: existing.name });

    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Classes list
router.get('/classes', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.course, p.semester, p.student_group,
              COUNT(DISTINCT p.user_id) AS student_count,
              ci.id AS incharge_id, ci.faculty_user_id, u.full_name AS incharge_name, u.email AS incharge_email,
              ci.office_hours, ci.contact_number
         FROM student_profiles p
         LEFT JOIN class_incharges ci ON ci.course = p.course AND ci.semester = p.semester AND ci.student_group = p.student_group
         LEFT JOIN users u ON u.id = ci.faculty_user_id
        GROUP BY p.course, p.semester, p.student_group, ci.id, ci.faculty_user_id, u.full_name, u.email, ci.office_hours, ci.contact_number
        ORDER BY p.course, p.semester, p.student_group`
    );

    res.json({ classes: rows });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. ATTENDANCE MANAGEMENT
// ============================================================================

// The "Class / Branch" field is free text now; the exact label the admin typed
// is kept here. Added lazily so existing databases keep working.
let hasClassBranchCol = null;
async function ensureClassBranchColumn() {
  if (hasClassBranchCol !== null) return hasClassBranchCol;
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_sessions' AND COLUMN_NAME = 'class_branch'`
    );
    if (!cols.length) {
      await pool.query(
        'ALTER TABLE attendance_sessions ADD COLUMN class_branch VARCHAR(100) NULL AFTER semester'
      );
    }
    hasClassBranchCol = true;
  } catch (err) {
    hasClassBranchCol = false;
  }
  return hasClassBranchCol;
}

router.get('/attendance/sessions', async (req, res, next) => {
  try {
    const { status, date, course, semester, group } = req.query;
    const conditions = ['1=1'];
    const params = [];
    const classBranchCol = (await ensureClassBranchColumn())
      ? 's.class_branch'
      : 'NULL AS class_branch';

    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }
    if (date) {
      conditions.push('DATE(s.starts_at) = ?');
      params.push(date);
    }
    if (course) {
      conditions.push('s.course = ?');
      params.push(course);
    }
    if (semester) {
      conditions.push('s.semester = ?');
      params.push(semester);
    }
    if (group) {
      conditions.push('s.student_group = ?');
      params.push(group);
    }

    const [sessions] = await pool.execute(
      `SELECT s.id, s.subject, s.course, s.semester, ${classBranchCol}, s.student_group, s.room,
              s.starts_at, s.ends_at, s.status, s.created_at,
              u.id AS faculty_id, COALESCE(u.full_name, s.faculty_name) AS faculty_name,
              COUNT(r.id) AS total_marked,
              SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present_count,
              SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late_count,
              SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
              (
                SELECT COUNT(*) FROM student_profiles sp
                 WHERE sp.course = s.course AND sp.semester = s.semester
                   AND (s.student_group IS NULL OR sp.student_group = s.student_group)
              ) AS eligible_students
         FROM attendance_sessions s
         LEFT JOIN users u ON u.id = s.faculty_id
         LEFT JOIN attendance_records r ON r.session_id = s.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY s.id
        ORDER BY s.starts_at DESC
        LIMIT 100`,
      params
    );

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

router.post('/attendance/sessions', async (req, res, next) => {
  const {
    subject,
    course,
    semester,
    studentGroup,
    classBranch,
    facultyId,
    facultyName,
    room,
    startsAt,
    endsAt,
    status = 'active',
  } = req.body;

  // The form sends the typed "Class / Branch" label. Resolve it against the
  // cohorts that have students so the scanner can still match QR codes.
  const typedClassBranch =
    typeof classBranch === 'string' ? classBranch.trim().replace(/\s+/g, ' ').slice(0, 100) : '';

  let resolvedCourse = typeof course === 'string' ? course.trim() : '';
  let resolvedSemester = Number(semester);
  let resolvedGroup = studentGroup || null;

  if (typedClassBranch) {
    try {
      const [cohorts] = await pool.query(
        `SELECT DISTINCT course, semester, student_group FROM student_profiles
          WHERE course IS NOT NULL AND semester IS NOT NULL`
      );
      const resolved = resolveClassBranch(typedClassBranch, cohorts);
      if (resolved.error) return res.status(400).json({ message: resolved.error });
      resolvedCourse = resolved.course;
      resolvedSemester = resolved.semester;
      resolvedGroup = resolved.studentGroup;
    } catch (err) {
      return next(err);
    }
  }

  if (!subject || !resolvedCourse || !resolvedSemester) {
    return res.status(400).json({ message: 'Subject, class / branch, and semester are required.' });
  }

  // The admin scans student QR codes, so the session starts now and stays open for an hour.
  // Callers may still override the window explicitly (e.g. the faculty app).
  const startDate = startsAt ? new Date(startsAt) : new Date();
  const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60 * 1000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return res.status(400).json({ message: 'Session end time must be after the start time.' });
  }

  const typedFacultyName = typeof facultyName === 'string' ? facultyName.trim() : '';
  const storedClassBranch = typedClassBranch || null;

  try {
    const withClassBranch = await ensureClassBranchColumn();
    const [result] = await pool.execute(
      withClassBranch
        ? `INSERT INTO attendance_sessions (subject, course, semester, class_branch, student_group, faculty_id, faculty_name, room, starts_at, ends_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO attendance_sessions (subject, course, semester, student_group, faculty_id, faculty_name, room, starts_at, ends_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subject.trim(),
        resolvedCourse,
        resolvedSemester,
        ...(withClassBranch ? [storedClassBranch] : []),
        resolvedGroup,
        facultyId || null,
        typedFacultyName || null,
        room || null,
        startDate,
        endDate,
        status,
      ]
    );

    const sessionId = result.insertId;
    await audit(pool, req, 'session.create', 'attendance_session', sessionId, {
      subject,
      course: resolvedCourse,
      semester: resolvedSemester,
      classBranch: storedClassBranch,
      studentGroup: resolvedGroup,
      facultyName: typedFacultyName || null,
    });

    res.status(201).json({
      message: 'Attendance session created successfully',
      sessionId,
      // Returned so the mobile app can show the exact label that was resolved.
      session: {
        id: sessionId,
        subject: subject.trim(),
        course: resolvedCourse,
        semester: resolvedSemester,
        classBranch: storedClassBranch,
        studentGroup: resolvedGroup,
        facultyName: typedFacultyName || null,
        room: room || null,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        status,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/attendance/sessions/:id/status', async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!['scheduled', 'active', 'closed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    await pool.execute('UPDATE attendance_sessions SET status = ? WHERE id = ?', [status, sessionId]);
    await audit(pool, req, 'session.status', 'attendance_session', sessionId, { newStatus: status });

    res.json({ message: `Session status updated to ${status}` });
  } catch (err) {
    next(err);
  }
});

// Generate dynamic QR code image for a session (for classroom display)
router.get('/attendance/sessions/:id/qr', async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const [[session]] = await pool.execute(
      'SELECT id, subject, course, semester, student_group, status, starts_at, ends_at FROM attendance_sessions WHERE id = ?',
      [sessionId]
    );

    if (!session) return res.status(404).json({ message: 'Session not found.' });

    // Session code for display
    const qrPayload = `SMARTATTEND:SESSION:${session.id}:${new Date(session.starts_at).getTime()}`;
    const qrImage = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: { dark: '#0b1f4b', light: '#ffffff' },
    });

    res.json({
      session,
      qrImage,
      qrPayload,
    });
  } catch (err) {
    next(err);
  }
});

// Excel report for one attendance session: every student marked, with the full
// session context (class, subject, teacher, room, date, scan time and status).
router.get('/attendance/sessions/:id/report', async (req, res, next) => {
  try {
    const sessionId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: 'Invalid session id.' });
    }

    const [[session]] = await pool.execute(
      `SELECT s.id, s.subject, s.course, s.semester, s.student_group, s.room,
              s.starts_at, s.status, COALESCE(f.full_name, s.faculty_name) AS faculty_name
         FROM attendance_sessions s
         LEFT JOIN users f ON f.id = s.faculty_id
        WHERE s.id = ?`,
      [sessionId],
    );
    if (!session) return res.status(404).json({ message: 'Attendance session not found.' });

    const [rows] = await pool.execute(
      `SELECT u.full_name, u.enrollment_number, u.student_id,
              p.course, p.semester, p.student_group,
              r.status, r.marked_at
         FROM attendance_records r
         JOIN users u ON u.id = r.student_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE r.session_id = ?
        ORDER BY r.marked_at ASC, u.full_name ASC`,
      [sessionId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No students have been marked in this session yet.' });
    }

    const istDate = (value) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
    const istTime = (value) =>
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      }).format(new Date(value));

    const classLabel = (row) =>
      `${row.course || session.course} · Sem ${row.semester ?? session.semester}` +
      (row.student_group || session.student_group ? ` · Group ${row.student_group || session.student_group}` : '');

    const columns = [
      { header: 'S.No', width: 7 },
      { header: 'Student Name', width: 26 },
      { header: 'Enrollment Number', width: 20 },
      { header: 'Class / Branch', width: 22 },
      { header: 'Subject', width: 24 },
      { header: 'Teacher', width: 22 },
      { header: 'Room', width: 14 },
      { header: 'Date', width: 15 },
      { header: 'Scan Time', width: 14 },
      { header: 'Status', width: 12 },
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CR-Assist';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Attendance', {
      views: [{ state: 'frozen', ySplit: 4 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = columns.map(({ width }, index) => ({ key: `c${index}`, width }));

    sheet.mergeCells('A1:J1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Attendance Report';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 26;

    sheet.mergeCells('A2:J2');
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value =
      `${session.subject}   |   ${session.course} · Sem ${session.semester}` +
      (session.student_group ? ` · Group ${session.student_group}` : '') +
      `   |   ${session.faculty_name || 'Teacher not recorded'}   |   Room: ${session.room || '—'}` +
      `   |   ${istDate(session.starts_at)}   |   Students marked: ${rows.length}`;
    subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(2).height = 18;
    sheet.getRow(3).height = 8;

    const headerRow = sheet.getRow(4);
    headerRow.height = 24;
    columns.forEach((column, index) => {
      headerRow.getCell(index + 1).value = column.header;
    });
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E40AF' } },
        left: { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
        right: { style: 'thin', color: { argb: 'FF1E40AF' } },
      };
    });

    rows.forEach((row, index) => {
      const dataRow = sheet.addRow({
        c0: index + 1,
        c1: row.full_name || '—',
        c2: row.enrollment_number || row.student_id || '—',
        c3: classLabel(row),
        c4: session.subject,
        c5: session.faculty_name || '—',
        c6: session.room || '—',
        c7: istDate(row.marked_at),
        c8: istTime(row.marked_at),
        c9: row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : 'Present',
      });
      dataRow.height = 20;
      const banded = index % 2 === 1;
      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        };
        if (banded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        if (colNumber === 10) {
          const present = (row.status || 'present') === 'present';
          cell.font = {
            name: 'Calibri', size: 11, bold: true,
            color: { argb: present ? 'FF047857' : 'FF92400E' },
          };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: present ? 'FFD1FAE5' : 'FFFEF3C7' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    });

    sheet.autoFilter = { from: 'A4', to: `J${rows.length + 4}` };
    sheet.pageSetup.printTitlesRow = '4:4';

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const sessionDay = new Date(session.starts_at).toISOString().slice(0, 10);
    const filename = `attendance-session-${session.id}-${sessionDay}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

// View and filter attendance records
router.get('/attendance/records', async (req, res, next) => {
  try {
    const { sessionId, studentId, course, semester, group, status, date, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['1=1'];
    const params = [];

    if (sessionId) {
      conditions.push('r.session_id = ?');
      params.push(sessionId);
    }
    if (studentId) {
      conditions.push('r.student_id = ?');
      params.push(studentId);
    }
    if (course) {
      conditions.push('p.course = ?');
      params.push(course);
    }
    if (semester) {
      conditions.push('p.semester = ?');
      params.push(semester);
    }
    if (group) {
      conditions.push('p.student_group = ?');
      params.push(group);
    }
    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (date) {
      conditions.push('DATE(r.marked_at) = ?');
      params.push(date);
    }
    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.enrollment_number LIKE ? OR s.subject LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM attendance_records r
         JOIN attendance_sessions s ON s.id = r.session_id
         JOIN users u ON u.id = r.student_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE ${whereClause}`,
      params
    );

    const [records] = await pool.execute(
      `SELECT r.id, r.session_id, r.student_id, r.status, r.method, r.marked_at,
              u.full_name AS student_name, u.enrollment_number, u.student_id AS college_id,
              p.course, p.semester, p.student_group,
              s.subject, s.room,
              marker.full_name AS marked_by_name
         FROM attendance_records r
         JOIN attendance_sessions s ON s.id = r.session_id
         JOIN users u ON u.id = r.student_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
         LEFT JOIN users marker ON marker.id = r.marked_by
        WHERE ${whereClause}
        ORDER BY r.marked_at DESC
        LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );

    res.json({ records, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 });
  } catch (err) {
    next(err);
  }
});

// Admin manual attendance correction / override with audit
router.post('/attendance/records/correct', async (req, res, next) => {
  const { sessionId, studentId, status, reason } = req.body;

  if (!sessionId || !studentId || !status || !reason) {
    return res.status(400).json({ message: 'Session, student, new status, and reason are required.' });
  }
  if (!['present', 'late', 'absent'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.execute(
      'SELECT id, status FROM attendance_records WHERE session_id = ? AND student_id = ?',
      [sessionId, studentId]
    );

    const prevStatus = existing?.status || 'none';

    await conn.execute(
      `INSERT INTO attendance_records (session_id, student_id, status, method, marked_by, marked_at)
       VALUES (?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         method = 'manual',
         marked_by = VALUES(marked_by),
         marked_at = CURRENT_TIMESTAMP()`,
      [sessionId, studentId, status, req.user.id]
    );

    await audit(conn, req, 'attendance.correction', 'attendance_record', existing?.id || null, {
      sessionId,
      studentId,
      prevStatus,
      newStatus: status,
      reason,
    });

    await conn.commit();

    notifyUserSafe(studentId, {
      type: 'attendance_correction',
      title: 'Attendance Record Updated',
      message: `Your attendance record was changed to ${status}. Reason: ${reason}`,
    });

    res.json({ message: `Attendance updated to ${status}.` });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================================
// 5. COMPLAINTS MANAGEMENT
// ============================================================================
router.get('/complaints', async (req, res, next) => {
  try {
    const { q, status, category, priority, course, semester, group, assigned, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['1=1'];
    const params = [];

    if (q) {
      conditions.push('(c.complaint_number LIKE ? OR c.title LIKE ? OR u.full_name LIKE ? OR u.enrollment_number LIKE ? OR c.lecture_number LIKE ? OR c.lecture_time LIKE ?)');
      const term = `%${q}%`;
      params.push(term, term, term, term, term, term);
    }
    if (status) {
      conditions.push('c.status = ?');
      params.push(status);
    }
    if (category) {
      conditions.push('c.category = ?');
      params.push(category);
    }
    if (priority) {
      conditions.push('c.priority = ?');
      params.push(priority);
    }
    if (course) {
      conditions.push('p.course = ?');
      params.push(course);
    }
    if (semester) {
      conditions.push('p.semester = ?');
      params.push(semester);
    }
    if (group) {
      conditions.push('p.student_group = ?');
      params.push(group);
    }
    if (assigned === 'me') {
      conditions.push('c.assigned_to = ?');
      params.push(req.user.id);
    } else if (assigned === 'unassigned') {
      conditions.push('c.assigned_to IS NULL');
    }

    const whereClause = conditions.join(' AND ');

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM complaints c
         JOIN users u ON u.id = c.student_user_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE ${whereClause}`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT c.id, c.complaint_number, c.title, c.category, ct.label AS type_label, c.priority, c.status,
              c.lecture_time, c.lecture_number, c.description,
              c.created_at, c.updated_at, c.resolved_at,
              u.id AS student_id, u.full_name AS student_name, u.enrollment_number,
              p.course, p.semester, p.student_group,
              assignee.full_name AS assigned_to_name,
              (SELECT COUNT(*) FROM complaint_attachments att WHERE att.complaint_id = c.id) AS attachment_count,
              (SELECT COUNT(*) FROM complaint_responses resp WHERE resp.complaint_id = c.id) AS response_count,
              (SELECT COUNT(*) FROM complaint_internal_notes note WHERE note.complaint_id = c.id) AS note_count
         FROM complaints c
         JOIN users u ON u.id = c.student_user_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
         LEFT JOIN complaint_types ct ON ct.id = c.type_id
         LEFT JOIN users assignee ON assignee.id = c.assigned_to
        WHERE ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );

    res.json({ complaints: rows, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 });
  } catch (err) {
    next(err);
  }
});

router.get('/complaints/:id', async (req, res, next) => {
  try {
    const complaintId = parseInt(req.params.id, 10);
    const [[c]] = await pool.execute(
      `SELECT c.*,
              ct.label AS type_label,
              u.full_name AS student_name, u.email AS student_email, u.enrollment_number, u.student_id AS college_id,
              p.course, p.semester, p.student_group, p.mobile AS student_mobile,
              assignee.full_name AS assigned_to_name, assignee.email AS assigned_to_email
         FROM complaints c
         JOIN users u ON u.id = c.student_user_id
         LEFT JOIN student_profiles p ON p.user_id = u.id
         LEFT JOIN complaint_types ct ON ct.id = c.type_id
         LEFT JOIN users assignee ON assignee.id = c.assigned_to
        WHERE c.id = ?`,
      [complaintId]
    );

    if (!c) return res.status(404).json({ message: 'Complaint not found.' });

    // Attachments
    const [attachments] = await pool.execute(
      `SELECT id, original_filename, mime_type, file_size, uploaded_at FROM complaint_attachments WHERE complaint_id = ?`,
      [complaintId]
    );

    // Responses
    const [responses] = await pool.execute(
      `SELECT cr.id, cr.message, cr.created_at, u.full_name AS author_name, u.role AS author_role
         FROM complaint_responses cr
         LEFT JOIN users u ON u.id = cr.author_user_id
        WHERE cr.complaint_id = ?
        ORDER BY cr.created_at ASC`,
      [complaintId]
    );

    // Internal Notes (Staff/Admin ONLY)
    const [internalNotes] = await pool.execute(
      `SELECT n.id, n.note, n.created_at, u.full_name AS author_name
         FROM complaint_internal_notes n
         LEFT JOIN users u ON u.id = n.author_user_id
        WHERE n.complaint_id = ?
        ORDER BY n.created_at ASC`,
      [complaintId]
    );

    // Status Timeline
    const [statusHistory] = await pool.execute(
      `SELECT sh.id, sh.previous_status, sh.new_status, sh.change_reason, sh.created_at,
              u.full_name AS changed_by_name
         FROM complaint_status_history sh
         LEFT JOIN users u ON u.id = sh.changed_by
        WHERE sh.complaint_id = ?
        ORDER BY sh.created_at ASC`,
      [complaintId]
    );

    // Attendance correction details if any
    const [[correction]] = await pool.execute(
      `SELECT ac.*, s.subject, s.starts_at FROM attendance_corrections ac
         JOIN attendance_sessions s ON s.id = ac.session_id
        WHERE ac.complaint_id = ?`,
      [complaintId]
    );

    res.json({
      complaint: c,
      attachments,
      responses,
      internalNotes,
      statusHistory,
      correction: correction || null,
    });
  } catch (err) {
    next(err);
  }
});

// Reply to student (public on complaint)
router.post('/complaints/:id/reply', async (req, res, next) => {
  const complaintId = parseInt(req.params.id, 10);
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'Reply message is required.' });
  }

  try {
    const [[complaint]] = await pool.execute('SELECT id, student_user_id, complaint_number FROM complaints WHERE id = ?', [complaintId]);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });

    await pool.execute(
      'INSERT INTO complaint_responses (complaint_id, author_user_id, message) VALUES (?, ?, ?)',
      [complaintId, req.user.id, message.trim()]
    );

    notifyUserSafe(complaint.student_user_id, {
      type: 'complaint_response',
      title: `New response on ${complaint.complaint_number}`,
      message: `The administration responded to your complaint: "${message.slice(0, 100)}"`,
      link: `/complaints/${complaintId}`,
    });

    res.status(201).json({ message: 'Reply posted successfully' });
  } catch (err) {
    next(err);
  }
});

// Add internal note (confidential to staff)
router.post('/complaints/:id/notes', async (req, res, next) => {
  const complaintId = parseInt(req.params.id, 10);
  const { note } = req.body;

  if (!note || !note.trim()) {
    return res.status(400).json({ message: 'Internal note text is required.' });
  }

  try {
    await pool.execute(
      'INSERT INTO complaint_internal_notes (complaint_id, author_user_id, note) VALUES (?, ?, ?)',
      [complaintId, req.user.id, note.trim()]
    );

    res.status(201).json({ message: 'Internal note saved' });
  } catch (err) {
    next(err);
  }
});

// Update complaint status
router.patch('/complaints/:id/status', async (req, res, next) => {
  const complaintId = parseInt(req.params.id, 10);
  const { status, reason, resolutionNote } = req.body;

  if (!['submitted', 'under_review', 'in_progress', 'resolved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[complaint]] = await conn.execute(
      'SELECT id, status, student_user_id, complaint_number FROM complaints WHERE id = ? FOR UPDATE',
      [complaintId]
    );

    if (!complaint) {
      await conn.rollback();
      return res.status(404).json({ message: 'Complaint not found.' });
    }

    const prevStatus = complaint.status;
    const resolvedAt = status === 'resolved' ? new Date() : null;

    await conn.execute(
      `UPDATE complaints
          SET status = ?,
              resolution_note = COALESCE(?, resolution_note),
              resolved_at = COALESCE(?, resolved_at)
        WHERE id = ?`,
      [status, resolutionNote || null, resolvedAt, complaintId]
    );

    await conn.execute(
      `INSERT INTO complaint_status_history (complaint_id, changed_by, previous_status, new_status, change_reason)
       VALUES (?, ?, ?, ?, ?)`,
      [complaintId, req.user.id, prevStatus, status, reason || null]
    );

    await audit(conn, req, 'complaint.status', 'complaint', complaintId, { prevStatus, newStatus: status, reason });
    await conn.commit();

    notifyUserSafe(complaint.student_user_id, {
      type: 'complaint_status',
      title: `Complaint ${complaint.complaint_number} Updated`,
      message: `Your complaint is now ${status.replace('_', ' ')}.${resolutionNote ? ` Resolution note: ${resolutionNote}` : ''}`,
      link: `/complaints/${complaintId}`,
    });

    res.json({ message: `Complaint status updated to ${status}` });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// Assign complaint
router.patch('/complaints/:id/assign', async (req, res, next) => {
  const complaintId = parseInt(req.params.id, 10);
  const { assigneeId } = req.body;

  try {
    await pool.execute('UPDATE complaints SET assigned_to = ? WHERE id = ?', [assigneeId || null, complaintId]);
    await audit(pool, req, 'complaint.assign', 'complaint', complaintId, { assignedTo: assigneeId });

    if (assigneeId) {
      notifyUserSafe(assigneeId, {
        type: 'complaint_assigned',
        title: 'New Complaint Assigned',
        message: `A student complaint was assigned to you for review.`,
        link: `/staff/complaints/${complaintId}`,
      });
    }

    res.json({ message: 'Complaint assigned successfully' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. REPORTS & ANALYTICS
// ============================================================================
router.get('/reports/attendance', async (req, res, next) => {
  try {
    const { from, to, course, semester, group } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (from) {
      conditions.push('DATE(s.starts_at) >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('DATE(s.starts_at) <= ?');
      params.push(to);
    }
    if (course) {
      conditions.push('s.course = ?');
      params.push(course);
    }
    if (semester) {
      conditions.push('s.semester = ?');
      params.push(semester);
    }
    if (group) {
      conditions.push('s.student_group = ?');
      params.push(group);
    }

    const [rows] = await pool.execute(
      `SELECT s.course, s.semester, s.student_group, s.subject,
              COUNT(DISTINCT s.id) AS total_sessions,
              COUNT(r.id) AS total_records,
              SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present_records,
              SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late_records,
              SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent_records
         FROM attendance_sessions s
         LEFT JOIN attendance_records r ON r.session_id = s.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY s.course, s.semester, s.student_group, s.subject
        ORDER BY s.course, s.semester, s.subject`,
      params
    );

    const report = rows.map((r) => {
      const total = Number(r.total_records) || 0;
      const attended = Number(r.present_records) + Number(r.late_records);
      const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;
      return {
        course: r.course,
        semester: r.semester,
        group: r.student_group || 'All',
        subject: r.subject,
        sessions: r.total_sessions,
        totalRecords: total,
        present: Number(r.present_records),
        late: Number(r.late_records),
        absent: Number(r.absent_records),
        attendancePercentage: percentage,
      };
    });

    res.json({ report });
  } catch (err) {
    next(err);
  }
});

// Low attendance students below threshold
router.get('/reports/low-attendance', async (req, res, next) => {
  try {
    const threshold = Math.min(100, Math.max(1, parseInt(req.query.threshold, 10) || config.minAttendancePercent || 75));
    const { course, semester } = req.query;

    const conditions = ["u.role = 'student'", "u.account_status = 'active'"];
    const params = [];

    if (course) {
      conditions.push('p.course = ?');
      params.push(course);
    }
    if (semester) {
      conditions.push('p.semester = ?');
      params.push(semester);
    }

    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.enrollment_number, u.student_id,
              p.course, p.semester, p.student_group, p.mobile,
              COUNT(r.id) AS total_sessions,
              SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attended_sessions,
              ROUND(
                (SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0)) * 100
              ) AS percentage
         FROM users u
         JOIN student_profiles p ON p.user_id = u.id
         LEFT JOIN attendance_records r ON r.student_id = u.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY u.id
        HAVING (percentage < ${threshold} OR percentage IS NULL)
        ORDER BY percentage ASC, u.full_name ASC`,
      params
    );

    res.json({
      threshold,
      count: rows.length,
      students: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        enrollmentNumber: r.enrollment_number,
        studentId: r.student_id,
        course: r.course,
        semester: r.semester,
        group: r.student_group,
        mobile: r.mobile,
        totalSessions: r.total_sessions,
        attendedSessions: Number(r.attended_sessions) || 0,
        percentage: r.percentage !== null ? Number(r.percentage) : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 7. SETTINGS & PROFILE
// ============================================================================
router.get('/settings', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const dbSettings = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));

    res.json({
      settings: {
        minAttendancePercent: Number(dbSettings.min_attendance_percent) || config.minAttendancePercent || 75,
        attendanceTokenTtlSeconds: Number(dbSettings.attendance_token_ttl_seconds) || config.attendanceTokenTtlSeconds || 45,
        lateAfterMinutes: Number(dbSettings.late_after_minutes) || config.lateAfterMinutes || 15,
        requireApproval: dbSettings.require_approval !== undefined ? dbSettings.require_approval === 'true' : config.requireApproval,
        academicYear: dbSettings.academic_year || '2025-2026',
        currentSemester: Number(dbSettings.current_semester) || 3,
        collegeName: dbSettings.college_name || 'Engineering College',
        supportEmail: dbSettings.support_email || 'support@smartattend.local',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  const { minAttendancePercent, attendanceTokenTtlSeconds, lateAfterMinutes, requireApproval, academicYear, currentSemester, collegeName, supportEmail } = req.body;

  const entries = [
    ['min_attendance_percent', String(minAttendancePercent)],
    ['attendance_token_ttl_seconds', String(attendanceTokenTtlSeconds)],
    ['late_after_minutes', String(lateAfterMinutes)],
    ['require_approval', String(requireApproval)],
    ['academic_year', String(academicYear)],
    ['current_semester', String(currentSemester)],
    ['college_name', String(collegeName)],
    ['support_email', String(supportEmail)],
  ].filter(([_, v]) => v !== 'undefined');

  try {
    for (const [key, val] of entries) {
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, val]
      );
    }

    await audit(pool, req, 'settings.update', 'system_settings', null, req.body);
    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  const { fullName, email, currentPassword, newPassword } = req.body;

  if (!fullName || !email) {
    return res.status(400).json({ message: 'Name and email are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[adminUser]] = await conn.execute('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!adminUser) {
      await conn.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }

    if (newPassword) {
      if (!currentPassword) {
        await conn.rollback();
        return res.status(400).json({ message: 'Enter your current password to set a new password.' });
      }
      const validCurrent = await bcrypt.compare(currentPassword, adminUser.password_hash);
      if (!validCurrent) {
        await conn.rollback();
        return res.status(400).json({ message: 'Incorrect current password.' });
      }
      const pwError = checkPassword(newPassword);
      if (pwError) {
        await conn.rollback();
        return res.status(400).json({ message: pwError });
      }
      const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
      await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
    }

    await conn.execute('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [fullName.trim(), email.trim().toLowerCase(), req.user.id]);

    await audit(conn, req, 'admin.profile_update', 'user', req.user.id, { fullName, email });
    await conn.commit();

    res.json({ message: 'Admin profile updated successfully' });
  } catch (err) {
    await conn.rollback().catch(() => { });
    next(err);
  } finally {
    conn.release();
  }
});

// Audit logs list
router.get('/audit-logs', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM audit_logs');
    const [logs] = await pool.execute(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at,
              u.full_name AS actor_name, u.role AS actor_role
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`
    );

    res.json({ logs, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    next(err);
  }
});

export default router;

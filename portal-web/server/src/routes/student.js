import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import QRCode from 'qrcode';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { signAttendanceToken } from '../utils/attendanceToken.js';
import { COURSES, validateProfileUpdate, validateFullProfileUpdate } from '../utils/validation.js';
import { getHistory, getOngoingSession, getSummary } from '../services/attendance.js';
import {
  ensureComplaintOptionsSeeded,
  listComplaintOptionLabels,
  isComplaintOption,
} from '../utils/complaintOptions.js';

const router = Router();
const avatarDir = path.join(config.uploadDir, 'avatars');
await fs.mkdir(avatarDir, { recursive: true });

// Every route below is for the signed-in student and only reads/writes rows for req.user.id.
router.use(requireAuth, requireRole('student'));

// ---------------------------------------------------------------- attendance complaints
// Students may read their own complaints and create new ones. The status is an
// admin-only decision: new rows always start as 'pending' (any status in the
// request body is ignored) and there is no student endpoint to change it.
router.all('/attendance-complaints/:id/status', (req, res) =>
  res.status(403).json({ message: 'Students cannot change the status of a complaint.' }),
);

const attendanceComplaintUploadDir = path.join(config.uploadDir, 'attendance-complaints');
try {
  await fs.mkdir(attendanceComplaintUploadDir, { recursive: true });
} catch (err) {
  console.error('Failed to create attendance complaints dir:', err);
}

const attendanceComplaintStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, attendanceComplaintUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `att-complaint-${uniqueSuffix}${ext}`);
  },
});

const uploadAttendanceAttachments = multer({
  storage: attendanceComplaintStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Invalid file type. Allowed formats: PNG, JPG, JPEG, WEBP, PDF, DOC, DOCX.'));
    }
    cb(null, true);
  },
});

function handleAttendanceComplaintUpload(req, res, next) {
  uploadAttendanceAttachments.array('files', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File is too large. Max file size is 10 MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message || 'Invalid file upload.' });
    }
    next();
  });
}

// ---- attendance complaint form helpers ----
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in YYYY-MM-DD form (catches 2026-02-31 etc.). */
function isIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Today in India (UTC+5:30) as YYYY-MM-DD — matches how the app handles calendar dates. */
function indiaToday() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Dropdown options for the attendance complaint form (admin-managed, database-backed). */
router.get('/complaint-options', async (req, res, next) => {
  try {
    await ensureComplaintOptionsSeeded();
    res.json(await listComplaintOptionLabels());
  } catch (err) {
    next(err);
  }
});

router.get('/attendance-complaints', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, lecture_time, lecture_number, incident_date, description, status, attachments, admin_remarks, submitted_at
         FROM attendance_complaints
        WHERE student_user_id = ?
        ORDER BY submitted_at DESC`,
      [req.user.id],
    );

    const complaints = rows.map((r) => {
      let attachments = [];
      if (r.attachments) {
        try {
          attachments = typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments;
        } catch (_) {
          attachments = [];
        }
      }
      return {
        id: r.id,
        lectureTime: r.lecture_time,
        lectureNumber: r.lecture_number,
        incidentDate: r.incident_date,
        description: r.description,
        status: r.status || 'pending',
        attachments: Array.isArray(attachments) ? attachments : [],
        adminRemarks: r.admin_remarks || null,
        submittedAt: r.submitted_at,
      };
    });

    res.json({ complaints });
  } catch (err) {
    next(err);
  }
});

router.post('/attendance-complaints', handleAttendanceComplaintUpload, async (req, res, next) => {
  const lectureTime = typeof req.body.lectureTime === 'string' ? req.body.lectureTime.trim() : '';
  const lectureNumber = typeof req.body.lectureNumber === 'string' ? req.body.lectureNumber.trim() : '';
  const incidentDate = typeof req.body.incidentDate === 'string' ? req.body.incidentDate.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const errors = {};

  if (!lectureTime) errors.lectureTime = 'Select a valid lecture time.';
  else if (!(await isComplaintOption('lecture_time', lectureTime))) errors.lectureTime = 'Select a valid lecture time.';
  if (!lectureNumber) errors.lectureNumber = 'Select a valid lecture number.';
  else if (!(await isComplaintOption('lecture_number', lectureNumber))) errors.lectureNumber = 'Select a valid lecture number.';
  if (!incidentDate) errors.incidentDate = 'Select a lecture date.';
  else if (!isIsoDate(incidentDate)) errors.incidentDate = 'Enter a valid lecture date.';
  else if (incidentDate > indiaToday()) errors.incidentDate = 'Lecture date cannot be in the future.';

  // Description is optional — only its length is capped when provided.
  if (description.length > 5000) errors.description = 'Description must be 5000 characters or fewer.';
  if (Object.keys(errors).length) {
    if (req.files?.length) {
      for (const f of req.files) {
        try { await fs.unlink(f.path); } catch (_) {}
      }
    }
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  const attachmentsMeta = (req.files || []).map((file) => ({
    originalName: file.originalname,
    storedName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    url: `/api/student/attendance-complaints/file/${file.filename}`,
  }));

  try {
    const [result] = await pool.execute(
      `INSERT INTO attendance_complaints (student_user_id, lecture_time, lecture_number, incident_date, description, status, attachments)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [req.user.id, lectureTime, lectureNumber, incidentDate, description, JSON.stringify(attachmentsMeta)],
    );

    res.status(201).json({
      message: 'Attendance complaint submitted successfully.',
      complaint: {
        id: result.insertId,
        lectureTime,
        lectureNumber,
        incidentDate,
        description,
        status: 'pending',
        attachments: attachmentsMeta,
        submittedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (req.files?.length) {
      for (const f of req.files) {
        try { await fs.unlink(f.path); } catch (_) {}
      }
    }
    next(err);
  }
});

router.get('/attendance-complaints/file/:filename', async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(attendanceComplaintUploadDir, filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found.' });
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- profile
async function loadProfile(userId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.email, u.enrollment_number, u.student_id, u.is_demo, u.created_at,
            p.course, p.academic_year, p.semester, p.student_group, p.mobile, p.dob, p.photo_path, p.updated_at
       FROM users u JOIN student_profiles p ON p.user_id = u.id
      WHERE u.id = ?`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    enrollmentNumber: r.enrollment_number,
    studentId: r.student_id,
    course: r.course,
    courseName: COURSES[r.course] ?? r.course,
    academicYear: r.academic_year,
    semester: r.semester,
    group: r.student_group,
    mobile: r.mobile,
    dob: r.dob,
    // Cache-busting version so a changed photo is fetched again.
    photoUrl: r.photo_path ? `/api/student/profile/photo?v=${new Date(r.updated_at).getTime()}` : null,
    isDemo: Boolean(r.is_demo),
    memberSince: r.created_at,
  };
}

router.get('/profile', async (req, res, next) => {
  try {
    const profile = await loadProfile(req.user.id);
    if (!profile) return res.status(404).json({ message: 'Student profile not found. Please contact the administration.' });
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.get('/incharge', async (req, res, next) => {
  try {
    const [[incharge]] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, ci.course, ci.semester, ci.student_group,
              ci.office_hours, ci.contact_number
         FROM class_incharges ci
         JOIN student_profiles p ON p.course = ci.course AND p.semester = ci.semester AND p.student_group = ci.student_group
         JOIN users u ON u.id = ci.faculty_user_id AND u.account_status = 'active'
        WHERE p.user_id = ?`,
      [req.user.id],
    );
    res.json({
      incharge: incharge
        ? {
            id: incharge.id,
            name: incharge.full_name,
            email: incharge.email,
            course: incharge.course,
            semester: incharge.semester,
            group: incharge.student_group,
            officeHours: incharge.office_hours ?? 'Monday – Friday, 10:00 AM – 4:00 PM',
            contactNumber: incharge.contact_number,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', async (req, res, next) => {
  const { data, errors } = validateFullProfileUpdate(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields', errors });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Update users table
    await conn.execute(
      'UPDATE users SET full_name = ?, email = ?, enrollment_number = ?, student_id = ? WHERE id = ?',
      [data.full_name, data.email, data.enrollment_number, data.student_id, req.user.id],
    );
    // Update student_profiles table
    await conn.execute(
      'UPDATE student_profiles SET mobile = ?, dob = ?, course = ?, academic_year = ?, semester = ?, student_group = ? WHERE user_id = ?',
      [data.mobile, data.dob, data.course, data.academic_year, data.semester, data.student_group, req.user.id],
    );
    await conn.commit();
    res.json({ message: 'Profile updated successfully', profile: await loadProfile(req.user.id) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') {
      const field = err.message.includes('email') ? 'email' :
                    err.message.includes('enrollment') ? 'enrollmentNumber' :
                    err.message.includes('student_id') ? 'studentId' : 'mobile';
      return res.status(409).json({
        message: `This ${field.replace('_', ' ')} is already registered to another account`,
        errors: { [field]: `This ${field.replace('_', ' ')} is already registered` },
      });
    }
    next(err);
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------- profile photo
const IMAGE_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];
const MIME_BY_EXT = Object.fromEntries(IMAGE_TYPES.map((t) => [t.ext, t.mime]));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
const photoLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { message: 'Too many uploads. Try again later.' } });

function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller' : 'Invalid upload';
      return res.status(400).json({ message });
    }
    next(err);
  });
}

async function removeAvatar(fileName) {
  if (!fileName) return;
  await fs.unlink(path.join(avatarDir, path.basename(fileName))).catch(() => {});
}

router.post('/profile/photo', photoLimiter, uploadPhoto, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a photo to upload' });
    // Trust the file's actual bytes, not the client-supplied name or MIME type.
    const type = IMAGE_TYPES.find((t) => t.test(req.file.buffer));
    if (!type) return res.status(400).json({ message: 'Photo must be a JPG, PNG or WebP image' });

    const fileName = `${req.user.id}-${crypto.randomBytes(12).toString('hex')}.${type.ext}`;
    await fs.writeFile(path.join(avatarDir, fileName), req.file.buffer);

    const [[old]] = await pool.execute('SELECT photo_path FROM student_profiles WHERE user_id = ?', [req.user.id]);
    await pool.execute('UPDATE student_profiles SET photo_path = ? WHERE user_id = ?', [fileName, req.user.id]);
    await removeAvatar(old?.photo_path);

    res.json({ message: 'Profile photo updated', profile: await loadProfile(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/profile/photo', async (req, res, next) => {
  try {
    const [[row]] = await pool.execute('SELECT photo_path FROM student_profiles WHERE user_id = ?', [req.user.id]);
    await pool.execute('UPDATE student_profiles SET photo_path = NULL WHERE user_id = ?', [req.user.id]);
    await removeAvatar(row?.photo_path);
    res.json({ message: 'Profile photo removed', profile: await loadProfile(req.user.id) });
  } catch (err) {
    next(err);
  }
});

// Served through the API (not a public static folder) so only the owner can fetch it.
router.get('/profile/photo', async (req, res, next) => {
  try {
    const [[row]] = await pool.execute('SELECT photo_path FROM student_profiles WHERE user_id = ?', [req.user.id]);
    if (!row?.photo_path) return res.status(404).json({ message: 'No profile photo' });
    const fileName = path.basename(row.photo_path);
    const ext = fileName.split('.').pop();
    res.set('Cache-Control', 'private, max-age=86400');
    res.type(MIME_BY_EXT[ext] ?? 'application/octet-stream');
    res.sendFile(path.join(avatarDir, fileName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'No profile photo' });
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- attendance
const STATUSES = ['present', 'late', 'absent', 'ongoing'];

router.get('/attendance', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
    const subject = typeof req.query.subject === 'string' && req.query.subject.length <= 100 ? req.query.subject : undefined;
    // Optional calendar date (YYYY-MM-DD, India time) used by the complaint form.
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : undefined;

    const result = await getHistory(pool, req.user.id, { status, subject, date, limit, offset: (page - 1) * limit });
    res.json({ ...result, page, limit, pages: Math.max(1, Math.ceil(result.total / limit)) });
  } catch (err) {
    next(err);
  }
});

router.get('/attendance/summary', async (req, res, next) => {
  try {
    const summary = await getSummary(pool, req.user.id);
    res.json({ ...summary, minimumPercentage: config.minAttendancePercent });
  } catch (err) {
    next(err);
  }
});

// Reference-style QR: pure black square modules on pure white, standard quiet zone
// (4 modules on every side) and generous 512px render for crisp scanning.
const qrOptions = { errorCorrectionLevel: 'M', margin: 4, width: 512, color: { dark: '#000000ff', light: '#ffffffff' } };

/**
 * Returns the student's identity QR (identification only — it cannot mark attendance) and,
 * only while an authorized session for their class is running, a signed attendance token QR
 * that expires after ATTENDANCE_TOKEN_TTL_SECONDS. Faculty scan it via POST /api/attendance/mark.
 */
router.get('/attendance/qr', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    // Identity QR encodes the student's enrollment number (a recognizable college-facing ID).
    // It is identification-only: actual attendance marking uses separate signed `SATT1.` tokens.
    const identityPayload = req.user.enrollment_number || req.user.student_id || String(req.user.id);
    const response = {
      identity: { payload: identityPayload, image: await QRCode.toDataURL(identityPayload, qrOptions) },
      session: null,
      attendance: null,
    };

    const session = await getOngoingSession(pool, req.user.id);
    if (session) {
      response.session = {
        id: session.id,
        subject: session.subject,
        room: session.room,
        faculty: session.faculty_name,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        alreadyMarked: Boolean(session.record_status),
        markedStatus: session.record_status,
        markedAt: session.marked_at,
      };
      if (!session.record_status) {
        const token = signAttendanceToken(req.user.id, session.id);
        const ttl = config.attendanceTokenTtlSeconds;
        response.attendance = {
          image: await QRCode.toDataURL(token, qrOptions),
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
          ttlSeconds: ttl,
        };
      }
    }
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export default router;

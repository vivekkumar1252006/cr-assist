export const CATEGORIES = {
  attendance_marked_absent: 'Attendance Marked Absent Incorrectly',
  qr_not_scanning: 'QR Code Not Scanning',
  attendance_not_recorded: 'Attendance Not Recorded',
  wrong_attendance_percentage: 'Wrong Attendance Percentage',
  login_problem: 'Login Problem',
  profile_update_issue: 'Profile Update Issue',
  technical_problem: 'Technical Problem',
  other: 'Other College Issue',
};

/** Categories that show the attendance section of the form. */
export const ATTENDANCE_CATEGORIES = [
  'attendance_marked_absent',
  'qr_not_scanning',
  'attendance_not_recorded',
  'wrong_attendance_percentage',
];
/** Categories that are about one specific class and may request a correction. */
export const SESSION_REQUIRED = ['attendance_marked_absent', 'attendance_not_recorded'];

export const PRIORITIES = ['low', 'medium', 'high'];
export const STATUSES = ['submitted', 'under_review', 'in_progress', 'resolved', 'rejected'];
export const OPEN_STATUSES = ['submitted', 'under_review', 'in_progress'];
export const CORRECTIONS = ['present', 'late'];

export const LIMITS = {
  title: [5, 150],
  summary: [10, 300],
  description: [30, 5000], // detailed description is optional — only the 5000 cap is enforced
  message: [2, 2000],
  reason: [5, 1000],
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const len = (field, value, errors, label) => {
  const [min, max] = LIMITS[field];
  if (value.length < min || value.length > max) errors[field] = `${label} must be ${min}–${max} characters`;
};

/**
 * Validates a new complaint. `type` is the complaint type the route resolved from the
 * complaint_types table ({ id, label, categoryKey, readsSession, sessionRequired }) —
 * the dropdown is database-backed, so the client's choice is never trusted on its own.
 * Never accepts student identity, status, assignment or the current attendance status
 * from the client — those are derived on the server.
 */
export function validateNewComplaint(body = {}, type = null) {
  const errors = {};
  const sessionRaw = body.attendanceSessionId;
  const description = str(body.description);
  const submittedSummary = str(body.summary).replace(/\s+/g, ' ');
  const title = str(body.title).replace(/\s+/g, ' ');
  const data = {
    title,
    category: type ? (type.categoryKey ?? 'other') : 'other',
    type_id: type?.id ?? null,
    // Falls back to the description, then to the title, so the summary column (NOT NULL)
    // always holds something useful even when the description is left empty.
    summary: submittedSummary || description.replace(/\s+/g, ' ').slice(0, LIMITS.summary[1]) || title.slice(0, LIMITS.summary[1]),
    description,
    priority: str(body.priority) || 'medium',
    attendance_date: str(body.attendanceDate) || null,
    attendance_session_id: sessionRaw === '' || sessionRaw == null ? null : Number(sessionRaw),
    requested_correction: str(body.requestedCorrection) || null,
  };

  len('title', data.title, errors, 'Title');
  if (submittedSummary) len('summary', data.summary, errors, 'Short description');
  // Detailed description is optional: only the 5000-character cap applies when given.
  if (description.length > LIMITS.description[1]) errors.description = `Detailed description must be ${LIMITS.description[1]} characters or fewer`;
  if (!type) errors.typeId = 'Select a complaint type';

  const readsSession = Boolean(type?.readsSession);
  const sessionRequired = Boolean(type?.sessionRequired) && readsSession;
  if (!readsSession) {
    // Ignore attendance fields for non-attendance types.
    data.attendance_date = null;
    data.attendance_session_id = null;
    data.requested_correction = null;
  } else {
    if (data.attendance_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.attendance_date)) errors.attendanceDate = 'Invalid date';
    if (data.attendance_session_id !== null && (!Number.isInteger(data.attendance_session_id) || data.attendance_session_id < 1)) {
      errors.attendanceSessionId = 'Invalid class session';
    }
    if (sessionRequired) {
      if (!data.attendance_date) errors.attendanceDate = 'Select the attendance date';
      if (data.attendance_session_id === null) errors.attendanceSessionId = 'Select the class session';
      if (!CORRECTIONS.includes(data.requested_correction)) errors.requestedCorrection = 'Select the correction you are requesting';
    } else {
      data.requested_correction = null;
    }
  }
  return { data, errors };
}

export function validateMessage(body = {}) {
  const message = str(body.message);
  const errors = {};
  len('message', message, errors, 'Message');
  return { message, errors: errors.message ? { message: errors.message } : {} };
}

export function validateReason(value, label = 'Reason') {
  const reason = str(value);
  const [min, max] = LIMITS.reason;
  return { reason, error: reason.length < min || reason.length > max ? `${label} must be ${min}–${max} characters` : null };
}

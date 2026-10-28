import { pool } from '../db.js';

/**
 * Complaint Type dropdown for the student complaint form — database-backed and
 * admin-managed (Add / Edit / Delete on /admin/complaints). Students read the list
 * from GET /api/complaints/types; the options are never hardcoded in the UI.
 * The seed mirrors server/src/utils/complaintValidation.js CATEGORIES — the four
 * attendance types show the attendance section of the form and two of them must
 * have date, class and requested correction. Custom admin-added types are plain.
 */

export const DEFAULT_TYPES = Object.freeze([
  { categoryKey: 'attendance_marked_absent', label: 'Attendance Marked Absent Incorrectly', readsSession: 1, sessionRequired: 1 },
  { categoryKey: 'qr_not_scanning', label: 'QR Code Not Scanning', readsSession: 1, sessionRequired: 0 },
  { categoryKey: 'attendance_not_recorded', label: 'Attendance Not Recorded', readsSession: 1, sessionRequired: 1 },
  { categoryKey: 'wrong_attendance_percentage', label: 'Wrong Attendance Percentage', readsSession: 1, sessionRequired: 0 },
  { categoryKey: 'login_problem', label: 'Login Problem', readsSession: 0, sessionRequired: 0 },
  { categoryKey: 'profile_update_issue', label: 'Profile Update Issue', readsSession: 0, sessionRequired: 0 },
  { categoryKey: 'technical_problem', label: 'Technical Problem', readsSession: 0, sessionRequired: 0 },
  { categoryKey: 'other', label: 'Other College Issue', readsSession: 0, sessionRequired: 0 },
]);

/** Inserts the eight defaults when the table is empty (safe re-run via unique category key). */
export async function ensureComplaintTypesSeeded() {
  const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM complaint_types');
  if (total > 0) return;
  const values = DEFAULT_TYPES.map((t, index) => [t.categoryKey, t.label, t.readsSession, t.sessionRequired, index + 1]);
  await pool.query(
    'INSERT IGNORE INTO complaint_types (category_key, label, reads_session, session_required, position) VALUES ?',
    [values],
  );
}

function shapeType(row) {
  return {
    id: row.id,
    label: row.label,
    categoryKey: row.category_key ?? null,
    readsSession: row.reads_session === 1,
    sessionRequired: row.session_required === 1,
  };
}

/** Ordered list for dropdowns: [{ id, label, categoryKey, readsSession, sessionRequired }]. */
export async function listComplaintTypes() {
  const [rows] = await pool.execute(
    'SELECT id, label, category_key, reads_session, session_required FROM complaint_types ORDER BY position, id',
  );
  return rows.map(shapeType);
}

/** A single type for validation, or null. */
export async function getComplaintTypeById(id) {
  if (!Number.isInteger(id) || id < 1) return null;
  const [[row]] = await pool.execute(
    'SELECT id, label, category_key, reads_session, session_required FROM complaint_types WHERE id = ?',
    [id],
  );
  return row ? shapeType(row) : null;
}

/** Legacy deep-links post a bare category (`?category=attendance_marked_absent`). */
export async function getComplaintTypeByKey(categoryKey) {
  if (typeof categoryKey !== 'string' || !categoryKey) return null;
  const [[row]] = await pool.execute(
    'SELECT id, label, category_key, reads_session, session_required FROM complaint_types WHERE category_key = ?',
    [categoryKey],
  );
  return row ? shapeType(row) : null;
}

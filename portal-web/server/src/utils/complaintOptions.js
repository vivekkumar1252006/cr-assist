import { pool } from '../db.js';

/**
 * Lecture Time / Lecture Number dropdown options for the attendance complaint form.
 * Admins manage them (add / edit / delete) from the admin complaints page; students
 * read them from GET /api/student/complaint-options. Complaint validation also
 * checks submitted values against this list.
 */
export const OPTION_TYPES = Object.freeze({
  lectureTime: 'lecture_time',
  lectureNumber: 'lecture_number',
});

export const DEFAULT_LECTURE_TIMES = Object.freeze([
  '09:00 AM – 10:00 AM',
  '10:00 AM – 11:00 AM',
  '11:00 AM – 12:00 PM',
  '12:00 PM – 1:00 PM',
  '01:30 PM – 02:30 PM',
  '02:30 PM – 03:30 PM',
  '03:30 PM – 04:30 PM',
]);

// Stored as "n/7"; the forms render it as "Lecture n/7".
export const DEFAULT_LECTURE_NUMBERS = Object.freeze(['1/7', '2/7', '3/7', '4/7', '5/7', '6/7', '7/7']);

const DEFAULTS = {
  [OPTION_TYPES.lectureTime]: DEFAULT_LECTURE_TIMES,
  [OPTION_TYPES.lectureNumber]: DEFAULT_LECTURE_NUMBERS,
};

/** Inserts the built-in defaults for any list the admin has emptied. */
export async function ensureComplaintOptionsSeeded() {
  const [counts] = await pool.execute(
    'SELECT option_type, COUNT(*) AS total FROM complaint_options GROUP BY option_type',
  );
  const present = new Set(counts.filter((row) => row.total > 0).map((row) => row.option_type));
  for (const type of Object.keys(DEFAULTS)) {
    if (present.has(type)) continue;
    const values = DEFAULTS[type].map((label, index) => [type, label, index + 1]);
    await pool.query('INSERT IGNORE INTO complaint_options (option_type, label, position) VALUES ?', [values]);
  }
}

/** Both lists ordered for display: { lectureTimes: [{id, label}], lectureNumbers: [{id, label}] }. */
export async function listComplaintOptions() {
  const [rows] = await pool.execute(
    'SELECT id, option_type, label FROM complaint_options ORDER BY option_type, position, id',
  );
  const lectureTimes = [];
  const lectureNumbers = [];
  for (const row of rows) {
    const option = { id: row.id, label: row.label };
    if (row.option_type === OPTION_TYPES.lectureTime) lectureTimes.push(option);
    else lectureNumbers.push(option);
  }
  return { lectureTimes, lectureNumbers };
}

/** Same as listComplaintOptions but plain label arrays (what forms and validation need). */
export async function listComplaintOptionLabels() {
  const { lectureTimes, lectureNumbers } = await listComplaintOptions();
  return {
    lectureTimes: lectureTimes.map((option) => option.label),
    lectureNumbers: lectureNumbers.map((option) => option.label),
  };
}

/** True when `label` exists as an option of `option_type` (falls back to the defaults). */
export async function isComplaintOption(optionType, label) {
  try {
    const [rows] = await pool.execute(
      'SELECT 1 AS ok FROM complaint_options WHERE option_type = ? AND label = ? LIMIT 1',
      [optionType, label],
    );
    if (rows.length) return true;
  } catch (_) {
    // Table may not exist yet on a fresh database; fall through to defaults.
  }
  return (DEFAULTS[optionType] || []).includes(label);
}

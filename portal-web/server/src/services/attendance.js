// Attendance queries scoped to a single student. Every function takes the student's users.id
// and only ever reads sessions for that student's own cohort and their own records.

// A session belongs to the student's cohort when course + semester match and it is either
// for the whole class (student_group IS NULL) or for the student's group.
const COHORT_JOIN = `
  JOIN student_profiles p ON p.user_id = ?
  JOIN attendance_sessions s
    ON s.course = p.course AND s.semester = p.semester
   AND (s.student_group IS NULL OR s.student_group = p.student_group)
   AND s.status <> 'cancelled'`;

// "Held" = the class has finished (closed, or active past its end time).
const HELD = `(s.status = 'closed' OR (s.status = 'active' AND s.ends_at <= UTC_TIMESTAMP()))`;
const ONGOING = `(s.status = 'active' AND UTC_TIMESTAMP() BETWEEN s.starts_at AND s.ends_at)`;

const EFFECTIVE_STATUS = `
  CASE
    WHEN r.status IN ('present', 'late') THEN r.status
    WHEN ${HELD} THEN 'absent'
    ELSE 'ongoing'
  END`;

const FROM_STUDENT = `
  FROM (SELECT 1) AS one
  ${COHORT_JOIN}
  LEFT JOIN attendance_records r ON r.session_id = s.id AND r.student_id = ?
  LEFT JOIN users f ON f.id = s.faculty_id`;

const VISIBLE = `(${HELD} OR ${ONGOING})`;

function toItem(row) {
  return {
    sessionId: row.id,
    subject: row.subject,
    room: row.room,
    faculty: row.faculty_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.effective_status,
    markedAt: row.marked_at,
    method: row.method,
  };
}

const ITEM_COLUMNS = `s.id, s.subject, s.room, s.starts_at, s.ends_at, COALESCE(f.full_name, s.faculty_name) AS faculty_name,
  r.marked_at, r.method, ${EFFECTIVE_STATUS} AS effective_status`;

// Calendar dates are interpreted in India Standard Time (the college's local time).
const LOCAL_DATE = `DATE(CONVERT_TZ(s.starts_at, '+00:00', '+05:30'))`;

export async function getHistory(db, userId, { status, subject, date, limit, offset }) {
  const where = [VISIBLE];
  const params = [userId, userId];
  if (date) {
    where.push(`${LOCAL_DATE} = ?`);
    params.push(date);
  }
  if (status) {
    where.push(`${EFFECTIVE_STATUS} = ?`);
    params.push(status);
  }
  if (subject) {
    where.push('s.subject = ?');
    params.push(subject);
  }
  const whereSql = where.join(' AND ');

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${FROM_STUDENT} WHERE ${whereSql}`, params);
  const [rows] = await db.query(
    `SELECT ${ITEM_COLUMNS} ${FROM_STUDENT} WHERE ${whereSql}
      ORDER BY s.starts_at DESC, s.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [subjects] = await db.query(
    `SELECT DISTINCT s.subject ${FROM_STUDENT} WHERE ${VISIBLE} ORDER BY s.subject`,
    [userId, userId],
  );
  return { items: rows.map(toItem), total, subjects: subjects.map((r) => r.subject) };
}

export async function getSummary(db, userId) {
  const [[totals]] = await db.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(r.status = 'present'), 0) AS present,
            COALESCE(SUM(r.status = 'late'), 0) AS late
       ${FROM_STUDENT} WHERE ${HELD}`,
    [userId, userId],
  );
  const [bySubject] = await db.query(
    `SELECT s.subject, COUNT(*) AS total, COALESCE(SUM(r.status IN ('present', 'late')), 0) AS attended
       ${FROM_STUDENT} WHERE ${HELD}
      GROUP BY s.subject ORDER BY s.subject`,
    [userId, userId],
  );
  const [recent] = await db.query(
    `SELECT ${ITEM_COLUMNS} ${FROM_STUDENT} WHERE ${VISIBLE}
      ORDER BY s.starts_at DESC, s.id DESC LIMIT 6`,
    [userId, userId],
  );

  const total = Number(totals.total);
  const present = Number(totals.present);
  const late = Number(totals.late);
  const attended = present + late;
  const pct = (a, t) => (t ? Math.round((a / t) * 1000) / 10 : null);
  return {
    totalClasses: total,
    presentClasses: attended, // late arrivals count as present
    lateClasses: late,
    absentClasses: total - attended,
    percentage: pct(attended, total),
    bySubject: bySubject.map((r) => ({
      subject: r.subject,
      total: Number(r.total),
      attended: Number(r.attended),
      percentage: pct(Number(r.attended), Number(r.total)),
    })),
    recent: recent.map(toItem),
  };
}

/** The session currently running for the student's cohort, plus their record for it (if any). */
export async function getOngoingSession(db, userId) {
  const [rows] = await db.query(
    `SELECT s.id, s.subject, s.room, s.starts_at, s.ends_at, COALESCE(f.full_name, s.faculty_name) AS faculty_name,
            r.status AS record_status, r.marked_at
       ${FROM_STUDENT} WHERE ${ONGOING}
      ORDER BY s.starts_at DESC LIMIT 1`,
    [userId, userId],
  );
  return rows[0] ?? null;
}

/**
 * One of the student's own sessions with their current status, or null if the session
 * doesn't exist / isn't in their cohort. status: present | late | absent | ongoing, where
 * a held class without a record is 'absent' (rawRecord tells whether a row exists).
 */
export async function getStudentSession(db, userId, sessionId) {
  const [rows] = await db.query(
    `SELECT ${ITEM_COLUMNS}, r.status AS raw_status, ${LOCAL_DATE} AS local_date, ${HELD} AS held
       ${FROM_STUDENT} WHERE s.id = ?`,
    [userId, userId, sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...toItem(row), rawRecord: row.raw_status ?? null, localDate: row.local_date, held: Boolean(row.held) };
}

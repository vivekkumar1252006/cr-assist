/**
 * Free-text "Class / Branch" support for the admin attendance form.
 *
 * The form used to be a dropdown of cohorts that already have students
 * (`GET /admin/classes`). It is now a text input, so the typed label has to be
 * mapped back onto the `attendance_sessions` columns the scanner and the
 * reports rely on: `course`, `semester` and `student_group`.
 *
 * The typed text itself is stored verbatim in `attendance_sessions.class_branch`
 * (see the ensureClassBranchColumn helper in routes/admin.js), so admins always
 * see exactly what they entered while the cohort columns stay usable.
 *
 * Examples that resolve:
 *   "IT · Semester 3 · Group B"  -> IT / 3 / B   (existing cohort)
 *   "IT Sem 3 B"                 -> IT / 3 / B
 *   "cse"                        -> CSE / 3 / B   (only one CSE cohort)
 *   "AI & ML 5 A"                -> AI & ML / 5 / A
 *   "BBA"                        -> BBA / 1 / null (no students registered)
 */

const SEPARATOR = /[·|,;]+/;
const COURSE_MAX = 20;
const LABEL_MAX = 100;

export const normalizeClassText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const labelsFor = (item) => {
  const group = item.student_group ? ` · Group ${item.student_group}` : '';
  return [
    `${item.course} · Semester ${item.semester}${group}`,
    `${item.course} · Sem ${item.semester}${group}`,
    `${item.course} Sem ${item.semester}${group}`,
    `${item.course} Semester ${item.semester}${group}`,
  ];
};

const cohort = (item) => ({
  course: String(item.course),
  semester: Number(item.semester),
  studentGroup: item.student_group || null,
});

/**
 * @param {string} value  what the admin typed
 * @param {Array<{course: string, semester: number|string, student_group?: string|null}>} cohorts
 * @returns {{course: string, semester: number, studentGroup: string|null} | {error: string}}
 */
export function resolveClassBranch(value, cohorts = []) {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, LABEL_MAX);
  if (!raw) return { error: 'Enter the class / branch.' };

  const target = normalizeClassText(raw);

  // 1. Exactly a label the admin picked from the old dropdown.
  for (const item of cohorts) {
    if (labelsFor(item).some((label) => normalizeClassText(label) === target)) {
      return cohort(item);
    }
  }

  // 2. Exactly a course code that maps to a single cohort.
  const byCourse = cohorts.filter((item) => normalizeClassText(item.course) === target);
  if (byCourse.length === 1) return cohort(byCourse[0]);

  // 3. "Semester 3" / "3rd sem" / "Group B" written out.
  const semMatch =
    raw.match(/\bsem(?:ester)?\.?\s*[-:#]?\s*([1-8])\b/i) ||
    raw.match(/\b([1-8])\s*(?:st|nd|rd|th)?\s*sem(?:ester)?\b/i);
  const groupMatch = raw.match(/\bgroup\s*[-:#]?\s*([ab])\b/i);

  // 4. Compact "AI & ML 5 A" / "CSE 3" style. A group letter is always
  //    trusted; a bare trailing number only when the course is already known.
  const compact = raw.match(/^(.+?)[\s·|,;/-]+([1-8])(?:[\s·|,;/-]+([ab]))?$/i);
  const knownCompact =
    compact &&
    (compact[3] ||
      cohorts.some((item) => normalizeClassText(item.course) === normalizeClassText(compact[1])));

  let course;
  let semester;
  let studentGroup;

  if (semMatch || groupMatch || knownCompact) {
    course = raw
      .split(SEPARATOR)[0]
      .trim()
      .replace(/\bsem(?:ester)?\.?\s*\d+\b.*$/i, '')
      .replace(/\b\d+\s*(?:st|nd|rd|th)?\s*sem(?:ester)?\b.*$/i, '')
      .replace(/\bgroup\s*[ab]\b.*$/i, '')
      .replace(/[-–—:#]+$/, '')
      .trim();
    semester = semMatch ? Number(semMatch[1]) : knownCompact ? Number(compact[2]) : null;
    studentGroup = groupMatch
      ? groupMatch[1].toUpperCase()
      : knownCompact && compact[3]
        ? compact[3].toUpperCase()
        : null;
    if (knownCompact && !course) course = compact[1].trim();
  } else {
    course = raw.split(SEPARATOR)[0].trim();
    semester = null;
    studentGroup = null;
  }

  if (!course) course = raw;

  // 5. A bare course name: use the semester when every cohort agrees on one.
  if (semester == null) {
    const matching = cohorts.filter(
      (item) => normalizeClassText(item.course) === normalizeClassText(course),
    );
    const semesters = [...new Set(matching.map((item) => Number(item.semester)))];
    if (semesters.length === 1) semester = semesters[0];
  }

  // 6. A trailing group letter, e.g. "IT · Semester 3 · B".
  if (!studentGroup) {
    const trailingGroup = raw.match(/[·|,;]\s*([ab])\s*$/i);
    if (trailingGroup) studentGroup = trailingGroup[1].toUpperCase();
  }

  return {
    course: course.slice(0, COURSE_MAX),
    // attendance_sessions.semester is NOT NULL; a custom class without a
    // semester is still recorded, with the label kept in class_branch.
    semester: semester || 1,
    studentGroup,
  };
}

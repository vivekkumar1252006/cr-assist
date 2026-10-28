export const ACADEMIC_YEARS = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'];
export const GROUPS = ['A', 'B'];
export const ACCOUNT_STATUSES = ['pending', 'active', 'suspended', 'rejected'];
export const COURSES = {
  CSE: 'Computer Science & Engineering',
  IT: 'Information Technology',
  AIML: 'CSE (AI & Machine Learning)',
  ECE: 'Electronics & Communication Engineering',
  EE: 'Electrical Engineering',
  ME: 'Mechanical Engineering',
  CE: 'Civil Engineering',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ENROLLMENT_RE = /^[0-9]{4}[A-Z]{2,4}[0-9]{5,7}$/; // e.g. 0111CS251275
const STUDENT_ID_RE = /^[0-9]{2}-[0-9]{2}STU[0-9]{4,6}$/; // e.g. 25-26STU11806
const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,99}$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export const isEmail = (v) => EMAIL_RE.test(v);

export function normalizeMobile(value) {
  let m = str(value).replace(/[\s-]/g, '');
  if (m.startsWith('+91')) m = m.slice(3);
  else if (m.length === 12 && m.startsWith('91')) m = m.slice(2);
  return m;
}

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  // bcrypt only uses the first 72 bytes; reject longer input instead of silently truncating.
  if (Buffer.byteLength(password) > 72) return 'Password must be at most 72 bytes';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase letters and a number';
  }
  return null;
}

function ageOn(dob, now = new Date()) {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function checkDob(value) {
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!dob || Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== value) {
    return 'Enter a valid date of birth';
  }
  const age = ageOn(dob);
  if (age < 15 || age > 70) return 'Age must be between 15 and 70 years';
  return null;
}

const MOBILE_RE = /^[6-9][0-9]{9}$/;

/** Validates and normalizes a registration payload. Returns { data, errors }. */
export function validateRegistration(body = {}) {
  const errors = {};
  const data = {
    full_name: str(body.fullName).replace(/\s+/g, ' '),
    enrollment_number: str(body.enrollmentNumber).toUpperCase(),
    student_id: str(body.studentId).toUpperCase(),
    mobile: normalizeMobile(body.mobile),
    email: str(body.email).toLowerCase(),
    dob: str(body.dob),
    course: str(body.course).toUpperCase(),
    academic_year: str(body.academicYear),
    semester: Number(body.semester),
    student_group: str(body.group).toUpperCase(),
  };

  if (!NAME_RE.test(data.full_name)) errors.fullName = 'Enter your full name (letters only)';
  if (!ENROLLMENT_RE.test(data.enrollment_number)) errors.enrollmentNumber = 'Invalid enrollment number (e.g. 0111CS251275)';
  if (!STUDENT_ID_RE.test(data.student_id)) errors.studentId = 'Invalid student ID (e.g. 25-26STU11806)';
  if (!MOBILE_RE.test(data.mobile)) errors.mobile = 'Enter a valid 10-digit mobile number';
  if (!EMAIL_RE.test(data.email) || data.email.length > 191) errors.email = 'Enter a valid email address';
  const dobError = checkDob(data.dob);
  if (dobError) errors.dob = dobError;

  const pwError = checkPassword(body.password);
  if (pwError) errors.password = pwError;
  if (body.password !== body.confirmPassword) errors.confirmPassword = 'Passwords do not match';

  if (!Object.hasOwn(COURSES, data.course)) errors.course = 'Select your course / branch';
  const yearIdx = ACADEMIC_YEARS.indexOf(data.academic_year);
  if (yearIdx === -1) errors.academicYear = 'Select your academic year';
  if (!Number.isInteger(data.semester) || data.semester < 1 || data.semester > 8) {
    errors.semester = 'Select your semester';
  } else if (yearIdx !== -1 && Math.ceil(data.semester / 2) !== yearIdx + 1) {
    errors.semester = `Semester ${data.semester} does not belong to ${data.academic_year}`;
  }
  if (!GROUPS.includes(data.student_group)) errors.group = 'Select Group A or Group B';
  if (body.acceptTerms !== true) errors.acceptTerms = 'You must accept the Terms and Privacy Policy';

  return { data, errors };
}

/**
 * Validates the fields a student may edit on their own profile. Identity and academic
 * fields (email, enrollment number, student ID, course, year, semester, group) are managed
 * by the college and are intentionally not editable by students.
 */
export function validateProfileUpdate(body = {}) {
  const errors = {};
  const data = {
    full_name: str(body.fullName).replace(/\s+/g, ' '),
    mobile: normalizeMobile(body.mobile),
    dob: str(body.dob),
  };
  if (!NAME_RE.test(data.full_name)) errors.fullName = 'Enter your full name (letters only)';
  if (!MOBILE_RE.test(data.mobile)) errors.mobile = 'Enter a valid 10-digit mobile number';
  const dobError = checkDob(data.dob);
  if (dobError) errors.dob = dobError;
  return { data, errors };
}

/**
 * Validates all profile fields including academic/identity fields (for admin or self-edit with all fields).
 * Use this when you want to allow editing ALL profile fields.
 */
export function validateFullProfileUpdate(body = {}) {
  const errors = {};
  const data = {
    full_name: str(body.fullName).replace(/\s+/g, ' '),
    email: str(body.email).toLowerCase(),
    enrollment_number: str(body.enrollmentNumber).toUpperCase(),
    student_id: str(body.studentId).toUpperCase(),
    mobile: normalizeMobile(body.mobile),
    dob: str(body.dob),
    course: str(body.course).toUpperCase(),
    academic_year: str(body.academicYear),
    semester: Number(body.semester),
    student_group: str(body.group).toUpperCase(),
  };
  if (!NAME_RE.test(data.full_name)) errors.fullName = 'Enter your full name (letters only)';
  if (!EMAIL_RE.test(data.email) || data.email.length > 191) errors.email = 'Enter a valid email address';
  if (!ENROLLMENT_RE.test(data.enrollment_number)) errors.enrollmentNumber = 'Invalid enrollment number (e.g. 0111CS251275)';
  if (!STUDENT_ID_RE.test(data.student_id)) errors.studentId = 'Invalid student ID (e.g. 25-26STU11806)';
  if (!MOBILE_RE.test(data.mobile)) errors.mobile = 'Enter a valid 10-digit mobile number';
  const dobError = checkDob(data.dob);
  if (dobError) errors.dob = dobError;
  if (!Object.hasOwn(COURSES, data.course)) errors.course = 'Select your course / branch';
  const yearIdx = ACADEMIC_YEARS.indexOf(data.academic_year);
  if (yearIdx === -1) errors.academicYear = 'Select your academic year';
  if (!Number.isInteger(data.semester) || data.semester < 1 || data.semester > 8) {
    errors.semester = 'Select your semester';
  } else if (yearIdx !== -1 && Math.ceil(data.semester / 2) !== yearIdx + 1) {
    errors.semester = `Semester ${data.semester} does not belong to ${data.academic_year}`;
  }
  if (!GROUPS.includes(data.student_group)) errors.group = 'Select Group A or Group B';
  return { data, errors };
}

/**
 * Validates an admin's edit of an existing student.
 *
 * Stricter than the legacy PUT handler (which trusted every field): identity and
 * academic fields are re-checked so the directory stays searchable/unique. Unlike
 * registration, mobile, date of birth and password are optional — leaving them
 * blank clears them / keeps the current password instead of failing validation.
 */
export function validateAdminStudentUpdate(body = {}) {
  const errors = {};
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  const mobileRaw = normalizeMobile(body.mobile);
  const dob = str(body.dob);

  const data = {
    full_name: str(body.fullName).replace(/\s+/g, ' '),
    email: str(body.email).toLowerCase(),
    enrollment_number: str(body.enrollmentNumber).toUpperCase(),
    student_id: str(body.studentId).toUpperCase(),
    mobile: mobileRaw || null,
    dob: dob || null,
    course: str(body.course).toUpperCase(),
    academic_year: str(body.academicYear),
    semester: Number(body.semester),
    student_group: str(body.group ?? body.studentGroup).toUpperCase(),
    account_status: str(body.accountStatus),
    password,
  };

  if (!NAME_RE.test(data.full_name)) errors.fullName = 'Enter the full name (letters only)';
  if (!EMAIL_RE.test(data.email) || data.email.length > 191) errors.email = 'Enter a valid email address';
  if (!ENROLLMENT_RE.test(data.enrollment_number)) errors.enrollmentNumber = 'Invalid enrollment number (e.g. 0111CS251275)';
  if (!STUDENT_ID_RE.test(data.student_id)) errors.studentId = 'Invalid student ID (e.g. 25-26STU11806)';
  if (data.mobile && !MOBILE_RE.test(data.mobile)) errors.mobile = 'Enter a valid 10-digit mobile number';
  if (data.dob) {
    const dobError = checkDob(data.dob);
    if (dobError) errors.dob = dobError;
  }

  if (!Object.hasOwn(COURSES, data.course)) errors.course = 'Select your course / branch';
  const yearIdx = ACADEMIC_YEARS.indexOf(data.academic_year);
  if (yearIdx === -1) errors.academicYear = 'Select your academic year';
  if (!Number.isInteger(data.semester) || data.semester < 1 || data.semester > 8) {
    errors.semester = 'Select your semester';
  } else if (yearIdx !== -1 && Math.ceil(data.semester / 2) !== yearIdx + 1) {
    errors.semester = `Semester ${data.semester} does not belong to ${data.academic_year}`;
  }
  if (!GROUPS.includes(data.student_group)) errors.group = 'Select Group A or Group B';
  if (!ACCOUNT_STATUSES.includes(data.account_status)) errors.accountStatus = 'Invalid account status';

  // Optional: blank keeps the current password.
  if (password) {
    const pwError = checkPassword(password);
    if (pwError) errors.password = pwError;
  }

  return { data, errors };
}

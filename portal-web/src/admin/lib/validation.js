// Client-side mirror of server/src/utils/validation.js — the server remains the source of truth.
export const ACADEMIC_YEARS = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'];
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
const ENROLLMENT_RE = /^[0-9]{4}[A-Z]{2,4}[0-9]{5,7}$/;
const STUDENT_ID_RE = /^[0-9]{2}-[0-9]{2}STU[0-9]{4,6}$/;
const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,99}$/;

export const isEmail = (v) => EMAIL_RE.test(v.trim());

export function semestersFor(academicYear) {
  const idx = ACADEMIC_YEARS.indexOf(academicYear);
  return idx === -1 ? [] : [idx * 2 + 1, idx * 2 + 2];
}

export function passwordError(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (new TextEncoder().encode(password).length > 72) return 'Password must be at most 72 bytes';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase letters and a number';
  }
  return null;
}

/** Returns { score: 0-4, label } for the strength meter. */
export function passwordStrength(password) {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  score = Math.min(4, Math.max(1, score - 1));
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

function age(dob) {
  const d = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export function validateRegistration(f) {
  const e = {};
  const mobile = f.mobile.replace(/[\s-]/g, '').replace(/^\+91/, '');

  if (!NAME_RE.test(f.fullName.trim())) e.fullName = 'Enter your full name (letters only)';
  if (!ENROLLMENT_RE.test(f.enrollmentNumber.trim().toUpperCase())) e.enrollmentNumber = 'Invalid enrollment number (e.g. 0111CS251275)';
  if (!STUDENT_ID_RE.test(f.studentId.trim().toUpperCase())) e.studentId = 'Invalid student ID (e.g. 25-26STU11806)';
  if (!/^[6-9][0-9]{9}$/.test(mobile)) e.mobile = 'Enter a valid 10-digit mobile number';
  if (!isEmail(f.email)) e.email = 'Enter a valid email address';
  if (!f.dob) e.dob = 'Enter your date of birth';
  else if (Number.isNaN(age(f.dob)) || age(f.dob) < 15 || age(f.dob) > 70) e.dob = 'Age must be between 15 and 70 years';
  const pw = passwordError(f.password);
  if (pw) e.password = pw;
  if (!f.confirmPassword) e.confirmPassword = 'Confirm your password';
  else if (f.password !== f.confirmPassword) e.confirmPassword = 'Passwords do not match';
  if (!Object.hasOwn(COURSES, f.course)) e.course = 'Select your course / branch';
  if (!ACADEMIC_YEARS.includes(f.academicYear)) e.academicYear = 'Select your academic year';
  if (!semestersFor(f.academicYear).includes(Number(f.semester))) e.semester = 'Select your semester';
  if (!['A', 'B'].includes(f.group)) e.group = 'Select your group';
  if (!f.acceptTerms) e.acceptTerms = 'You must accept the Terms and Privacy Policy';
  return e;
}

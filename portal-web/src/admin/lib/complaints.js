// Mirrors server/src/utils/complaintValidation.js — the server remains the source of truth.
export const CATEGORIES = [
  { value: 'attendance_marked_absent', label: 'Attendance Marked Absent Incorrectly' },
  { value: 'qr_not_scanning', label: 'QR Code Not Scanning' },
  { value: 'attendance_not_recorded', label: 'Attendance Not Recorded' },
  { value: 'wrong_attendance_percentage', label: 'Wrong Attendance Percentage' },
  { value: 'login_problem', label: 'Login Problem' },
  { value: 'profile_update_issue', label: 'Profile Update Issue' },
  { value: 'technical_problem', label: 'Technical Problem' },
  { value: 'other', label: 'Other College Issue' },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export const ATTENDANCE_CATEGORIES = [
  'attendance_marked_absent',
  'qr_not_scanning',
  'attendance_not_recorded',
  'wrong_attendance_percentage',
];
export const SESSION_REQUIRED = ['attendance_marked_absent', 'attendance_not_recorded'];

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]));

export const ATTENDANCE_STATUS_LABEL = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  not_recorded: 'Not recorded',
  ongoing: 'Ongoing',
};

export const LIMITS = {
  title: [5, 150],
  summary: [10, 300],
  description: [30, 5000],
  message: [2, 2000],
  reason: [5, 1000],
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 10;
export const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};
export const ACCEPT_ATTR = Object.entries(ACCEPTED_TYPES)
  .flatMap(([mime, exts]) => [mime, ...exts])
  .join(',');

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns an error message, or null if the file is acceptable. */
export function checkFile(file, maxBytes = MAX_FILE_BYTES) {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  const typeOk = ACCEPTED_TYPES[file.type]?.includes(ext) || Object.values(ACCEPTED_TYPES).some((e) => e.includes(ext) && !file.type);
  if (!typeOk) return `${file.name}: unsupported format. Use JPEG, PNG, WebP or PDF.`;
  if (file.size > maxBytes) return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(maxBytes)} per file.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

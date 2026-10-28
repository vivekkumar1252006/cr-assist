// Identify uploads by their actual bytes (magic numbers), never by the client-supplied
// filename or MIME type.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const FILE_TYPES = {
  jpg: { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(PNG_SIG) },
  webp: { mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  pdf: { mime: 'application/pdf', test: (b) => b.length > 5 && b.toString('ascii', 0, 5) === '%PDF-' },
};

/** Returns { ext, mime } for an allowed file type, or null. */
export function detectFileType(buffer, allowed = Object.keys(FILE_TYPES)) {
  for (const ext of allowed) {
    if (FILE_TYPES[ext].test(buffer)) return { ext, mime: FILE_TYPES[ext].mime };
  }
  return null;
}

/** Keeps a display-safe original filename (no paths/control chars, bounded length). */
export function cleanFilename(name) {
  const base = String(name ?? 'file').split(/[\\/]/).pop();
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1f\x7f"<>]/g, '').trim();
  return (cleaned || 'file').slice(0, 200);
}

/** Reduces a value to a download-safe slug: letters, digits, dot, dash, underscore. */
export function safeFilenamePart(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
}

/**
 * Builds the download name shown in the browser's save dialog:
 * "Student_Name_Enrollment_Original_File.ext". The original extension is kept and
 * every unsafe character is replaced, so the header is always safe to send.
 * Falls back to the original filename when student details are unavailable.
 */
export function downloadFilename(student, originalFilename) {
  const clean = cleanFilename(originalFilename);
  const dot = clean.lastIndexOf('.');
  const rawBase = dot > 0 ? clean.slice(0, dot) : clean;
  const rawExt = dot > 0 ? clean.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) : '';
  const base = safeFilenamePart(rawBase) || 'file';
  const prefix = [safeFilenamePart(student?.fullName ?? student?.full_name), safeFilenamePart(student?.enrollmentNumber ?? student?.enrollment_number)]
    .filter(Boolean)
    .join('_');
  return `${prefix ? `${prefix}_` : ''}${base}${rawExt ? `.${rawExt}` : ''}`;
}

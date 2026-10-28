// End-to-end test of auth, student, QR attendance and the complaint module against a
// RUNNING API and the real MySQL database. Local development only.
//
//   1. npm run db:init         (schema + migrations)
//   2. npm run setup:accounts  (admin + demo student logins)
//   3. npm run dev             (or: npm start --prefix server)
//   4. npm run test:e2e        (API_URL defaults to http://localhost:5000)
//
// The suite creates its own class, incharge, admin and students (emails ending in
// @e2e.test) and removes them at the end, so it does not depend on demo seed data.
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

if (config.isProd) {
  console.error('Refusing to run e2e tests with NODE_ENV=production.');
  process.exit(1);
}

const API = (process.env.API_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'E2e-Test-Pass1';
let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
  }
}
const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

/** Minimal cookie-aware API client. */
function client() {
  let cookie = '';
  return async function call(method, path, body, { raw = false } = {}) {
    const headers = { ...(cookie && { Cookie: cookie }) };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: payload });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [pair] = c.split(';');
      cookie = pair.endsWith('=') ? '' : pair;
    }
    if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body: json ?? text };
  };
}

// Tiny valid files (real signatures).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const fileForm = (buf, name, type) => {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  return fd;
};

const created = { users: [], sessions: [] };

async function createUser({ role, email, name, enrollment, studentId, course = 'CSE', semester = 3, group = 'A' }) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const [r] = await pool.execute(
    `INSERT INTO users (full_name, email, enrollment_number, student_id, password_hash, role, account_status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [name, email, enrollment ?? null, studentId ?? null, hash, role],
  );
  created.users.push(r.insertId);
  if (role === 'student') {
    await pool.execute(
      `INSERT INTO student_profiles (user_id, course, academic_year, semester, student_group, mobile)
       VALUES (?, ?, 'Second Year', ?, ?, ?)`,
      [r.insertId, course, semester, group, `9${String(Date.now()).slice(-8)}${created.users.length}`],
    );
  }
  return r.insertId;
}

async function login(identifier, password = PASSWORD) {
  const api = client();
  const res = await api('POST', '/api/auth/login', { identifier, password });
  return { api, res };
}

async function main() {
  console.log(`SmartAttend e2e — API ${API} — run ${RUN}`);
  const health = await client()('GET', '/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`API not reachable or DB down at ${API}/api/health. Start the server first.`);
    process.exit(1);
  }

  // ------------------------------------------------------------------ setup
  // The suite builds its own class, incharge, admin and students, so it runs against any
  // database without depending on demo seed data.
  const COHORT = { course: 'E2E', semester: 1, group: 'A' };
  const emailA = `a.${RUN}@e2e.test`;
  const enrollmentA = `0111${String(parseInt(RUN, 16)).padStart(9, '0')}`;
  const studentIdA = `26-27STU9${String(parseInt(RUN, 16) % 100000).padStart(5, '0')}`;

  const admin = { email: `admin.${RUN}@e2e.test` };
  admin.id = await createUser({ role: 'admin', email: admin.email, name: 'E2E Admin' });
  const incharge = { email: `incharge.${RUN}@e2e.test` };
  incharge.id = await createUser({ role: 'faculty', email: incharge.email, name: 'E2E Class Incharge' });

  await pool.execute(
    `INSERT INTO class_incharges (faculty_user_id, course, semester, student_group)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE faculty_user_id = VALUES(faculty_user_id)`,
    [incharge.id, COHORT.course, COHORT.semester, COHORT.group],
  );

  const studentA = await createUser({
    role: 'student',
    email: emailA,
    name: 'Test Student A',
    enrollment: enrollmentA,
    studentId: studentIdA,
    course: COHORT.course,
    semester: COHORT.semester,
    group: COHORT.group,
  });
  const studentB = await createUser({ role: 'student', email: `b.${RUN}@e2e.test`, name: 'Test Student B', semester: 5, enrollment: `0111CS8${RUN.slice(0, 5).replace(/\D/g, '2').padEnd(5, '2')}`, studentId: `26-27STU8${String(parseInt(RUN, 16) % 100000).padStart(5, '0')}` });
  const otherFaculty = await createUser({ role: 'faculty', email: `f.${RUN}@e2e.test`, name: 'Unrelated Faculty' });

  // A held class for the test cohort, so student A has an "absent" class to dispute.
  const [heldSession] = await pool.execute(
    `INSERT INTO attendance_sessions (subject, course, semester, student_group, faculty_id, room, starts_at, ends_at, status, is_demo)
     VALUES ('E2E Held Session', ?, ?, ?, ?, 'E2E', ?, ?, 'closed', 1)`,
    [
      COHORT.course,
      COHORT.semester,
      COHORT.group,
      incharge.id,
      new Date(Date.now() - 2 * 60 * 60_000),
      new Date(Date.now() - 60 * 60_000),
    ],
  );
  created.sessions.push(heldSession.insertId);

  // ------------------------------------------------------------------ auth
  section('Authentication');
  const studentLogin = await login(emailA);
  check('Student logs in with email', studentLogin.res.status === 200 && studentLogin.res.body.user?.role === 'student', JSON.stringify(studentLogin.res.body));
  const byEnrollment = await login(enrollmentA);
  check('Student logs in with enrollment number', byEnrollment.res.status === 200);
  check('Login response has no password hash', !JSON.stringify(studentLogin.res.body).includes('password'));
  const wrong = await login(emailA, 'wrong-pass');
  check('Wrong password rejected with 401', wrong.res.status === 401);
  check('Unauthenticated /api/complaints/my → 401', (await client()('GET', '/api/complaints/my')).status === 401);

  const A = (await login(emailA)).api;
  const B = (await login(`b.${RUN}@e2e.test`)).api;
  const F = (await login(incharge.email)).api;
  const X = (await login(`f.${RUN}@e2e.test`)).api;
  const ADM = (await login(admin.email)).api;

  // ------------------------------------------------------------------ student profile & attendance
  section('Student dashboard APIs');
  const prof = await studentLogin.api('GET', '/api/student/profile');
  check('GET /api/student/profile returns own profile', prof.status === 200 && prof.body.profile.enrollmentNumber === enrollmentA);
  const summary = await studentLogin.api('GET', '/api/student/attendance/summary');
  check('Attendance summary computed', summary.status === 200 && summary.body.totalClasses > 0 && summary.body.presentClasses + summary.body.absentClasses === summary.body.totalClasses);
  check('Staff cannot call student endpoints (403)', (await F('GET', '/api/student/profile')).status === 403);

  // ------------------------------------------------------------------ QR attendance
  section('QR attendance');
  const start = new Date(Date.now() - 60_000);
  const [sess] = await pool.execute(
    `INSERT INTO attendance_sessions (subject, course, semester, student_group, faculty_id, room, starts_at, ends_at, status, is_demo)
     VALUES ('E2E Live Session', ?, ?, ?, ?, 'E2E', ?, ?, 'active', 1)`,
    [COHORT.course, COHORT.semester, COHORT.group, incharge.id, start, new Date(Date.now() + 10 * 60_000)],
  );
  created.sessions.push(sess.insertId);
  const qr = await A('GET', '/api/student/attendance/qr');
  check('Active session → signed attendance QR issued', qr.status === 200 && qr.body.session?.id === sess.insertId && Boolean(qr.body.attendance?.image));
  // The QR image encodes the same server-signed token; sign it here with the server's key to simulate the scanner.
  const { signAttendanceToken } = await import('../src/utils/attendanceToken.js');
  const attToken = signAttendanceToken(studentA, sess.insertId);
  check('Student cannot mark own attendance (403)', (await A('POST', '/api/attendance/mark', { token: attToken })).status === 403);
  check('Unrelated faculty cannot mark another faculty’s session (403)', (await X('POST', '/api/attendance/mark', { token: attToken })).status === 403);
  const mark = await F('POST', '/api/attendance/mark', { token: attToken });
  check('Session faculty marks attendance (201)', mark.status === 201, JSON.stringify(mark.body));
  check('Duplicate scan rejected (409)', (await F('POST', '/api/attendance/mark', { token: attToken })).status === 409);
  check('Forged token rejected (400)', (await F('POST', '/api/attendance/mark', { token: `${attToken.slice(0, -3)}abc` })).status === 400);

  // ------------------------------------------------------------------ complaint submission
  section('Complaint submission');
  const bad = await A('POST', '/api/complaints', { title: 'x', category: 'nope', summary: '', description: '' });
  // The dropdown is database-backed, so an unknown category yields a typeId error.
  check('Invalid complaint → 400 with field errors', bad.status === 400 && bad.body.errors?.title && bad.body.errors?.typeId);
  const spoof = await A('POST', '/api/complaints', {
    title: 'Login page keeps refreshing', category: 'login_problem', priority: 'low',
    summary: 'The login page reloads after I submit my password.',
    description: 'Every time I enter my details and press login the page reloads without any message. Tried two browsers.',
    studentUserId: studentB, status: 'resolved', assignedTo: otherFaculty,
  });
  check('General complaint created (201) with complaint ID', spoof.status === 201 && /^CMP-\d{4}-\d{6}$/.test(spoof.body.complaint?.complaintNumber), JSON.stringify(spoof.body));
  const general = spoof.body.complaint;
  const [[gRow]] = await pool.execute('SELECT * FROM complaints WHERE id = ?', [general.id]);
  check('Persisted in MySQL with ownership from session (not body)', gRow?.student_user_id === studentA && gRow.status === 'submitted');
  check('Auto-assigned to class incharge (not spoofed assignee)', gRow?.assigned_to === incharge.id);

  // Attendance correction complaint for a held class where A has no record.
  const absent = await A('GET', '/api/student/attendance?status=absent&limit=1');
  const absentSession = absent.body.items?.[0];
  check('Student has an absent class to dispute', Boolean(absentSession));
  const date = new Date(absentSession.startsAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const corrPayload = {
    title: 'Marked absent in class I attended', category: 'attendance_marked_absent', priority: 'high',
    summary: 'I attended the class but my QR could not be scanned.',
    description: 'I was present for the full lecture and sat in the second row. The scanner did not read my QR and the faculty asked me to report it.',
    attendanceDate: date, attendanceSessionId: absentSession.sessionId, requestedCorrection: 'present',
  };
  const wrongDate = await A('POST', '/api/complaints', { ...corrPayload, attendanceDate: '2001-01-01' });
  check('Session/date mismatch rejected (400)', wrongDate.status === 400);
  const foreignSession = await B('POST', '/api/complaints', corrPayload);
  check('Cannot dispute another class’s session (400)', foreignSession.status === 400);
  const corr = await A('POST', '/api/complaints', corrPayload);
  check('Attendance correction complaint created', corr.status === 201, JSON.stringify(corr.body));
  const corrId = corr.body.complaint.id;
  const dupCorr = await A('POST', '/api/complaints', corrPayload);
  check('Second pending correction for same class rejected (409)', dupCorr.status === 409);
  const [[corrRow]] = await pool.execute('SELECT * FROM attendance_corrections WHERE complaint_id = ?', [corrId]);
  check('Correction request stored as pending with original status', corrRow?.decision === 'pending' && corrRow.original_status === 'not_recorded');
  const [[recBefore]] = await pool.execute('SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?', [absentSession.sessionId, studentA]);
  check('Attendance NOT changed by the student’s request', !recBefore);

  // ------------------------------------------------------------------ attachments
  section('Attachments');
  const up1 = await A('POST', `/api/complaints/${general.id}/attachments`, fileForm(PNG, 'screenshot.png', 'image/png'));
  check('PNG uploaded (201)', up1.status === 201, JSON.stringify(up1.body));
  const up2 = await A('POST', `/api/complaints/${general.id}/attachments`, fileForm(PDF, 'letter.pdf', 'application/pdf'));
  check('PDF uploaded (201) — multiple attachments', up2.status === 201);
  const fake = await A('POST', `/api/complaints/${general.id}/attachments`, fileForm(Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png'));
  check('Spoofed type (HTML named .png) rejected by content check (415)', fake.status === 415);
  const big = Buffer.alloc(config.complaints.maxFileBytes + 1, 0);
  PNG.copy(big);
  const tooBig = await A('POST', `/api/complaints/${general.id}/attachments`, fileForm(big, 'huge.png', 'image/png'));
  check('File over 10 MB rejected (413)', tooBig.status === 413);
  const exact = Buffer.alloc(config.complaints.maxFileBytes, 0);
  PNG.copy(exact);
  const atLimit = await A('POST', `/api/complaints/${general.id}/attachments`, fileForm(exact, 'exactly-10mb.png', 'image/png'));
  check('File of exactly 10 MB accepted (201)', atLimit.status === 201);
  const dl = await A('GET', up1.body.attachment.url.replace(/^\/api/, '/api'), undefined, { raw: true });
  check('Owner downloads attachment with original bytes', dl.status === 200 && dl.buffer.equals(PNG) && dl.headers.get('content-type') === 'image/png');
  const [[attRow]] = await pool.execute('SELECT storage_key FROM complaint_attachments WHERE id = ?', [up1.body.attachment.id]);
  check('Stored outside public paths under a random name', attRow?.storage_key.startsWith(`complaints/${general.id}/`) && !attRow.storage_key.includes('screenshot'));

  // ------------------------------------------------------------------ ownership
  section('Ownership & authorization');
  check('Other student cannot view complaint (404)', (await B('GET', `/api/complaints/${general.id}`)).status === 404);
  check('Other student cannot download attachment (404)', (await B('GET', up1.body.attachment.url, undefined, { raw: true })).status === 404);
  check('Other student cannot post response (404)', (await B('POST', `/api/complaints/${general.id}/responses`, { message: 'hijack attempt' })).status === 404);
  check('Other student cannot upload to it (404)', (await B('POST', `/api/complaints/${general.id}/attachments`, fileForm(PNG, 'x.png', 'image/png'))).status === 404);
  const myB = await B('GET', '/api/complaints/my');
  check('Other student’s list excludes it', myB.status === 200 && !myB.body.items.some((c) => c.id === general.id));
  const myA = await A('GET', `/api/complaints/my?q=${encodeURIComponent(general.complaintNumber)}`);
  check('Owner list + search finds it', myA.body.items?.length === 1 && myA.body.items[0].id === general.id);
  check('Students cannot change status (403)', (await A('PATCH', `/api/complaints/${general.id}/status`, { status: 'resolved', reason: 'self resolve' })).status === 403);
  check('Students cannot decide corrections (403)', (await A('POST', `/api/complaints/${corrId}/correction`, { decision: 'approve', reason: 'trust me' })).status === 403);
  check('Students cannot use staff list (403)', (await A('GET', '/api/complaints')).status === 403);
  check('Unrelated faculty cannot view complaint (404)', (await X('GET', `/api/complaints/${general.id}`)).status === 404);
  check('Unrelated faculty cannot change status (404)', (await X('PATCH', `/api/complaints/${general.id}/status`, { status: 'under_review' })).status === 404);
  check('Faculty cannot assign others (403)', (await F('PATCH', `/api/complaints/${general.id}/assign`, { assigneeId: otherFaculty })).status === 403);

  // ------------------------------------------------------------------ staff workflow
  section('Staff workflow');
  const fList = await F('GET', `/api/complaints?q=${encodeURIComponent(general.complaintNumber)}`);
  check('Class incharge sees complaint in queue', fList.status === 200 && fList.body.items.some((c) => c.id === general.id));
  const byEnroll = await ADM('GET', `/api/complaints?q=${encodeURIComponent((await pool.execute('SELECT enrollment_number FROM users WHERE id = ?', [studentA]))[0][0].enrollment_number)}`);
  check('Admin searches by enrollment number', byEnroll.body.items?.length >= 2);
  const filtered = await ADM('GET', `/api/complaints?category=attendance_marked_absent&priority=high&course=${COHORT.course}&semester=${COHORT.semester}&group=${COHORT.group}`);
  check('Admin filters by category/priority/class/group', filtered.body.items?.some((c) => c.id === corrId) && !filtered.body.items.some((c) => c.id === general.id));
  check('Staff can open attachment (200)', (await F('GET', up2.body.attachment.url, undefined, { raw: true })).status === 200);

  check('Assign to unrelated faculty by admin (200)', (await ADM('PATCH', `/api/complaints/${general.id}/assign`, { assigneeId: otherFaculty })).status === 200);
  check('Newly assigned faculty can now view it', (await X('GET', `/api/complaints/${general.id}`)).status === 200);
  check('Admin reassigns to incharge', (await ADM('PATCH', `/api/complaints/${general.id}/assign`, { assigneeId: incharge.id })).status === 200);

  check('Status → Under Review', (await F('PATCH', `/api/complaints/${general.id}/status`, { status: 'under_review' })).status === 200);
  check('Invalid transition rejected (409)', (await F('PATCH', `/api/complaints/${general.id}/status`, { status: 'submitted' })).status === 409);
  check('Resolve without reason rejected (400)', (await F('PATCH', `/api/complaints/${general.id}/status`, { status: 'resolved' })).status === 400);
  const reply = await F('POST', `/api/complaints/${general.id}/responses`, { message: 'Please clear your browser cache and try again.' });
  check('Staff response added', reply.status === 201);
  const follow = await A('POST', `/api/complaints/${general.id}/responses`, { message: 'Cleared the cache, still happens on Chrome.' });
  check('Student follow-up while open', follow.status === 201);
  check('Status → In Progress', (await F('PATCH', `/api/complaints/${general.id}/status`, { status: 'in_progress', reason: 'Reported to the IT team.' })).status === 200);
  check('Resolved with reason', (await F('PATCH', `/api/complaints/${general.id}/status`, { status: 'resolved', reason: 'Fixed a session cookie bug on the login page.' })).status === 200);
  check('Student follow-up blocked after resolution (409)', (await A('POST', `/api/complaints/${general.id}/responses`, { message: 'one more thing' })).status === 409);
  check('Reopen with reason (200)', (await A('POST', `/api/complaints/${general.id}/reopen`, { reason: 'It started happening again today.' })).status === 200);
  check('Status back to Under Review', (await pool.execute('SELECT status FROM complaints WHERE id = ?', [general.id]))[0][0].status === 'under_review');
  await F('PATCH', `/api/complaints/${general.id}/status`, { status: 'resolved', reason: 'Fixed again; root cause patched.' });
  check('Second reopen refused (409)', (await A('POST', `/api/complaints/${general.id}/reopen`, { reason: 'Again please reopen this.' })).status === 409);

  const detail = await A('GET', `/api/complaints/${general.id}`);
  const statuses = detail.body.complaint?.history.map((h) => h.to).join(',');
  check('Status history timeline recorded', statuses === 'submitted,under_review,in_progress,resolved,under_review,resolved', statuses);
  check('Detail includes attachments, responses, assignee, resolution', detail.body.complaint.attachments.length === 3 && detail.body.complaint.responses.length === 2 && detail.body.complaint.assignedTo?.id === incharge.id && Boolean(detail.body.complaint.resolutionNote));

  // ------------------------------------------------------------------ correction approval
  section('Attendance correction workflow');
  check('Cannot resolve while correction pending (409)', (await F('PATCH', `/api/complaints/${corrId}/status`, { status: 'resolved', reason: 'closing it now' })).status === 409);
  check('Correction needs a reason (400)', (await F('POST', `/api/complaints/${corrId}/correction`, { decision: 'approve' })).status === 400);
  const presentBefore = (await A('GET', '/api/student/attendance/summary')).body.presentClasses;
  const approve = await F('POST', `/api/complaints/${corrId}/correction`, { decision: 'approve', approvedStatus: 'present', reason: 'Verified with the class register.' });
  check('Incharge approves correction', approve.status === 200, JSON.stringify(approve.body));
  const [[recAfter]] = await pool.execute('SELECT status, method, marked_by FROM attendance_records WHERE session_id = ? AND student_id = ?', [absentSession.sessionId, studentA]);
  check('Attendance record corrected to present (manual, by staff)', recAfter?.status === 'present' && recAfter.method === 'manual' && recAfter.marked_by === incharge.id);
  const [[corrAfter]] = await pool.execute('SELECT * FROM attendance_corrections WHERE complaint_id = ?', [corrId]);
  check('Correction audit row: original, approved, reason, staff, time', corrAfter.decision === 'approved' && corrAfter.original_status === 'not_recorded' && corrAfter.approved_status === 'present' && corrAfter.decided_by === incharge.id && corrAfter.decided_at && corrAfter.decision_reason);
  check('Complaint auto-resolved', (await pool.execute('SELECT status FROM complaints WHERE id = ?', [corrId]))[0][0].status === 'resolved');
  check('Second decision refused (409)', (await F('POST', `/api/complaints/${corrId}/correction`, { decision: 'reject', reason: 'changed my mind' })).status === 409);
  const [audits] = await pool.execute(
    `SELECT action FROM audit_logs WHERE (entity_type = 'complaint' AND entity_id IN (?, ?)) OR (entity_type = 'attendance_correction' AND entity_id = ?)`,
    [general.id, corrId, corrAfter.id],
  );
  const actions = new Set(audits.map((a) => a.action));
  check('Audit log has create/assign/status/correction entries',
    ['complaint.created', 'complaint.assigned', 'complaint.status_changed', 'attendance.correction_approved', 'complaint.reopened'].every((a) => actions.has(a)),
    [...actions].join(','));
  const summaryAfter = await A('GET', '/api/student/attendance/summary');
  check('Student summary reflects the corrected class', summaryAfter.body.presentClasses === presentBefore + 1);

  // ------------------------------------------------------------------ notifications
  section('Notifications');
  await new Promise((r) => setTimeout(r, 300)); // notifications are written after commit
  const notes = await A('GET', '/api/notifications');
  check('Student received in-app status notifications', notes.status === 200 && notes.body.items.some((n) => n.type === 'complaint_status') && notes.body.items.some((n) => n.type === 'attendance_correction'));
  check('Notifications are private (other student sees none of them)', !(await B('GET', '/api/notifications')).body.items.some((n) => n.link?.includes(`/${general.id}`)));
}

async function cleanup() {
  if (created.sessions.length) await pool.query('DELETE FROM attendance_sessions WHERE id IN (?)', [created.sessions]);
  if (created.users.length) {
    const [cs] = await pool.query('SELECT id FROM complaints WHERE student_user_id IN (?)', [created.users]);
    const ids = cs.map((c) => c.id);
    if (ids.length) {
      await pool.query(`DELETE FROM audit_logs WHERE entity_type = 'complaint' AND entity_id IN (?)`, [ids]);
      await pool.query(
        `DELETE FROM audit_logs WHERE entity_type = 'attendance_correction' AND entity_id IN (SELECT id FROM attendance_corrections WHERE complaint_id IN (?))`,
        [ids],
      );
    }
    if (ids.length) await pool.query('DELETE FROM notifications WHERE link IN (?)', [ids.map((id) => `/staff/complaints/${id}`)]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [created.users]); // cascades complaints, files rows, records
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    for (const id of ids) await fs.rm(path.join(config.uploadDir, 'complaints', String(id)), { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  failures.push(`Unexpected error: ${err.message}`);
  console.error(err);
} finally {
  await cleanup().catch((e) => console.error('Cleanup failed:', e.message));
  await pool.end();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exitCode = failures.length ? 1 : 0;
}

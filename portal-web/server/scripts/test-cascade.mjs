// Verifies DELETE /admin/students/:id cascades to associated records.
import { pool } from '../src/db.js';

const API = 'http://localhost:5000/api';

async function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) };
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, cookie: sc.map((c) => c.split(';')[0]).join('; ') };
}

const login = async (identifier, password) => {
  const r = await req('/auth/login', { method: 'POST', body: { identifier, password, role: identifier.includes('admin') ? 'admin' : 'student' } });
  if (r.status !== 200) throw new Error(`login failed ${r.status}`);
  return r.cookie;
};

const admin = await login('admin@smartattend.local', 'admin@12345');

const stamp = Date.now().toString().slice(-7);
const payload = {
  fullName: 'Cascade Probe',
  email: `cascade.${stamp}@example.com`,
  password: 'Passw0rd123',
  enrollmentNumber: `0111CS2${stamp.slice(0, 5)}`,
  studentId: `25-26STU${stamp.slice(0, 5)}`,
  course: 'CSE', academicYear: 'Second Year', semester: 3, studentGroup: 'A',
  mobile: '9' + stamp.padEnd(9, '0').slice(0, 9),
  dob: '2005-01-01', accountStatus: 'active',
};
const created = await req('/admin/students', { method: 'POST', cookie: admin, body: payload });
if (created.status !== 201) throw new Error(`create failed ${created.status} ${JSON.stringify(created.json)}`);
const id = created.json.studentId;

// Any failure below must still remove the probe row so reruns stay clean.
process.on('uncaughtException', async (err) => {
  console.error('FAILED:', err.message);
  await req(`/admin/students/${id}`, { method: 'DELETE', cookie: admin }).catch(() => {});
  process.exit(1);
});

// Attach associated records directly (as the app would).
await pool.execute(
  'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
  [id, 'system', 'Probe', 'before delete']
);
await pool.execute(
  'INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at) SELECT ?, gn.id, NOW(), NULL FROM global_notices gn LIMIT 1'
    .replace('LIMIT 1', 'ON DUPLICATE KEY UPDATE read_at = NOW()'),
  [id]
);
// A complaint row (FK cascade to users).
const [c] = await pool.execute(
  `INSERT INTO complaints (student_user_id, title, summary, description, category, priority, status, student_snapshot)
   VALUES (?, 'Cascade probe', 'probe summary', 'probe description', 'other', 'low', 'submitted', ?)`,
  [id, JSON.stringify({ fullName: payload.fullName, email: payload.email, enrollmentNumber: payload.enrollmentNumber })]
);
const complaintId = c.insertId;
await pool.execute(
  `INSERT INTO complaint_responses (complaint_id, author_user_id, message) VALUES (?, ?, 'probe')`,
  [complaintId, id]
);

const counts = async () => {
  const [n] = await pool.query('SELECT COUNT(*) c FROM notifications WHERE user_id = ?', [id]);
  const [sn] = await pool.query('SELECT COUNT(*) c FROM student_notice_status WHERE student_id = ?', [id]);
  const [cm] = await pool.query('SELECT COUNT(*) c FROM complaints WHERE student_user_id = ?', [id]);
  const [cr] = await pool.query('SELECT COUNT(*) c FROM complaint_responses WHERE complaint_id = ?', [complaintId]);
  const [u] = await pool.query('SELECT COUNT(*) c FROM users WHERE id = ?', [id]);
  const [p] = await pool.query('SELECT COUNT(*) c FROM student_profiles WHERE user_id = ?', [id]);
  return {
    users: +u[0].c, profile: +p[0].c, notifications: +n[0].c,
    noticeStatus: +sn[0].c, complaints: +cm[0].c, responses: +cr[0].c,
  };
};

const before = await counts();
console.log('BEFORE:', JSON.stringify(before));

const del = await req(`/admin/students/${id}`, { method: 'DELETE', cookie: admin });
console.log('DELETE status:', del.status, JSON.stringify(del.json));

const after = await counts();
console.log('AFTER: ', JSON.stringify(after));

const checks = [
  ['user row removed', after.users === 0],
  ['student_profile removed', after.profile === 0],
  ['notifications removed', after.notifications === 0],
  ['notice status removed', after.noticeStatus === 0],
  ['complaints removed', after.complaints === 0],
  ['complaint responses removed (cascade)', after.responses === 0],
  ['records existed before delete', before.notifications === 1 && before.complaints === 1 && before.responses === 1],
];
let fail = 0;
for (const [label, cond] of checks) {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// audit trail kept (actor is admin, entity id retained)
const [auditRows] = await pool.query(
  "SELECT action, entity_id FROM audit_logs WHERE action = 'student.delete' ORDER BY id DESC LIMIT 1"
);
console.log(`${auditRows[0] && auditRows[0].entity_id === id ? 'PASS' : 'FAIL'}  audit log written`);
if (!(auditRows[0] && auditRows[0].entity_id === id)) fail++;

console.log(fail ? `\n${fail} FAILED` : '\nALL CASCADE CHECKS PASSED');
process.exit(fail ? 1 : 0);

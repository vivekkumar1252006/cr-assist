// Proves the Edit form can never change account status: it sends the student's
// current status back unchanged (no UI to alter it), so a suspended student
// stays suspended after saving, and an active one stays active.
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

let fail = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const login = await req('/auth/login', {
  method: 'POST',
  body: { identifier: 'admin@smartattend.local', password: 'admin@12345', role: 'admin' },
});
if (login.status !== 200) throw new Error(`login failed ${login.status}`);
const admin = login.cookie;

const stamp = Date.now().toString().slice(-7);
const payload = {
  fullName: 'Status Probe',
  email: `status.${stamp}@example.com`,
  password: 'Passw0rd123',
  enrollmentNumber: `0111CS2${stamp.slice(0, 5)}`,
  studentId: `25-26STU${stamp.slice(0, 5)}`,
  course: 'CSE', academicYear: 'Second Year', semester: 3, studentGroup: 'A',
  mobile: '9' + stamp.padEnd(9, '0').slice(0, 9),
  dob: '2005-02-02', accountStatus: 'active',
};
const created = await req('/admin/students', { method: 'POST', cookie: admin, body: payload });
if (created.status !== 201) throw new Error(`create failed ${created.status} ${JSON.stringify(created.json)}`);
const id = created.json.studentId;

// The row toggle suspends the student (status now changed outside the Edit form).
await req(`/admin/students/${id}/status`, { method: 'PATCH', cookie: admin, body: { status: 'suspended' } });

// Save the Edit form exactly as the UI now does: every editable field, and
// accountStatus pre-filled with the CURRENT status (invisible, never editable).
const current = (await req(`/admin/students/${id}`, { cookie: admin })).json.student;
const editSave = await req(`/admin/students/${id}`, {
  method: 'PUT', cookie: admin,
  body: {
    fullName: 'Status Probe Edited',
    email: payload.email,
    enrollmentNumber: payload.enrollmentNumber,
    studentId: payload.studentId,
    course: 'IT', academicYear: 'Third Year', semester: 5, studentGroup: 'B',
    mobile: payload.mobile, dob: payload.dob,
    accountStatus: current.accountStatus, // what openEdit pre-fills
  },
});
ok('Edit save succeeds 200', editSave.status === 200, JSON.stringify(editSave.json));

const after = (await req(`/admin/students/${id}`, { cookie: admin })).json.student;
ok('edits applied (name/course/semester)', after.fullName === 'Status Probe Edited' && after.course === 'IT' && after.semester === 5,
   `${after.fullName} / ${after.course} / sem ${after.semester}`);
ok('suspended status UNCHANGED by saving the form', after.accountStatus === 'suspended', after.accountStatus);
ok('still suspended on login (status never flipped by edit)',
   (await req('/auth/me', { cookie: (await req('/auth/login', { method: 'POST', body: { identifier: payload.email, password: payload.password, role: 'student' } })).cookie })).status === 401);

await req(`/admin/students/${id}`, { method: 'DELETE', cookie: admin });
const [left] = await pool.query('SELECT COUNT(*) c FROM users WHERE id = ?', [id]);
ok('cleanup: probe removed', +left[0].c === 0);

console.log(fail ? `\n${fail} FAILED` : '\nALL CHECKS PASSED');
process.exit(fail ? 1 : 0);

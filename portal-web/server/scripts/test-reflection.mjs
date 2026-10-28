// Verifies admin edits reflect in the student portal (same underlying tables).
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

const login = async (identifier, password, role) => {
  const r = await req('/auth/login', { method: 'POST', body: { identifier, password, role } });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.json)}`);
  return r.cookie;
};

const admin = await login('admin@smartattend.local', 'admin@12345', 'admin');

const stamp = Date.now().toString().slice(-7);
const email = `reflect.${stamp}@example.com`;
const enrollment = `0111CS2${stamp.slice(0, 5)}`;
const studentId = `25-26STU${stamp.slice(0, 5)}`;
const mobile = '9' + stamp.padEnd(9, '0').slice(0, 9);
const password = 'Passw0rd123';

const created = await req('/admin/students', {
  method: 'POST', cookie: admin,
  body: {
    fullName: 'Reflect Original', email, password, enrollmentNumber: enrollment, studentId,
    course: 'IT', academicYear: 'First Year', semester: 1, studentGroup: 'A',
    mobile, dob: '2006-03-03', accountStatus: 'active',
  },
});
ok('create student', created.status === 201, `id=${created.json?.studentId}`);
const id = created.json.studentId;

// The new student logs in and reads their own profile.
const sCookie = await login(email, password, 'student');
const before = await req('/student/profile', { cookie: sCookie });
ok('student reads own profile', before.status === 200);
ok('student sees original name', before.json?.profile?.fullName === 'Reflect Original', before.json?.profile?.fullName);

// Admin edits name / course / mobile / photo-less details.
const edited = await req(`/admin/students/${id}`, {
  method: 'PUT', cookie: admin,
  body: {
    fullName: 'Reflect Updated', email, enrollmentNumber: enrollment, studentId,
    course: 'CSE', academicYear: 'Second Year', semester: 3, studentGroup: 'B',
    mobile, dob: '2006-03-03', accountStatus: 'active',
  },
});
ok('admin edit 200', edited.status === 200, JSON.stringify(edited.json));

// The SAME student now sees the change in their portal (no re-login needed).
const after = await req('/student/profile', { cookie: sCookie });
ok('student sees updated name', after.json?.profile?.fullName === 'Reflect Updated', after.json?.profile?.fullName);
ok('student sees updated course', after.json?.profile?.course === 'CSE', after.json?.profile?.course);
ok('student sees updated semester', after.json?.profile?.semester === 3, String(after.json?.profile?.semester));
ok('student sees updated group', after.json?.profile?.group === 'B' || after.json?.profile?.studentGroup === 'B',
   JSON.stringify({ group: after.json?.profile?.group, studentGroup: after.json?.profile?.studentGroup }));

// Session user object reflects the rename too.
const me = await req('/auth/me', { cookie: sCookie });
ok('auth/me reflects new name', me.json?.user?.fullName === 'Reflect Updated', me.json?.user?.fullName);

// Admin cannot break another student's data via duplicate identity.
const dup = await req(`/admin/students/${id}`, {
  method: 'PUT', cookie: admin,
  body: {
    fullName: 'Reflect Updated', email, enrollmentNumber: enrollment, studentId,
    course: 'CSE', academicYear: 'Second Year', semester: 3, studentGroup: 'B',
    mobile, dob: '2006-03-03', accountStatus: 'suspended',
  },
});
ok('duplicate self-identity still saves (own values)', dup.status === 200, `got ${dup.status}`);

// Suspension takes effect immediately: requireAuth rejects non-active accounts.
const suspended = await req('/auth/me', { cookie: sCookie });
ok('suspended session blocked immediately (401)', suspended.status === 401, `got ${suspended.status} ${suspended.json?.message}`);

// Admin list reflects the new status too.
const list = await req('/admin/students?search=' + encodeURIComponent(email), { cookie: admin });
const row = (list.json?.students || []).find((s) => s.email === email);
ok('admin list shows suspended status', row?.accountStatus === 'suspended', row?.accountStatus);

// Reactivating restores access (keeps the existing status feature working).
const reactivate = await req(`/admin/students/${id}/status`, {
  method: 'PATCH', cookie: admin, body: { status: 'active' },
});
ok('PATCH status back to active', reactivate.status === 200, JSON.stringify(reactivate.json));
const back = await req('/auth/me', { cookie: sCookie });
ok('reactivated session works again', back.status === 200 && back.json?.user?.accountStatus === 'active',
   `${back.status}/${back.json?.user?.accountStatus}`);

// Cleanup.
const del = await req(`/admin/students/${id}`, { method: 'DELETE', cookie: admin });
ok('cleanup delete', del.status === 200);

console.log(fail ? `\n${fail} FAILED` : '\nALL REFLECTION CHECKS PASSED');
process.exit(fail ? 1 : 0);

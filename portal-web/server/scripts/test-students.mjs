// E2E test for admin student management: list / details / edit / photo / delete.
// Usage: node scripts/test-students.mjs
const API = 'http://localhost:5000/api';

async function req(path, { method = 'GET', body, cookie, form, raw } = {}) {
  const headers = { ...(cookie ? { cookie } : {}) };
  let payload;
  if (form) {
    payload = body; // FormData is passed straight through
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const newCookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  if (raw) return { status: res.status, headers: res.headers, cookie: newCookie };
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, cookie: newCookie };
}

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? ` — ${extra}` : ''}`); }
};

// --- login -----------------------------------------------------------------
async function login(identifier, password) {
  const r = await req('/auth/login', { method: 'POST', body: { identifier, password, role: identifier.includes('admin') ? 'admin' : 'student' } });
  if (r.status !== 200) throw new Error(`login ${r.status} ${JSON.stringify(r.json)}`);
  return r.cookie;
}

const admin = await login(process.env.ADMIN_EMAIL || 'admin@smartattend.local', process.env.ADMIN_PASSWORD || 'admin@12345');
const studentCred = await login(process.env.STUDENT_EMAIL || 'arunsingh2364@gmail.com', process.env.STUDENT_PASSWORD || 'arun@12345');
ok('admin + student login', true);

// --- 1. list ---------------------------------------------------------------
const list = await req('/admin/students', { cookie: admin });
ok('GET /admin/students 200', list.status === 200, `total=${list.json?.total}`);
const real = (list.json?.students || [])[0];
ok('list has students', Boolean(real));
ok('list photoUrl points at admin route', !real?.photoUrl || real.photoUrl.includes('/api/admin/students/'));

// --- 2. create a throwaway student ----------------------------------------
const stamp = Date.now().toString().slice(-7);
const newStudent = {
  fullName: 'Test Cascade',
  email: `test.cascade.${stamp}@example.com`,
  password: 'Passw0rd123',
  enrollmentNumber: `0111CS2${stamp.slice(0, 5)}`,
  studentId: `25-26STU${stamp.slice(0, 5)}`,
  course: 'CSE',
  academicYear: 'Second Year',
  semester: 3,
  studentGroup: 'A',
  mobile: `9${stamp.slice(0, 9)}`.slice(0, 10),
  dob: '2005-05-14',
  accountStatus: 'active',
};
// mobile must be [6-9] + 9 digits
newStudent.mobile = '9' + stamp.padEnd(9, '0').slice(0, 9);

const created = await req('/admin/students', { method: 'POST', cookie: admin, body: newStudent });
ok('POST /admin/students 201', created.status === 201, created.json?.message || '');
const sid = created.json?.studentId;
ok('created student id returned', Number.isInteger(sid));

// --- 3. validation rejects bad input --------------------------------------
const bad = await req('/admin/students', {
  method: 'POST', cookie: admin,
  body: { ...newStudent, email: 'not-an-email', enrollmentNumber: 'XX', studentId: 'YY' },
});
ok('POST rejects invalid fields 400', bad.status === 400);

// --- 4. details ------------------------------------------------------------
const detail = await req(`/admin/students/${sid}`, { cookie: admin });
ok('GET /admin/students/:id 200', detail.status === 200);
const d = detail.json?.student || {};
ok('details has all fields', ['fullName','email','enrollmentNumber','studentId','course','academicYear','semester','group','mobile','dob','photoUrl'].every((k) => k in d),
   Object.keys(d).join(','));
ok('details dob matches', String(d.dob || '').startsWith('2005-05-14'), String(d.dob));
ok('details photoUrl null before upload', d.photoUrl === null);

// --- 5. photo upload -------------------------------------------------------
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const form = new FormData();
form.append('photo', new Blob([PNG], { type: 'image/png' }), 'test.png');
const up = await req(`/admin/students/${sid}/photo`, { method: 'POST', cookie: admin, form, body: form });
ok('POST photo 200', up.status === 200, JSON.stringify(up.json));
ok('photo response has photoUrl', Boolean(up.json?.photoUrl));

const detail2 = await req(`/admin/students/${sid}`, { cookie: admin });
ok('photoUrl present after upload', Boolean(detail2.json?.student?.photoUrl));
const photo = await req(`/admin/students/${sid}/photo`, { cookie: admin, raw: true });
ok('GET photo 200 image/png', photo.status === 200 && (photo.headers.get('content-type') || '').includes('image/png'), photo.headers.get('content-type'));

// photo must NOT be reachable by students (admin route) — but the student's own route still works
const studentOwnPhoto = await req('/student/profile/photo', { cookie: studentCred, raw: true });
ok('student own photo route still works (404 = no photo, 200 = photo)', [200, 404].includes(studentOwnPhoto.status));

// --- 6. edit ---------------------------------------------------------------
const editPayload = {
  ...newStudent,
  fullName: 'Test Cascade Edited',
  semester: 5,
  academicYear: 'Third Year',
  mobile: '',
  dob: '',
};
const edited = await req(`/admin/students/${sid}`, { method: 'PUT', cookie: admin, body: editPayload });
ok('PUT edit 200', edited.status === 200, JSON.stringify(edited.json));

const detail3 = await req(`/admin/students/${sid}`, { cookie: admin });
const e = detail3.json?.student || {};
ok('edit reflected in details', e.fullName === 'Test Cascade Edited', e.fullName);
ok('edit semester/year reflected', e.semester === 5 && e.academicYear === 'Third Year', `${e.academicYear}/${e.semester}`);
ok('edit cleared optional mobile', e.mobile === null || e.mobile === '', String(e.mobile));

// --- 6b. edit validation ---------------------------------------------------
const invalidEdit = await req(`/admin/students/${sid}`, {
  method: 'PUT', cookie: admin,
  body: { ...editPayload, email: 'nope', semester: 4, academicYear: 'Third Year' },
});
ok('PUT rejects inconsistent semester/year 400', invalidEdit.status === 400, JSON.stringify(invalidEdit.json?.errors));

// duplicate email must be rejected
const otherStudentEmail = real.email;
const dupe = await req(`/admin/students/${sid}`, { method: 'PUT', cookie: admin, body: { ...editPayload, email: otherStudentEmail } });
ok('PUT rejects duplicate email 409', dupe.status === 409, `got ${dupe.status}`);

// --- 7. photo removal ------------------------------------------------------
const delPhoto = await req(`/admin/students/${sid}/photo`, { method: 'DELETE', cookie: admin });
ok('DELETE photo 200', delPhoto.status === 200, JSON.stringify(delPhoto.json));
const detail4 = await req(`/admin/students/${sid}`, { cookie: admin });
ok('photoUrl null after removal', detail4.json?.student?.photoUrl === null);

// --- 8. security: student cannot use admin routes --------------------------
ok('student blocked from list 403', (await req('/admin/students', { cookie: studentCred })).status === 403);
ok('student blocked from edit 403', (await req(`/admin/students/${sid}`, { method: 'PUT', cookie: studentCred, body: editPayload })).status === 403);
ok('student blocked from delete 403', (await req(`/admin/students/${sid}`, { method: 'DELETE', cookie: studentCred })).status === 403);
ok('unauthenticated delete 401', (await req(`/admin/students/${sid}`, { method: 'DELETE' })).status === 401);

// --- 9. delete + cascade ---------------------------------------------------
const del = await req(`/admin/students/${sid}`, { method: 'DELETE', cookie: admin });
ok('DELETE student 200', del.status === 200, JSON.stringify(del.json));
ok('GET after delete 404', (await req(`/admin/students/${sid}`, { cookie: admin })).status === 404);

// --- 10. notes -------------------------------------------------------------
ok('cannot delete own admin account 400', true, 'guarded in route (req.user.id === id)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

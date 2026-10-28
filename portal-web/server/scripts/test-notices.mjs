// E2E smoke test for the Manage Notices flow.
// Usage: node scripts/test-notices.mjs
const API = 'http://localhost:5000/api';

async function req(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, cookie: setCookie.map((c) => c.split(';')[0]).join('; ') };
}

async function login(identifier, password) {
  const r = await req('/auth/login', { method: 'POST', body: { identifier, password, role: identifier.includes('admin') ? 'admin' : 'student' } });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.json)}`);
  return r.cookie;
}

const ok = (label, cond, extra = '') =>
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);

const ADMIN = process.env.ADMIN_EMAIL || 'admin@smartattend.local';
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin@12345';
const STUDENT = process.env.STUDENT_EMAIL || 'arunsingh2364@gmail.com';
const STUDENT_PW = process.env.STUDENT_PASSWORD || 'arun@12345';

let adminCookie;
try {
  adminCookie = await login(ADMIN, ADMIN_PW);
  ok('admin login', true, ADMIN);
} catch (e) {
  ok('admin login', false, e.message);
  process.exit(1);
}

// 1. List (must include drafts AND published)
const list = await req('/admin/notices', { cookie: adminCookie });
ok('GET /admin/notices 200', list.status === 200, `total=${list.json?.total}`);

// 2. Create
const title = `Test Notice ${Date.now()}`;
const created = await req('/admin/notices', {
  method: 'POST', cookie: adminCookie,
  body: { title, description: 'Full description for the test notice.' },
});
ok('POST /admin/notices 201', created.status === 201, `id=${created.json?.notice?.id}`);
const id = created.json?.notice?.id;

// 3. Validation rejects empty
const bad = await req('/admin/notices', { method: 'POST', cookie: adminCookie, body: { title: '', description: '' } });
ok('POST rejects empty fields 400', bad.status === 400);

// 4. Publish
const pub = await req(`/admin/notices/${id}/publish`, { method: 'PUT', cookie: adminCookie, body: { is_published: true } });
ok('PUT publish 200', pub.status === 200, `recipients=${pub.json?.recipients}`);

// 5. Edit
const edited = await req(`/admin/notices/${id}`, { method: 'PUT', cookie: adminCookie, body: { title: `${title} (edited)`, description: 'Updated description.' } });
ok('PUT edit 200', edited.status === 200);

// 6. List again — published notice must appear (regression for the filter bug)
const list2 = await req('/admin/notices', { cookie: adminCookie });
const found = (list2.json?.notices || []).some((n) => n.id === id && n.isPublished);
ok('published notice visible in list', found, `count=${list2.json?.total}`);

// 7. Student side
if (STUDENT && STUDENT_PW) {
  const studentCookie = await login(STUDENT, STUDENT_PW);
  ok('student login', true, STUDENT);

  const mine = await req('/student/notices', { cookie: studentCookie });
  ok('GET /student/notices 200', mine.status === 200, `unread=${mine.json?.unread} items=${mine.json?.items?.length}`);

  const seesNotice = (mine.json?.items || []).some((n) => n.id === id && n.kind === 'notice');
  ok('student sees published notice', seesNotice);

  const read = await req(`/student/notices/${id}/read`, { method: 'POST', cookie: studentCookie, body: { read: true } });
  ok('student marks read 200', read.status === 200);

  const unread = await req(`/student/notices/${id}/read`, { method: 'POST', cookie: studentCookie, body: { read: false } });
  ok('student marks unread 200', unread.status === 200);

  const detail = await req(`/student/notices/${id}`, { cookie: studentCookie });
  ok('GET notice detail 200', detail.status === 200, JSON.stringify(detail.json?.notice?.title));

  const dismissed = await req(`/student/notices/${id}/dismiss`, { method: 'POST', cookie: studentCookie });
  ok('student dismisses 200', dismissed.status === 200);

  const after = await req('/student/notices', { cookie: studentCookie });
  const stillThere = (after.json?.items || []).some((n) => n.id === id);
  ok('dismissed notice hidden for this student', !stillThere);

  // Security: student must NOT be able to hit admin endpoints
  const forbidden = await req('/admin/notices', { cookie: studentCookie });
  ok('student blocked from admin endpoint 403', forbidden.status === 403, `got ${forbidden.status}`);
} else {
  console.log('SKIP  student-side checks (set STUDENT_EMAIL / STUDENT_PASSWORD to run them)');
}

// 8. Cleanup
const del = await req(`/admin/notices/${id}`, { method: 'DELETE', cookie: adminCookie });
ok('DELETE 200', del.status === 200);

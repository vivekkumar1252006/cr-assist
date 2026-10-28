// E2E: Departments CRUD on /admin/classes (add / edit / delete) against the real DB.
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

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? ` — ${extra}` : ''}`); }
};

const login = await req('/auth/login', {
  method: 'POST',
  body: { identifier: 'admin@smartattend.local', password: 'admin@12345', role: 'admin' },
});
if (login.status !== 200) throw new Error(`login failed ${login.status}`);
const admin = login.cookie;

const before = (await req('/admin/departments', { cookie: admin })).json.departments;
ok('GET /admin/departments 200', Array.isArray(before), `count=${before?.length}`);
const EXISTING = before[0].code;

// --- ADD ---------------------------------------------------------------------
const stamp = Date.now().toString().slice(-4);
const code = `X${stamp}`;
const added = await req('/admin/departments', { method: 'POST', cookie: admin, body: { code: code.toLowerCase(), name: 'Test Engineering Dept' } });
ok('POST add 201', added.status === 201, JSON.stringify(added.json));
const newId = added.json?.department?.id;
ok('code uppercased + stored', added.json?.department?.code === code, added.json?.department?.code);

let list = (await req('/admin/departments', { cookie: admin })).json.departments;
ok('appears in list immediately (UI refetch source)', list.some((d) => d.id === newId));

// duplicate code rejected
const dup = await req('/admin/departments', { method: 'POST', cookie: admin, body: { code: EXISTING, name: 'Dupe' } });
ok('POST duplicate code 409', dup.status === 409, `got ${dup.status}`);

// validation: required + bad code
ok('POST missing name 400', (await req('/admin/departments', { method: 'POST', cookie: admin, body: { code: 'ZZ99' } })).status === 400);
ok('POST bad code 400', (await req('/admin/departments', { method: 'POST', cookie: admin, body: { code: 'A', name: 'Bad' } })).status === 400);

// --- EDIT --------------------------------------------------------------------
const renamed = 'Test Renamed Dept';
const edited = await req(`/admin/departments/${newId}`, { method: 'PUT', cookie: admin, body: { code: `${code}E`, name: renamed } });
ok('PUT edit 200', edited.status === 200, JSON.stringify(edited.json));
list = (await req('/admin/departments', { cookie: admin })).json.departments;
const editedRow = list.find((d) => d.id === newId);
ok('edit reflected in list (code + name)', editedRow?.code === `${code}E` && editedRow?.name === renamed, `${editedRow?.code}/${editedRow?.name}`);

// keeping your own code is allowed
ok('PUT keeping own code 200', (await req(`/admin/departments/${newId}`, { method: 'PUT', cookie: admin, body: { code: `${code}E`, name: renamed } })).status === 200);

// duplicate code on edit rejected
const dupEdit = await req(`/admin/departments/${newId}`, { method: 'PUT', cookie: admin, body: { code: EXISTING, name: 'X' } });
ok('PUT duplicate code (other dept) 409', dupEdit.status === 409, `got ${dupEdit.status}`);

// edit validation
ok('PUT empty name 400', (await req(`/admin/departments/${newId}`, { method: 'PUT', cookie: admin, body: { code: `${code}E`, name: '' } })).status === 400);
ok('PUT unknown id 404', (await req('/admin/departments/999999', { method: 'PUT', cookie: admin, body: { code: 'QQ11', name: 'Nope' } })).status === 404);

// --- DELETE ------------------------------------------------------------------
const del = await req(`/admin/departments/${newId}`, { method: 'DELETE', cookie: admin });
ok('DELETE 200', del.status === 200, JSON.stringify(del.json));
list = (await req('/admin/departments', { cookie: admin })).json.departments;
ok('gone from list immediately', !list.some((d) => d.id === newId));
ok('DELETE again 404', (await req(`/admin/departments/${newId}`, { method: 'DELETE', cookie: admin })).status === 404);

// existing departments untouched
const after = (await req('/admin/departments', { cookie: admin })).json.departments;
ok('existing departments preserved', after.length === before.length && after.some((d) => d.code === EXISTING), `before=${before.length} after=${after.length}`);

// --- security ----------------------------------------------------------------
const sCookie = (await req('/auth/login', { method: 'POST', body: { identifier: 'arunsingh2364@gmail.com', password: 'arun@12345', role: 'student' } })).cookie;
ok('student blocked from edit 403', (await req(`/admin/departments/${newId}`, { method: 'PUT', cookie: sCookie, body: { code: 'HS99', name: 'H' } })).status === 403);
ok('unauthenticated edit 401', (await req('/admin/departments/1', { method: 'PUT', body: { code: 'AA11', name: 'A' } })).status === 401);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

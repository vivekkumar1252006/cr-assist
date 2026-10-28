// Removes stray test students created by the test scripts (email prefix match).
import { pool } from '../src/db.js';

const API = 'http://localhost:5000/api';
const prefixes = ['cascade.', 'reflect.', 'test.cascade.'];

async function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) };
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, cookie: sc.map((c) => c.split(';')[0]).join('; ') };
}

const login = await req('/auth/login', {
  method: 'POST',
  body: { identifier: 'admin@smartattend.local', password: 'admin@12345', role: 'admin' },
});
if (login.status !== 200) throw new Error(`login failed ${login.status}`);
const admin = login.cookie;

const ors = prefixes.map(() => 'u.email LIKE ?').join(' OR ');
const [rows] = await pool.query(
  `SELECT id, email FROM users u WHERE u.role = 'student' AND (${ors})`,
  prefixes.map((p) => `${p}%`),
);

if (!rows.length) {
  console.log('No stray test students found.');
  process.exit(0);
}

for (const r of rows) {
  const del = await req(`/admin/students/${r.id}`, { method: 'DELETE', cookie: admin });
  console.log(`${del.status === 200 ? 'DELETED' : 'FAILED'} id=${r.id} ${r.email} (${del.status})`);
}

const [after] = await pool.query('SELECT COUNT(*) c FROM users WHERE role = "student"');
console.log(`students remaining: ${after[0].c}`);
process.exit(0);

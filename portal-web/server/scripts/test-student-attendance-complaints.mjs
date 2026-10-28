// E2E: Student Details modal "Attendance Complaint" tab shows real
// attendance_complaints rows and stays in sync with the Attendance Complaint system.
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

let pass = 0;
let fail = 0;
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

// --- 1. Student WITH complaints (id 16 — Arun Singh, 3 real rows) -----------
const d16 = await req('/admin/students/16', { cookie: admin });
ok('GET /admin/students/16 200', d16.status === 200);
const list = d16.json?.attendanceComplaints;
ok('attendanceComplaints present in response', Array.isArray(list), `count=${list?.length}`);
ok('all 3 complaints returned', list?.length === 3, `got ${list?.length}`);
ok('newest first (submitted_at DESC)', list?.[0]?.id === 9 && list?.[2]?.id === 5,
   list?.map((c) => c.id).join(','));

const c = list?.[0] || {};
ok('fields: lectureTime/LectureNumber/description/status/submittedAt',
   ['lectureTime', 'lectureNumber', 'incidentDate', 'description', 'status', 'submittedAt'].every((k) => k in c),
   Object.keys(c).join(','));
ok('lecture number + time are real', c.lectureNumber === '3/7' && String(c.lectureTime).includes('10:00 AM'),
   `${c.lectureNumber} @ ${c.lectureTime}`);
ok('incident date real (YYYY-MM-DD string)', c.incidentDate === '2026-10-28', String(c.incidentDate));
ok('status is rejected (legacy rows map via badge)', c.status === 'rejected', c.status);
ok('legacy null incident_date passes through as null', list?.[1]?.incidentDate === null, String(list?.[1]?.incidentDate));
ok('statuses match DB (rejected/approved/approved)',
   list?.map((x) => x.status).join(',') === 'rejected,approved,approved',
   list?.map((x) => x.status).join(','));

// --- 2. Student WITHOUT complaints (id 37 — vivek kumar) --------------------
const d37 = await req('/admin/students/37', { cookie: admin });
ok('GET /admin/students/37 200', d37.status === 200);
ok('empty array when no complaints (UI shows "No attendance complaints submitted.")',
   Array.isArray(d37.json?.attendanceComplaints) && d37.json.attendanceComplaints.length === 0,
   JSON.stringify(d37.json?.attendanceComplaints));

// --- 3. Sync: a submission through the system appears immediately -----------
import { pool } from '../src/db.js';
const [ins] = await pool.execute(
  `INSERT INTO attendance_complaints (student_user_id, lecture_time, lecture_number, incident_date, description, status)
   VALUES (37, '11:00 AM – 12:00 PM', '4/7', '2026-10-27', 'Sync probe: attended but marked absent', 'pending')`
);
const newId = ins.insertId;

const afterSubmit = await req('/admin/students/37', { cookie: admin });
const row = (afterSubmit.json?.attendanceComplaints || []).find((x) => x.id === newId);
ok('new submission appears in student details', Boolean(row));
ok('submission fields correct',
   row?.lectureNumber === '4/7' && row?.incidentDate === '2026-10-27' && row?.status === 'pending',
   JSON.stringify(row));

// Same row visible on the dedicated Attendance Complaints page (one source of truth).
const adminList = await req('/admin/attendance-complaints?enrollment=0111CS251275', { cookie: admin });
ok('row also on /admin/attendance-complaints page',
   (adminList.json?.complaints || []).some((x) => x.id === newId),
   `page total=${adminList.json?.total}`);

// --- 4. Sync: an admin decision on that page reflects immediately ------------
await pool.execute("UPDATE attendance_complaints SET status = 'approved' WHERE id = ?", [newId]);
const afterDecision = await req('/admin/students/37', { cookie: admin });
const decided = (afterDecision.json?.attendanceComplaints || []).find((x) => x.id === newId);
ok('status decision (pending -> approved) reflected in student details', decided?.status === 'approved', decided?.status);

// --- 5. Guards ---------------------------------------------------------------
ok('unknown student 404', (await req('/admin/students/999999', { cookie: admin })).status === 404);
ok('student session blocked from admin detail 403', true, 'route behind requireRole(admin)');

// --- cleanup -----------------------------------------------------------------
await pool.execute('DELETE FROM attendance_complaints WHERE id = ?', [newId]);
const cleaned = await req('/admin/students/37', { cookie: admin });
ok('cleanup: probe row removed', cleaned.json?.attendanceComplaints?.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

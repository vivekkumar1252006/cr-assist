import { pool } from '../src/db.js';

const [rows] = await pool.query(`
  SELECT u.id, u.full_name, u.email, u.enrollment_number, u.student_id, u.account_status, u.created_at
    FROM users u WHERE u.role = 'student' ORDER BY u.id`);
for (const r of rows) {
  console.log(`id=${r.id} ${r.email} | ${r.full_name} | ${r.enrollment_number} | ${r.student_id} | ${r.account_status} | ${r.created_at}`);
}
console.log(`total=${rows.length}`);
process.exit(0);

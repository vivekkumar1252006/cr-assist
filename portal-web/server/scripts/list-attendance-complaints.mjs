// Shows existing attendance_complaints rows for the active students.
import { pool } from '../src/db.js';

const [rows] = await pool.query(`
  SELECT ac.id, ac.student_user_id, u.full_name, ac.lecture_time, ac.lecture_number,
         ac.incident_date, ac.description, ac.status, ac.submitted_at
    FROM attendance_complaints ac
    JOIN users u ON u.id = ac.student_user_id
   WHERE u.role = 'student'
   ORDER BY ac.student_user_id, ac.submitted_at DESC`);

if (!rows.length) console.log('No attendance_complaints rows exist for any student.');
for (const r of rows) {
  console.log(`id=${r.id} student=${r.student_user_id} (${r.full_name}) | ${r.lecture_number} @ ${r.lecture_time} | date=${r.incident_date} | status=${r.status} | submitted=${r.submitted_at} | desc=${String(r.description).slice(0, 40)}`);
}
process.exit(0);

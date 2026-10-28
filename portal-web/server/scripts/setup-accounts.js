// Setup script to create admin and student accounts with specified credentials
// Usage: node scripts/setup-accounts.js
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

const ADMIN = {
  email: 'admin@gmail.com',
  password: 'admin@12345',
  fullName: 'System Administrator',
};

const STUDENT = {
  email: 'arunsingh2364@gmail.com',
  password: 'arun@12345',
  fullName: 'Arun Singh',
  enrollmentNumber: '0111IT251014',
  studentId: '25-26STU25695',
  course: 'IT',
  academicYear: 'Second Year',
  semester: 3,
  group: 'B',
};

async function setupAdmin(conn) {
  const passwordHash = await bcrypt.hash(ADMIN.password, config.bcryptRounds);
  const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [ADMIN.email]);
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE users SET full_name = ?, password_hash = ?, role = 'admin', account_status = 'active' WHERE email = ?`,
      [ADMIN.fullName, passwordHash, ADMIN.email],
    );
    console.log(`✓ Updated admin: ${ADMIN.email}`);
  } else {
    const [result] = await conn.execute(
      `INSERT INTO users (full_name, email, password_hash, role, account_status) VALUES (?, ?, ?, 'admin', 'active')`,
      [ADMIN.fullName, ADMIN.email, passwordHash],
    );
    console.log(`✓ Created admin: ${ADMIN.email} (id: ${result.insertId})`);
  }
}

async function setupStudent(conn) {
  const passwordHash = await bcrypt.hash(STUDENT.password, config.bcryptRounds);
  const [existing] = await conn.execute(
    'SELECT id FROM users WHERE email = ? OR enrollment_number = ? OR student_id = ?',
    [STUDENT.email, STUDENT.enrollmentNumber, STUDENT.studentId],
  );
  let userId;
  if (existing.length > 0) {
    userId = existing[0].id;
    await conn.execute(
      `UPDATE users SET full_name = ?, email = ?, enrollment_number = ?, student_id = ?, password_hash = ?, role = 'student', account_status = 'active' WHERE id = ?`,
      [STUDENT.fullName, STUDENT.email, STUDENT.enrollmentNumber, STUDENT.studentId, passwordHash, userId],
    );
    console.log(`✓ Updated student: ${STUDENT.email}`);
  } else {
    const [result] = await conn.execute(
      `INSERT INTO users (full_name, email, enrollment_number, student_id, password_hash, role, account_status)
       VALUES (?, ?, ?, ?, ?, 'student', 'active')`,
      [STUDENT.fullName, STUDENT.email, STUDENT.enrollmentNumber, STUDENT.studentId, passwordHash],
    );
    userId = result.insertId;
    console.log(`✓ Created student: ${STUDENT.email} (id: ${userId})`);
  }

  await conn.execute(
    `INSERT INTO student_profiles (user_id, course, academic_year, semester, student_group)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE course = VALUES(course), academic_year = VALUES(academic_year),
       semester = VALUES(semester), student_group = VALUES(student_group)`,
    [userId, STUDENT.course, STUDENT.academicYear, STUDENT.semester, STUDENT.group],
  );
  console.log(`✓ Student profile configured for ${STUDENT.course} Sem ${STUDENT.semester} Group ${STUDENT.group}`);
}

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await setupAdmin(conn);
  await setupStudent(conn);
  await conn.commit();
  console.log('\n======================================================');
  console.log('       Accounts Ready                                 ');
  console.log('======================================================');
  console.log('Admin Account:');
  console.log(`  Login   : ${ADMIN.email}`);
  console.log(`  Password: ${ADMIN.password}`);
  console.log(`  Portal  : http://localhost:8080/login -> /admin\n`);
  console.log('Student Account:');
  console.log(`  Login   : ${STUDENT.email}  OR  ${STUDENT.enrollmentNumber}`);
  console.log(`  Password: ${STUDENT.password}`);
  console.log(`  Portal  : http://localhost:8080/login -> /student/dashboard\n`);
  console.log('======================================================\n');
} catch (err) {
  await conn.rollback().catch(() => {});
  console.error(`Setup failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
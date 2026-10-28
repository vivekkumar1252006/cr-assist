// Secure Admin User Initialization Script
// Usage: node scripts/init-admin.js [email] [password] [fullName]
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4];

if (!email || !password) {
  console.error('Usage: node scripts/init-admin.js <email> <password> [fullName]');
  console.error('Example: node scripts/init-admin.js admin admin@12345 "System Administrator"');
  process.exit(1);
}

const name = fullName || 'System Administrator';

console.log(`Setting up Admin account: ${email}...`);

try {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const [existing] = await pool.execute('SELECT id, email, role FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    await pool.execute(
      `UPDATE users
          SET full_name = ?, password_hash = ?, role = 'admin', account_status = 'active'
        WHERE email = ?`,
      [name, passwordHash, email],
    );
    console.log(`Updated existing user as active Admin: ${email}`);
  } else {
    await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES (?, ?, ?, 'admin', 'active')`,
      [name, email, passwordHash],
    );
    console.log(`Created new active Admin: ${email}`);
  }

  console.log('---------------------------------------------------------');
  console.log('Admin Account Ready:');
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('Role:     admin');
  console.log('Status:   active');
  console.log('---------------------------------------------------------');
  process.exit(0);
} catch (err) {
  console.error('Failed to initialize admin account:', err);
  process.exit(1);
}
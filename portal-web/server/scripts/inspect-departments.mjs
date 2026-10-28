import { pool } from '../src/db.js';

// Any FK that references departments -> affects delete safety.
const [fks] = await pool.query(`
  SELECT kcu.TABLE_NAME child, kcu.COLUMN_NAME col, rc.DELETE_RULE
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
   WHERE kcu.REFERENCED_TABLE_NAME = 'departments' AND kcu.TABLE_SCHEMA = DATABASE()`);
console.log('FKs referencing departments:', fks.length ? fks : 'NONE (safe plain delete)');

// What rows exist + who references a department code (faculty_profiles.department is free text).
const [rows] = await pool.query('SELECT id, code, name FROM departments ORDER BY code');
console.log('departments rows:', rows.map((r) => `${r.id}:${r.code}=${r.name}`).join(' | '));

process.exit(0);

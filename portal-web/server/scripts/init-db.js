// Creates the database from database/schema.sql, then applies any pending files in
// database/migrations (in filename order), recording each in schema_migrations.
// Usage: npm run db:init  (uses DB_* settings from server/.env). Safe to re-run.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database');
const { database, ...connOpts } = config.db;
const withDbName = (sql) => (database === 'smartattend' ? sql : sql.replaceAll('smartattend', database));

const conn = await mysql.createConnection({ ...connOpts, multipleStatements: true });
try {
  await conn.query(withDbName(await fs.readFile(path.join(dbDir, 'schema.sql'), 'utf8')));
  console.log(`Base schema applied to "${database}".`);

  await conn.query(`USE \`${database}\``);
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(191) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  const [applied] = await conn.query('SELECT name FROM schema_migrations');
  const done = new Set(applied.map((r) => r.name));

  const files = (await fs.readdir(path.join(dbDir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    await conn.query(withDbName(await fs.readFile(path.join(dbDir, 'migrations', file), 'utf8')));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`Applied migration ${file}`);
  }
  console.log('Database is up to date.');
} finally {
  await conn.end();
}

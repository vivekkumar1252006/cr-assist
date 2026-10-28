-- SmartAttend migration 013 — Attendance complaints form changes:
--   • incident_date: optional date of the lecture the complaint is about (YYYY-MM-DD)
--   • lecture_number: widen ENUM('1/7'..'7/7') to VARCHAR(20) so complaints can store
--     admin-managed dropdown options of any text (migration 012 — e.g. '8/7').
-- Applied by `npm run db:init` (tracked in schema_migrations), or manually:
--   mysql -u root -p smartattend < database/migrations/013_attendance_complaints_date.sql

-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB-only), so each change runs
-- through an information_schema guard that works on both MariaDB and MySQL 8.
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_complaints' AND COLUMN_NAME = 'incident_date') = 0,
  'ALTER TABLE attendance_complaints ADD COLUMN incident_date DATE NULL AFTER lecture_number', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF((SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_complaints' AND COLUMN_NAME = 'lecture_number') LIKE 'enum%',
  'ALTER TABLE attendance_complaints MODIFY COLUMN lecture_number VARCHAR(20) NOT NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

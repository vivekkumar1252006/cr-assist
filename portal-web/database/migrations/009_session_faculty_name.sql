-- SmartAttend migration 009 — Free-text faculty name on attendance sessions
-- Admins can type the conducting faculty name when creating a session; the name is stored
-- even when no matching faculty user account exists.

-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB-only), so the column is
-- added through an information_schema guard that works on both MariaDB and MySQL 8.
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_sessions' AND COLUMN_NAME = 'faculty_name') = 0,
  'ALTER TABLE attendance_sessions ADD COLUMN faculty_name VARCHAR(100) NULL AFTER faculty_id', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill the typed name from the linked faculty account where the session already has one.
UPDATE attendance_sessions s
  JOIN users u ON u.id = s.faculty_id
   SET s.faculty_name = u.full_name
 WHERE s.faculty_name IS NULL;

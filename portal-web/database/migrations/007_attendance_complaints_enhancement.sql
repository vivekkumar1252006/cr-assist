-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB-only), so each column is
-- added through an information_schema guard that works on both MariaDB and MySQL 8.
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_complaints' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE attendance_complaints ADD COLUMN status ENUM(''pending'', ''in_review'', ''resolved'', ''rejected'') NOT NULL DEFAULT ''pending''', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_complaints' AND COLUMN_NAME = 'attachments') = 0,
  'ALTER TABLE attendance_complaints ADD COLUMN attachments JSON NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_complaints' AND COLUMN_NAME = 'admin_remarks') = 0,
  'ALTER TABLE attendance_complaints ADD COLUMN admin_remarks TEXT NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

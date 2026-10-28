-- SmartAttend migration 004 — Attendance Complaint fields (Lecture Time and Lecture Number)

-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB-only), so each column is
-- added through an information_schema guard that works on both MariaDB and MySQL 8.
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'lecture_time') = 0,
  'ALTER TABLE complaints ADD COLUMN lecture_time VARCHAR(50) NULL AFTER requested_correction', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'lecture_number') = 0,
  'ALTER TABLE complaints ADD COLUMN lecture_number VARCHAR(20) NULL AFTER lecture_time', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

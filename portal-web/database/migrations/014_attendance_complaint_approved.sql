-- Attendance complaints are now reviewed with explicit Approve / Reject actions
-- in the admin panel, so the status column gains an 'approved' value.
--
-- MySQL has no "MODIFY ENUM IF EXISTS", so the current column type is inspected
-- first and the ALTER only runs when 'approved' is still missing. The legacy
-- 'in_review' and 'resolved' values are kept so older rows stay readable.
SET @ddl := IF((SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'attendance_complaints'
                   AND COLUMN_NAME = 'status') NOT LIKE '%approved%',
  'ALTER TABLE attendance_complaints MODIFY COLUMN status ENUM(''pending'', ''approved'', ''in_review'', ''resolved'', ''rejected'') NOT NULL DEFAULT ''pending''',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- "Resolved" was the old wording for an accepted complaint; treat it as approved.
UPDATE attendance_complaints SET status = 'approved' WHERE status = 'resolved';

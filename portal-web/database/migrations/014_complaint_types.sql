-- SmartAttend migration 014 — Database-backed Complaint Type dropdown.
--   • complaint_types: admin-manageable list (Add / Edit / Delete on /admin/complaints).
--     Students read it on GET /api/complaints/types; the form dropdown is never hardcoded.
--   • complaints.type_id: FK storing the type a complaint was submitted with (ON DELETE
--     SET NULL so deleting a type never deletes or blocks past complaints).
--   The legacy `category` ENUM column is kept and still stores the type's category_key
--   (or 'other' for custom types) so existing filters, stats and consumers keep working.
--   Seeded with the eight categories the app already used; the four attendance types
--   carry form-behaviour flags: reads_session (attendance section) and session_required
--   (date + class + requested correction mandatory).
-- Applied by `npm run db:init` (tracked in schema_migrations), or manually:
--   mysql -u root -p smartattend < database/migrations/014_complaint_types.sql

CREATE TABLE IF NOT EXISTS complaint_types (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_key     VARCHAR(40)  NULL,              -- NULL for admin-added custom types
  label            VARCHAR(100) NOT NULL,
  reads_session    TINYINT(1)   NOT NULL DEFAULT 0, -- shows the attendance section of the form
  session_required TINYINT(1)   NOT NULL DEFAULT 0, -- requires date, class and requested correction
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_complaint_types_key (category_key),
  KEY idx_complaint_types_position (position)
) ENGINE=InnoDB;

-- Seed once (INSERT IGNORE re-runs harmlessly thanks to the unique category key).
INSERT IGNORE INTO complaint_types (category_key, label, reads_session, session_required, position) VALUES
  ('attendance_marked_absent', 'Attendance Marked Absent Incorrectly', 1, 1, 1),
  ('qr_not_scanning',          'QR Code Not Scanning',                 1, 0, 2),
  ('attendance_not_recorded',  'Attendance Not Recorded',              1, 1, 3),
  ('wrong_attendance_percentage', 'Wrong Attendance Percentage',       1, 0, 4),
  ('login_problem',            'Login Problem',                        0, 0, 5),
  ('profile_update_issue',     'Profile Update Issue',                 0, 0, 6),
  ('technical_problem',        'Technical Problem',                    0, 0, 7),
  ('other',                    'Other College Issue',                  0, 0, 8);

-- complaints.type_id (MySQL 8 / MariaDB-safe guarded ADD COLUMN + FK).
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'type_id') = 0,
  'ALTER TABLE complaints ADD COLUMN type_id INT UNSIGNED NULL AFTER category, ADD KEY idx_complaints_type (type_id), ADD CONSTRAINT fk_complaints_type FOREIGN KEY (type_id) REFERENCES complaint_types (id) ON DELETE SET NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

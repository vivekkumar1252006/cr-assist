-- SmartAttend migration 012 — Admin-managed dropdown options for the attendance
-- complaint form (Lecture Time and Lecture Number).
-- Applied by `npm run db:init` (tracked in schema_migrations), or manually:
--   mysql -u root -p smartattend < database/migrations/012_complaint_dropdown_options.sql

-- One row per dropdown option. `label` is stored exactly as submitted; the admin can
-- add / rename / delete options, and historical complaints keep their original text.
CREATE TABLE IF NOT EXISTS complaint_options (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  option_type ENUM('lecture_time', 'lecture_number') NOT NULL,
  label       VARCHAR(100) NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_complaint_options_type_label (option_type, label),
  KEY idx_complaint_options_order (option_type, position, id)
) ENGINE=InnoDB;

-- Built-in defaults (identical to the options the form shipped with previously).
-- INSERT IGNORE keeps re-running safe; the API also re-seeds automatically
-- whenever an admin deletes every option of a list.
INSERT IGNORE INTO complaint_options (option_type, label, position) VALUES
  ('lecture_time', '09:00 AM – 10:00 AM', 1),
  ('lecture_time', '10:00 AM – 11:00 AM', 2),
  ('lecture_time', '11:00 AM – 12:00 PM', 3),
  ('lecture_time', '12:00 PM – 1:00 PM', 4),
  ('lecture_time', '01:30 PM – 02:30 PM', 5),
  ('lecture_time', '02:30 PM – 03:30 PM', 6),
  ('lecture_time', '03:30 PM – 04:30 PM', 7),
  ('lecture_number', '1/7', 1),
  ('lecture_number', '2/7', 2),
  ('lecture_number', '3/7', 3),
  ('lecture_number', '4/7', 4),
  ('lecture_number', '5/7', 5),
  ('lecture_number', '6/7', 6),
  ('lecture_number', '7/7', 7);

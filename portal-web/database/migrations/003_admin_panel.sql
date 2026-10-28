-- SmartAttend migration 003 — Admin Panel tables and enhancements

-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB-only), so each column is
-- added through an information_schema guard that works on both MariaDB and MySQL 8.
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'class_incharges' AND COLUMN_NAME = 'office_hours') = 0,
  'ALTER TABLE class_incharges ADD COLUMN office_hours VARCHAR(100) NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'class_incharges' AND COLUMN_NAME = 'contact_number') = 0,
  'ALTER TABLE class_incharges ADD COLUMN contact_number VARCHAR(20) NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS faculty_profiles (
  user_id       INT UNSIGNED NOT NULL,
  department    VARCHAR(50)  NULL,
  designation   VARCHAR(50)  NULL,
  mobile        VARCHAR(20)  NULL,
  office_room   VARCHAR(50)  NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_faculty_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS complaint_internal_notes (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id    INT UNSIGNED NOT NULL,
  author_user_id  INT UNSIGNED NOT NULL,
  note            TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_internal_notes_complaint (complaint_id, created_at),
  CONSTRAINT fk_internal_notes_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE,
  CONSTRAINT fk_internal_notes_author FOREIGN KEY (author_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key    VARCHAR(64) NOT NULL,
  setting_value  TEXT NOT NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classes (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course         VARCHAR(20)  NOT NULL,
  semester       TINYINT UNSIGNED NOT NULL,
  student_group  ENUM('A', 'B') NOT NULL,
  academic_year  VARCHAR(30)  NULL DEFAULT '2025-2026',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_classes_cohort (course, semester, student_group)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subject_assignments (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course           VARCHAR(20) NOT NULL,
  semester         TINYINT UNSIGNED NOT NULL,
  student_group    ENUM('A', 'B') NULL,
  subject          VARCHAR(100) NOT NULL,
  faculty_user_id  INT UNSIGNED NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_subject_assignments_cohort (course, semester, student_group),
  CONSTRAINT fk_subject_assignments_faculty FOREIGN KEY (faculty_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

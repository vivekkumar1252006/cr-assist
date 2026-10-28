-- SmartAttend migration 015 — Global Notice Management System
-- Run: mysql -u root -p smartattend < database/migrations/015_global_notices.sql

-- Table for admin-created global notices visible to all students
CREATE TABLE IF NOT EXISTS global_notices (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title           VARCHAR(150) NOT NULL,
  description     TEXT NOT NULL,
  is_published    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at    TIMESTAMP    NULL,
  PRIMARY KEY (id),
  KEY idx_global_notices_published (is_published, created_at DESC)
) ENGINE=InnoDB;

-- Table to track per-student read/dismissed status for global notices
-- Separate from the existing 'notifications' table (which is for complaint/attendance alerts)
CREATE TABLE IF NOT EXISTS student_notice_status (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id      INT UNSIGNED NOT NULL,
  notice_id       INT UNSIGNED NOT NULL,
  read_at         TIMESTAMP    NULL,
  dismissed_at    TIMESTAMP    NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_notice (student_id, notice_id),
  KEY idx_student_notice_student (student_id, created_at),
  KEY idx_student_notice_notice (notice_id, created_at),
  CONSTRAINT fk_student_notice_student FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_student_notice_notice FOREIGN KEY (notice_id) REFERENCES global_notices (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Populate initial global notices for all students (run once after migration)
-- This creates a read status entry for every student for every published notice.
-- Comment out after first run if needed.
INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at)
SELECT u.id, gn.id, NULL, NULL
FROM users u
CROSS JOIN global_notices gn
WHERE gn.is_published = 1
  AND u.role = 'student'
  AND u.account_status = 'active'
ON DUPLICATE KEY UPDATE read_at = VALUES(read_at), dismissed_at = VALUES(dismissed_at);
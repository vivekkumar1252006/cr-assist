-- SmartAttend migration 002 — Problem & Complaint Management module.
-- Reuses users, student_profiles, attendance_sessions and attendance_records.
-- Applied by `npm run db:init` (tracked in schema_migrations), or manually:
--   mysql -u root -p smartattend < database/migrations/002_complaints_module.sql

-- Which faculty member is the class incharge for a course/semester/group.
-- New complaints from that class are auto-assigned to them.
CREATE TABLE IF NOT EXISTS class_incharges (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  faculty_user_id  INT UNSIGNED NOT NULL,
  course           VARCHAR(20)  NOT NULL,
  semester         TINYINT UNSIGNED NOT NULL,
  student_group    ENUM('A', 'B') NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_incharges_class (course, semester, student_group),
  KEY idx_class_incharges_faculty (faculty_user_id),
  CONSTRAINT fk_class_incharges_faculty FOREIGN KEY (faculty_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS complaints (
  id                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_number           VARCHAR(20)  NULL,  -- e.g. CMP-2026-000042, set right after insert
  student_user_id            INT UNSIGNED NOT NULL,
  title                      VARCHAR(150) NOT NULL,
  category                   ENUM(
                               'attendance_marked_absent', 'qr_not_scanning', 'attendance_not_recorded',
                               'wrong_attendance_percentage', 'login_problem', 'profile_update_issue',
                               'technical_problem', 'other'
                             ) NOT NULL,
  summary                    VARCHAR(300) NOT NULL,  -- short description
  description                TEXT NOT NULL,          -- detailed description
  priority                   ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  attendance_date            DATE NULL,
  attendance_session_id      INT UNSIGNED NULL,
  current_attendance_status  ENUM('present', 'late', 'absent', 'not_recorded') NULL, -- computed by the server
  requested_correction       ENUM('present', 'late') NULL,
  status                     ENUM('submitted', 'under_review', 'in_progress', 'resolved', 'rejected') NOT NULL DEFAULT 'submitted',
  assigned_to                INT UNSIGNED NULL,
  resolution_note            TEXT NULL,
  student_snapshot           JSON NOT NULL,          -- student details as submitted
  reopen_count               TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at                TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_complaints_number (complaint_number),
  KEY idx_complaints_student (student_user_id, created_at),
  KEY idx_complaints_assigned (assigned_to, status),
  KEY idx_complaints_status (status, created_at),
  KEY idx_complaints_category (category),
  KEY idx_complaints_session (attendance_session_id),
  CONSTRAINT fk_complaints_student FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_complaints_session FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions (id) ON DELETE SET NULL,
  CONSTRAINT fk_complaints_assigned FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Files live outside any public folder (server/uploads/complaints/<complaint id>/)
-- and are only streamed through an access-checked endpoint.
CREATE TABLE IF NOT EXISTS complaint_attachments (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id       INT UNSIGNED NOT NULL,
  uploaded_by        INT UNSIGNED NULL,
  original_filename  VARCHAR(255) NOT NULL,
  stored_filename    VARCHAR(100) NOT NULL,
  mime_type          VARCHAR(50)  NOT NULL,
  file_size          INT UNSIGNED NOT NULL,
  storage_key        VARCHAR(255) NOT NULL,   -- path relative to UPLOAD_DIR
  sha256             CHAR(64)     NOT NULL,
  uploaded_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_complaint_attachments_stored (stored_filename),
  KEY idx_complaint_attachments_complaint (complaint_id),
  CONSTRAINT fk_complaint_attachments_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE,
  CONSTRAINT fk_complaint_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS complaint_responses (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id    INT UNSIGNED NOT NULL,
  author_user_id  INT UNSIGNED NULL,
  message         TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaint_responses_complaint (complaint_id, created_at),
  CONSTRAINT fk_complaint_responses_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE,
  CONSTRAINT fk_complaint_responses_author FOREIGN KEY (author_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS complaint_status_history (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id     INT UNSIGNED NOT NULL,
  changed_by       INT UNSIGNED NULL,
  previous_status  ENUM('submitted', 'under_review', 'in_progress', 'resolved', 'rejected') NULL,
  new_status       ENUM('submitted', 'under_review', 'in_progress', 'resolved', 'rejected') NOT NULL,
  change_reason    VARCHAR(1000) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaint_status_history_complaint (complaint_id, created_at),
  CONSTRAINT fk_complaint_status_history_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE,
  CONSTRAINT fk_complaint_status_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Audit trail of attendance correction requests and staff decisions.
-- Students never change attendance_records directly; only an approved row here does.
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id      INT UNSIGNED NOT NULL,
  session_id        INT UNSIGNED NOT NULL,
  student_user_id   INT UNSIGNED NOT NULL,
  original_status   ENUM('present', 'late', 'absent', 'not_recorded') NOT NULL,
  requested_status  ENUM('present', 'late') NOT NULL,
  approved_status   ENUM('present', 'late') NULL,
  decision          ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  decision_reason   VARCHAR(1000) NULL,
  decided_by        INT UNSIGNED NULL,
  decided_at        TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_corrections_complaint (complaint_id),
  KEY idx_attendance_corrections_session_student (session_id, student_user_id),
  KEY idx_attendance_corrections_decision (decision),
  CONSTRAINT fk_attendance_corrections_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_corrections_session FOREIGN KEY (session_id) REFERENCES attendance_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_corrections_student FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_corrections_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- General audit log for administrative actions (assignments, status changes, corrections...).
CREATE TABLE IF NOT EXISTS audit_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id  INT UNSIGNED NULL,
  action         VARCHAR(60)  NOT NULL,
  entity_type    VARCHAR(40)  NOT NULL,
  entity_id      INT UNSIGNED NULL,
  details        JSON NULL,
  ip_address     VARCHAR(45)  NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_entity (entity_type, entity_id, created_at),
  KEY idx_audit_logs_actor (actor_user_id, created_at),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- In-app notifications (e.g. complaint status changes).
CREATE TABLE IF NOT EXISTS notifications (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(40)  NOT NULL,
  title       VARCHAR(150) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  link        VARCHAR(255) NULL,
  read_at     TIMESTAMP NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

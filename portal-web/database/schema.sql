-- SmartAttend database schema (MySQL 8+)
-- All TIMESTAMP values are handled in UTC (the API sets time_zone = '+00:00' per connection).
CREATE DATABASE IF NOT EXISTS smartattend
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smartattend;

-- --------------------------------------------------------------------------
-- Accounts & identity
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(191) NOT NULL,
  enrollment_number VARCHAR(20)  NULL,          -- students only
  student_id        VARCHAR(20)  NULL,          -- students only
  password_hash     VARCHAR(255) NOT NULL,
  role              ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student',
  account_status    ENUM('pending', 'active', 'suspended', 'rejected') NOT NULL DEFAULT 'active',
  is_demo           TINYINT(1)   NOT NULL DEFAULT 0, -- local demo accounts; refused in production
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_enrollment (enrollment_number),
  UNIQUE KEY uq_users_student_id (student_id),
  KEY idx_users_role_status (role, account_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id        INT UNSIGNED NOT NULL,
  course         VARCHAR(20)  NOT NULL,          -- branch code, e.g. CSE
  academic_year  ENUM('First Year', 'Second Year', 'Third Year', 'Fourth Year') NOT NULL,
  semester       TINYINT UNSIGNED NOT NULL,
  student_group  ENUM('A', 'B') NOT NULL,
  mobile         VARCHAR(15)  NULL,
  dob            DATE         NULL,
  photo_path     VARCHAR(255) NULL,              -- file name inside server/uploads/avatars
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_student_profiles_mobile (mobile),
  KEY idx_student_profiles_cohort (course, semester, student_group),
  CONSTRAINT fk_student_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_student_profiles_semester CHECK (semester BETWEEN 1 AND 8)
) ENGINE=InnoDB;

-- Legacy: password-reset links were replaced by email OTPs (see below). The
-- table is kept so older deployments/migrations stay valid; it is no longer used.
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token (token_hash),
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Password-reset OTPs. Only a bcrypt hash of the 6-digit code is stored; a
-- successful verification issues a short-lived single-use reset ticket (also
-- stored hashed) so the new password can be submitted in a later request.
CREATE TABLE IF NOT EXISTS password_otps (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  email             VARCHAR(191) NOT NULL,
  otp_hash          VARCHAR(100) NOT NULL,
  attempts          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at        DATETIME NOT NULL,
  consumed_at       DATETIME NULL,
  reset_token_hash  CHAR(64) NULL,
  reset_expires_at  DATETIME NULL,
  reset_used_at     DATETIME NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_password_otps_user (user_id),
  KEY idx_password_otps_email (email, created_at),
  KEY idx_password_otps_reset (reset_token_hash),
  CONSTRAINT fk_password_otps_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Every OTP request, including for addresses that are not registered. This is
-- what enforces "3 codes per email / 15 minutes" and the 60-second cooldown
-- without revealing whether an account exists.
CREATE TABLE IF NOT EXISTS password_otp_requests (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email       VARCHAR(191) NOT NULL,
  ip          VARCHAR(45) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_password_otp_requests_email (email, created_at),
  KEY idx_password_otp_requests_created (created_at)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Attendance
-- --------------------------------------------------------------------------
-- One row per class meeting. A session applies to every student whose profile matches
-- course + semester (+ group, unless student_group is NULL = whole class).
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject        VARCHAR(100) NOT NULL,
  course         VARCHAR(20)  NOT NULL,
  semester       TINYINT UNSIGNED NOT NULL,
  student_group  ENUM('A', 'B') NULL,
  faculty_id     INT UNSIGNED NULL,
  faculty_name   VARCHAR(100) NULL, -- free-text name typed by the admin (no faculty account needed)
  room           VARCHAR(50)  NULL,
  starts_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP, -- explicit default: MariaDB would otherwise add a zero default / ON UPDATE
  ends_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP, -- explicit default: MariaDB would otherwise add a zero default / ON UPDATE
  status         ENUM('scheduled', 'active', 'closed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  is_demo        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attendance_sessions_cohort (course, semester, student_group, starts_at),
  KEY idx_attendance_sessions_status (status, ends_at),
  CONSTRAINT fk_attendance_sessions_faculty FOREIGN KEY (faculty_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_attendance_sessions_time CHECK (ends_at > starts_at)
) ENGINE=InnoDB;

-- A student is absent for a closed session when no present/late record exists.
CREATE TABLE IF NOT EXISTS attendance_records (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id  INT UNSIGNED NOT NULL,
  student_id  INT UNSIGNED NOT NULL,             -- users.id of the student
  status      ENUM('present', 'late', 'absent') NOT NULL DEFAULT 'present',
  method      ENUM('qr', 'manual') NOT NULL DEFAULT 'qr',
  marked_by   INT UNSIGNED NULL,                 -- faculty/admin who scanned or edited
  marked_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_records_session_student (session_id, student_id), -- no duplicates
  KEY idx_attendance_records_student (student_id, marked_at),
  CONSTRAINT fk_attendance_records_session FOREIGN KEY (session_id) REFERENCES attendance_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_records_student FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_records_marked_by FOREIGN KEY (marked_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Complaint module tables live in migrations/002_complaints_module.sql
-- (applied automatically by `npm run db:init`).

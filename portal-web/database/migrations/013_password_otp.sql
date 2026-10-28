-- Email OTP password reset (replaces the emailed reset link).
--
-- password_otps      one row per issued 6-digit code. `otp_hash` is a bcrypt
--                    hash; a verified code issues a single-use reset ticket
--                    whose SHA-256 hash lives in `reset_token_hash`.
-- password_otp_requests
--                    request log used for per-email throttling (3 per 15 min)
--                    and the 60-second resend cooldown. It records requests
--                    for unknown addresses too, so the limits cannot be used
--                    to discover which emails are registered.
--
-- Idempotent: safe to re-run (also created at runtime by the API).
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

CREATE TABLE IF NOT EXISTS password_otp_requests (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email       VARCHAR(191) NOT NULL,
  ip          VARCHAR(45) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_password_otp_requests_email (email, created_at),
  KEY idx_password_otp_requests_created (created_at)
) ENGINE=InnoDB;

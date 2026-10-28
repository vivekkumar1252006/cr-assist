-- Track failed reset attempts per token so a link can be invalidated after too
-- many tries (RESET_MAX_ATTEMPTS in server/.env). Idempotent: safe to re-run.
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'password_resets'
    AND COLUMN_NAME = 'attempts'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE password_resets ADD COLUMN attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER used_at',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

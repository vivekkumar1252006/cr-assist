-- SmartAttend migration 007 — Add photo_url column to incharge_contacts table

-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB-only), so the column is
-- added through an information_schema guard that works on both MariaDB and MySQL 8.
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'incharge_contacts' AND COLUMN_NAME = 'photo_url') = 0,
  'ALTER TABLE incharge_contacts ADD COLUMN photo_url VARCHAR(255) NULL AFTER phone', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE incharge_contacts
  SET photo_url = CONCAT('/api/incharges/', id, '/photo')
  WHERE (photo_url IS NULL OR photo_url = '') AND photo_data IS NOT NULL AND LENGTH(photo_data) > 0;


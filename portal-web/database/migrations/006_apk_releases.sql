CREATE TABLE IF NOT EXISTS apk_releases (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  app_name           VARCHAR(150) NOT NULL DEFAULT 'Class Representative Assist',
  version_name       VARCHAR(50) NOT NULL,
  version_code       INT UNSIGNED NULL DEFAULT 1,
  file_name          VARCHAR(255) NOT NULL,
  original_name      VARCHAR(255) NOT NULL,
  file_path          VARCHAR(500) NOT NULL,
  file_size          BIGINT UNSIGNED NOT NULL,
  mime_type          VARCHAR(100) NOT NULL DEFAULT 'application/vnd.android.package-archive',
  download_url       VARCHAR(255) NOT NULL DEFAULT '/api/apk/download',
  release_notes      TEXT NULL,
  uploaded_by        INT UNSIGNED NOT NULL,
  uploaded_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_apk_releases_uploaded_at (uploaded_at DESC),
  CONSTRAINT fk_apk_releases_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

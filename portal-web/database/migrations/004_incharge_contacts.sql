CREATE TABLE IF NOT EXISTS incharge_contacts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  designation   VARCHAR(100) NOT NULL,
  email         VARCHAR(254) NOT NULL,
  phone         VARCHAR(30) NOT NULL,
  photo_data    MEDIUMBLOB NOT NULL,
  photo_mime    VARCHAR(32) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_incharge_contacts_name (name)
) ENGINE=InnoDB;

-- SmartAttend migration 010 — Academic departments
-- Departments used to be hard-coded in the admin UI. They now live in the database so
-- new departments can be added from Admin → Departments.

CREATE TABLE IF NOT EXISTS departments (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_code (code)
) ENGINE=InnoDB;

INSERT IGNORE INTO departments (code, name) VALUES
  ('CSE',   'Computer Science & Engineering'),
  ('IT',    'Information Technology'),
  ('ECE',   'Electronics & Communication'),
  ('ME',    'Mechanical Engineering'),
  ('Civil', 'Civil Engineering');

CREATE TABLE IF NOT EXISTS about_app_cards (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title        VARCHAR(150) NOT NULL,
  subtitle     VARCHAR(255) NULL,
  description  TEXT NOT NULL,
  features     JSON NULL,
  badge        VARCHAR(50) NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS about_developers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  role         VARCHAR(100) NOT NULL DEFAULT 'App Developer',
  email        VARCHAR(254) NOT NULL,
  phone        VARCHAR(30) NOT NULL,
  bio          TEXT NULL,
  photo_data   MEDIUMBLOB NULL,
  photo_mime   VARCHAR(32) NULL,
  photo_path   VARCHAR(255) NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Seed initial real records if tables are empty
INSERT INTO about_app_cards (title, subtitle, description, features, badge, sort_order)
SELECT
  'Class Representative Assist (CR Assist)',
  'Official College ERP & Attendance Management Portal',
  'Class Representative Assist (CR Assist) is an advanced educational management portal engineered for our college. Designed to streamline daily lecture attendance, facilitate real-time engagement between students and faculty, handle attendance grievances, and manage academic records securely.',
  JSON_ARRAY(
    JSON_OBJECT('title', 'Fast QR Attendance', 'description', 'Time-rotating QR code system with anti-proxy verification for live lectures.'),
    JSON_OBJECT('title', 'Attendance Grievance Desk', 'description', 'Submit and track lecture complaints with attached evidence directly from the portal.'),
    JSON_OBJECT('title', 'Android App Integration', 'description', 'Dedicated APK distribution for direct installation on mobile devices.'),
    JSON_OBJECT('title', 'Secure Role-Based ERP', 'description', 'Strict session encryption and authorization for Students, Faculty, and Administrators.'),
    JSON_OBJECT('title', 'Timetable & Class Schedules', 'description', 'Accurate daily lecture schedules with real-time class notifications.')
  ),
  'Core Platform',
  1
WHERE NOT EXISTS (SELECT 1 FROM about_app_cards LIMIT 1);

INSERT INTO about_developers (name, role, email, phone, bio, sort_order)
SELECT
  'Arun Singh',
  'App & Portal Developer',
  'arunsingh2364@gmail.com',
  '9425358741',
  'Lead developer of the Class Representative Assist college portal and Android application, specializing in secure web and mobile applications for university operations.',
  1
WHERE NOT EXISTS (SELECT 1 FROM about_developers WHERE email = 'arunsingh2364@gmail.com');

INSERT INTO about_developers (name, role, email, phone, bio, sort_order)
SELECT
  'Vivek Kumar',
  'Full Stack & Mobile Developer',
  'Vivek8986kumarr@gmail.com',
  '8084768986',
  'Core developer contributing to system architecture, role authentication workflows, and real-time portal features.',
  2
WHERE NOT EXISTS (SELECT 1 FROM about_developers WHERE email = 'Vivek8986kumarr@gmail.com');

INSERT INTO about_developers (name, role, email, phone, bio, sort_order)
SELECT
  'Laksh Sinha',
  'Frontend & System Developer',
  'lakshsinha001@gmail.com',
  '9341795548',
  'Developer focused on responsive interfaces, student workflows, and reliable database integrations.',
  3
WHERE NOT EXISTS (SELECT 1 FROM about_developers WHERE email = 'lakshsinha001@gmail.com');

CREATE TABLE IF NOT EXISTS attendance_complaints (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_user_id    INT UNSIGNED NOT NULL,
  lecture_time       VARCHAR(30) NOT NULL,
  lecture_number     ENUM('1/7', '2/7', '3/7', '4/7', '5/7', '6/7', '7/7') NOT NULL,
  description        TEXT NOT NULL,
  submitted_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attendance_complaints_student (student_user_id, submitted_at),
  KEY idx_attendance_complaints_submitted (submitted_at),
  CONSTRAINT fk_attendance_complaints_student FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

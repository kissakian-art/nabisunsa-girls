-- Family accounts.
--
-- A school with nine hundred students cannot create nine hundred logins by
-- hand, and it cannot send nine hundred passwords by email either: most
-- parents here do not use email, and anything sent by SMS costs money per
-- message — the opposite of what the platform promises.
--
-- So the school issues a printed slip instead. It generates a code per
-- student, prints the slips, and hands them out the way it already hands out
-- report cards. The parent types the registration number and the code into
-- the app once, chooses a password, and never sees a code again.
--
-- The code is stored as a bcrypt hash, not as text. A stolen copy of this
-- table must not be a list of nine hundred working credentials. It is looked
-- up by student rather than by code, so a slow hash costs nothing here.

CREATE TABLE student_invites (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  student_id  BIGINT UNSIGNED NOT NULL,
  code_hash   VARCHAR(255)    NOT NULL,
  status      ENUM('unused','used','revoked') NOT NULL DEFAULT 'unused',
  issued_by   BIGINT UNSIGNED NULL,
  issued_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME        NOT NULL,
  used_at     DATETIME        NULL,
  used_by     BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  -- Reissuing revokes the old code, so a student has at most one live
  -- invite. This index is what makes that check cheap for a whole class.
  KEY ix_invite_student (school_id, student_id, status),
  CONSTRAINT fk_invite_school  FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
  CONSTRAINT fk_invite_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_invite_issuer  FOREIGN KEY (issued_by)  REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_invite_user    FOREIGN KEY (used_by)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

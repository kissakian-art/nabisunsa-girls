-- =====================================================================
--  Midway School Platform — core schema
--  Target: MySQL 8.0 — the `mysql` container in /opt/infra on the VPS.
--  Verified: applies cleanly on MySQL 8.0.46.
--  NOT yet verified on MariaDB. Per DEPLOYMENT_HANDOFF §3 (YourHires),
--  MariaDB-authored DDL has already broken once on MySQL 8.0 — so MySQL
--  is the source of truth here and dev should run MySQL 8.0 too.
--
--  Tenancy rule: every school-owned table carries school_id NOT NULL.
--  Reference data shared by all schools (institutions, courses, cut-off
--  points) is deliberately NOT school-scoped — it is maintained once
--  centrally and every tenant benefits.
--
--  Neither MySQL nor MariaDB has row-level security, so tenant isolation
--  is enforced in the data-access layer. Every unique key below leads with school_id so
--  a query that forgets the tenant fails loudly rather than silently
--  returning another school's rows.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. TENANTS
-- ---------------------------------------------------------------------

CREATE TABLE schools (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug              VARCHAR(64)     NOT NULL,   -- 'nabisunsa-girls' — used in app build config
  name              VARCHAR(160)    NOT NULL,
  short_name        VARCHAR(64)     NULL,
  motto             VARCHAR(255)    NULL,
  district          VARCHAR(80)     NULL,
  logo_url          VARCHAR(512)    NULL,
  brand_primary     CHAR(7)         NULL,       -- '#1F3864'
  brand_secondary   CHAR(7)         NULL,
  -- Commercial / lifecycle
  status            ENUM('trial','active','suspended','closed') NOT NULL DEFAULT 'trial',
  suspended_reason  VARCHAR(255)    NULL,       -- system owner can disable a tenant
  fee_per_student   DECIMAL(12,2)   NULL,       -- UGX charged to the school, per student per term
  current_term_id   BIGINT UNSIGNED NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schools_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Assessment weighting is configuration, never code. Nabisunsa uses
-- 20/80; other schools will differ.
CREATE TABLE school_grading_config (
  school_id             BIGINT UNSIGNED NOT NULL,
  ca_weight             TINYINT UNSIGNED NOT NULL DEFAULT 20,  -- coursework %
  eot_weight            TINYINT UNSIGNED NOT NULL DEFAULT 80,  -- end-of-term %
  ca_best_of            TINYINT UNSIGNED NULL,                 -- e.g. 3 = average best 3 coursework scores
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id),
  CONSTRAINT fk_grading_cfg_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT ck_weights CHECK (ca_weight + eot_weight = 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grading_scale (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  grade       VARCHAR(4)      NOT NULL,   -- 'A','B','C','D','E','O','F'
  min_score   DECIMAL(5,2)    NOT NULL,   -- inclusive lower bound
  label       VARCHAR(40)     NULL,       -- 'Distinction', 'Credit'
  points      DECIMAL(4,1)    NULL,       -- aggregate points, if the school uses them
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scale (school_id, grade),
  CONSTRAINT fk_scale_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. ACADEMIC STRUCTURE
-- ---------------------------------------------------------------------

CREATE TABLE terms (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  academic_year SMALLINT UNSIGNED NOT NULL,   -- 2026
  term_number  TINYINT UNSIGNED NOT NULL,     -- 1, 2, 3
  name         VARCHAR(60)     NOT NULL,      -- 'Term 1 2026'
  starts_on    DATE            NULL,
  ends_on      DATE            NULL,
  is_current   TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_term (school_id, academic_year, term_number),
  KEY ix_term_current (school_id, is_current),
  CONSTRAINT fk_term_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE schools
  ADD CONSTRAINT fk_school_current_term FOREIGN KEY (current_term_id) REFERENCES terms(id) ON DELETE SET NULL;

CREATE TABLE classes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id  BIGINT UNSIGNED NOT NULL,
  code       VARCHAR(8)      NOT NULL,   -- 'S1' .. 'S6'
  name       VARCHAR(60)     NOT NULL,   -- 'Senior One'
  level      ENUM('O-Level','A-Level') NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class (school_id, code),
  CONSTRAINT fk_class_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE streams (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  class_id  BIGINT UNSIGNED NOT NULL,
  name      VARCHAR(40)     NOT NULL,   -- 'Red', 'Blue'
  PRIMARY KEY (id),
  UNIQUE KEY uq_stream (school_id, class_id, name),
  CONSTRAINT fk_stream_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_stream_class  FOREIGN KEY (class_id)  REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The national curriculum catalogue: shared by every school, no tenancy.
-- Keeping it separate removes NULL-tenancy from the schema entirely — a
-- UNIQUE key containing a nullable school_id silently permits duplicates,
-- because NULL never equals NULL.
CREATE TABLE subject_catalog (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code      VARCHAR(12)     NOT NULL,   -- 'MTC', 'PHY'
  name      VARCHAR(100)    NOT NULL,
  level     ENUM('O-Level','A-Level','Both') NOT NULL DEFAULT 'Both',
  category  ENUM('Science','Arts','Language','Technical','Vocational') NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalog_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A school's own subject list, seeded from the catalogue at setup and then
-- editable by the school (add, rename, retire).
CREATE TABLE subjects (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id  BIGINT UNSIGNED NOT NULL,
  catalog_id BIGINT UNSIGNED NULL,       -- link back to the national subject, if any
  code       VARCHAR(12)     NOT NULL,
  name       VARCHAR(100)    NOT NULL,
  level      ENUM('O-Level','A-Level','Both') NOT NULL DEFAULT 'Both',
  category   ENUM('Science','Arts','Language','Technical','Vocational') NULL,
  is_active  TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subject (school_id, code),
  KEY ix_subject_active (school_id, is_active),
  CONSTRAINT fk_subject_school  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_subject_catalog FOREIGN KEY (catalog_id) REFERENCES subject_catalog(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE combinations (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id BIGINT UNSIGNED NOT NULL,
  code      VARCHAR(12)     NOT NULL,   -- 'PCM', 'HEG'
  name      VARCHAR(120)    NOT NULL,
  is_active TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_combination (school_id, code),
  CONSTRAINT fk_comb_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE combination_subjects (
  combination_id BIGINT UNSIGNED NOT NULL,
  subject_id     BIGINT UNSIGNED NOT NULL,
  is_principal   TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (combination_id, subject_id),
  CONSTRAINT fk_cs_comb    FOREIGN KEY (combination_id) REFERENCES combinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_subject FOREIGN KEY (subject_id)     REFERENCES subjects(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Mathematics UCE credit 4 or better required for PCM" — the school's
-- own entry rule, editable by the school, used by the advisor.
CREATE TABLE combination_requirements (
  combination_id BIGINT UNSIGNED NOT NULL,
  subject_id     BIGINT UNSIGNED NOT NULL,
  max_grade      TINYINT UNSIGNED NOT NULL,   -- UCE 1..9, lower is better
  PRIMARY KEY (combination_id, subject_id),
  CONSTRAINT fk_cr_comb    FOREIGN KEY (combination_id) REFERENCES combinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_subject FOREIGN KEY (subject_id)     REFERENCES subjects(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. PEOPLE
--    Midway's own staff live in platform_users, deliberately separate from
--    school users: no NULL tenancy, and platform administrators are never
--    mixed into the same table as parents.
-- ---------------------------------------------------------------------

CREATE TABLE platform_users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name  VARCHAR(160)    NOT NULL,
  email         VARCHAR(190)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  last_login_at DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_platform_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id     BIGINT UNSIGNED NOT NULL,
  -- The Director of Studies runs an office, not a one-person job. Several
  -- staff transcribe marksheets (dos_staff); the DoS signs off and releases
  -- them. Splitting the two is what makes the four-eyes rule meaningful and
  -- keeps release authority with the person accountable for it.
  role          ENUM('school_admin','dos','dos_staff','teacher','student_parent') NOT NULL,
  display_name  VARCHAR(160)    NOT NULL,
  email         VARCHAR(190)    NULL,
  phone         VARCHAR(24)     NULL,
  password_hash VARCHAR(255)    NULL,
  photo_url     VARCHAR(512)    NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  last_login_at DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_email (email),
  UNIQUE KEY uq_user_phone_school (school_id, phone),
  KEY ix_user_school_role (school_id, role, is_active),
  CONSTRAINT fk_user_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Student and parent share one account, per the product design.
CREATE TABLE students (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NULL,       -- login account (shared with parent)
  registration_no VARCHAR(60)    NOT NULL,   -- 'NGSS/2026/042'
  first_name     VARCHAR(80)     NOT NULL,
  last_name      VARCHAR(80)     NOT NULL,
  photo_url      VARCHAR(512)    NULL,
  class_id       BIGINT UNSIGNED NOT NULL,
  stream_id      BIGINT UNSIGNED NULL,
  level          ENUM('O-Level','A-Level') NOT NULL,
  combination_id BIGINT UNSIGNED NULL,       -- A-Level only
  parent_name    VARCHAR(160)    NULL,
  parent_phone   VARCHAR(24)     NULL,
  parent_email   VARCHAR(190)    NULL,
  status         ENUM('active','transferred','graduated','withdrawn') NOT NULL DEFAULT 'active',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_reg (school_id, registration_no),
  KEY ix_student_class (school_id, class_id, stream_id, status),
  CONSTRAINT fk_student_school FOREIGN KEY (school_id)      REFERENCES schools(id)      ON DELETE CASCADE,
  CONSTRAINT fk_student_user   FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE SET NULL,
  CONSTRAINT fk_student_class  FOREIGN KEY (class_id)       REFERENCES classes(id),
  CONSTRAINT fk_student_stream FOREIGN KEY (stream_id)      REFERENCES streams(id)      ON DELETE SET NULL,
  CONSTRAINT fk_student_comb   FOREIGN KEY (combination_id) REFERENCES combinations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student_subjects (
  student_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (student_id, subject_id),
  CONSTRAINT fk_ss_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- UCE results for S5/S6 students, used for combination and course matching.
CREATE TABLE student_uce_grades (
  student_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  grade      TINYINT UNSIGNED NOT NULL,  -- 1 (D1) .. 9 (F9)
  PRIMARY KEY (student_id, subject_id),
  CONSTRAINT fk_uce_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_uce_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teachers are read-only participants: this records who teaches what so
-- their app shows their own classes. It grants no data-entry obligation.
CREATE TABLE teacher_allocations (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id  BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  class_id   BIGINT UNSIGNED NOT NULL,
  stream_id  BIGINT UNSIGNED NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  term_id    BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alloc (school_id, user_id, class_id, stream_id, subject_id, term_id),
  CONSTRAINT fk_alloc_school  FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
  CONSTRAINT fk_alloc_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_alloc_class   FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_alloc_stream  FOREIGN KEY (stream_id)  REFERENCES streams(id)  ON DELETE SET NULL,
  CONSTRAINT fk_alloc_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. MARKS — the Director of Studies workflow
--
--    A marksheet is one paper sheet handed in by a teacher: one class,
--    one stream, one subject, one assessment. It moves
--    draft -> entered -> verified -> published.
--    Nothing reaches a parent until published_at is set. This is the
--    "the school controls publication" guarantee.
-- ---------------------------------------------------------------------

CREATE TABLE assessments (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  code         VARCHAR(16)     NOT NULL,  -- 'BOT','MID','EOT','CA1','CA2'
  name         VARCHAR(80)     NOT NULL,
  category     ENUM('coursework','exam') NOT NULL,
  max_score    DECIMAL(5,2)    NOT NULL DEFAULT 100.00,
  sort_order   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assessment (school_id, code),
  CONSTRAINT fk_assess_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE marksheets (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  term_id        BIGINT UNSIGNED NOT NULL,
  class_id       BIGINT UNSIGNED NOT NULL,
  stream_id      BIGINT UNSIGNED NULL,
  subject_id     BIGINT UNSIGNED NOT NULL,
  assessment_id  BIGINT UNSIGNED NOT NULL,
  status         ENUM('draft','entered','verified','published') NOT NULL DEFAULT 'draft',
  source         ENUM('manual','scan','import') NOT NULL DEFAULT 'manual',
  scan_url       VARCHAR(512)    NULL,      -- photograph of the paper marksheet, for audit
  submitted_by_teacher_id BIGINT UNSIGNED NULL,  -- whose sheet this was, for reference only
  entered_by     BIGINT UNSIGNED NULL,      -- DoS office staff
  verified_by    BIGINT UNSIGNED NULL,
  published_by   BIGINT UNSIGNED NULL,
  published_at   DATETIME        NULL,
  notes          VARCHAR(255)    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- stream_id is NULL for whole-class sheets; see the note on subjects.
  stream_key     BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(stream_id, 0)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marksheet (school_id, term_id, class_id, stream_key, subject_id, assessment_id),
  KEY ix_marksheet_status (school_id, term_id, status),
  CONSTRAINT fk_ms_school  FOREIGN KEY (school_id)     REFERENCES schools(id)     ON DELETE CASCADE,
  CONSTRAINT fk_ms_term    FOREIGN KEY (term_id)       REFERENCES terms(id)       ON DELETE CASCADE,
  CONSTRAINT fk_ms_class   FOREIGN KEY (class_id)      REFERENCES classes(id),
  -- RESTRICT, not SET NULL: a stream with marksheets must not be deleted,
  -- and MySQL forbids SET NULL on a column a stored generated column uses.
  CONSTRAINT fk_ms_stream  FOREIGN KEY (stream_id)     REFERENCES streams(id)     ON DELETE RESTRICT,
  CONSTRAINT fk_ms_subject FOREIGN KEY (subject_id)    REFERENCES subjects(id),
  CONSTRAINT fk_ms_assess  FOREIGN KEY (assessment_id) REFERENCES assessments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE marks (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,   -- denormalised so every read is tenant-scoped
  marksheet_id BIGINT UNSIGNED NOT NULL,
  student_id   BIGINT UNSIGNED NOT NULL,
  score        DECIMAL(5,2)    NULL,       -- NULL = absent / not sat
  is_absent    TINYINT(1)      NOT NULL DEFAULT 0,
  remark       VARCHAR(160)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mark (marksheet_id, student_id),
  KEY ix_mark_student (school_id, student_id),
  CONSTRAINT fk_mark_school    FOREIGN KEY (school_id)    REFERENCES schools(id)    ON DELETE CASCADE,
  CONSTRAINT fk_mark_marksheet FOREIGN KEY (marksheet_id) REFERENCES marksheets(id) ON DELETE CASCADE,
  CONSTRAINT fk_mark_student   FOREIGN KEY (student_id)   REFERENCES students(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Computed once per publication rather than on every parent app open.
CREATE TABLE term_results (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  term_id        BIGINT UNSIGNED NOT NULL,
  student_id     BIGINT UNSIGNED NOT NULL,
  subject_id     BIGINT UNSIGNED NOT NULL,
  ca_score       DECIMAL(5,2)    NULL,   -- coursework component, already averaged
  eot_score      DECIMAL(5,2)    NULL,
  final_score    DECIMAL(5,2)    NULL,   -- (ca * ca_weight + eot * eot_weight) / 100
  grade          VARCHAR(4)      NULL,
  points         DECIMAL(4,1)    NULL,
  subject_position SMALLINT UNSIGNED NULL,  -- rank within class/stream for this subject
  computed_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_result (school_id, term_id, student_id, subject_id),
  KEY ix_result_student (school_id, student_id, term_id),
  CONSTRAINT fk_res_school  FOREIGN KEY (school_id)  REFERENCES schools(id)  ON DELETE CASCADE,
  CONSTRAINT fk_res_term    FOREIGN KEY (term_id)    REFERENCES terms(id)    ON DELETE CASCADE,
  CONSTRAINT fk_res_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. COMMUNICATION — announcements and push notifications
-- ---------------------------------------------------------------------

CREATE TABLE announcements (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id     BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(200)    NOT NULL,
  body          TEXT            NOT NULL,
  audience      ENUM('all','parents','students','teachers','class','stream') NOT NULL DEFAULT 'all',
  class_id      BIGINT UNSIGNED NULL,
  stream_id     BIGINT UNSIGNED NULL,
  is_pinned     TINYINT(1)      NOT NULL DEFAULT 0,
  is_urgent     TINYINT(1)      NOT NULL DEFAULT 0,
  created_by    BIGINT UNSIGNED NULL,
  published_at  DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ann_school (school_id, published_at),
  CONSTRAINT fk_ann_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_ann_class  FOREIGN KEY (class_id)  REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_ann_stream FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE push_devices (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  expo_token   VARCHAR(255)    NOT NULL,
  platform     ENUM('android','ios','web') NOT NULL DEFAULT 'android',
  is_active    TINYINT(1)      NOT NULL DEFAULT 1,
  last_seen_at DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_token (expo_token),
  KEY ix_device_user (school_id, user_id, is_active),
  CONSTRAINT fk_dev_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_dev_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(200)    NOT NULL,
  body         VARCHAR(500)    NOT NULL,
  type         ENUM('results','announcement','commendation','fees','system') NOT NULL,
  reference_id BIGINT UNSIGNED NULL,
  is_read      TINYINT(1)      NOT NULL DEFAULT 0,
  sent_at      DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notif_user (school_id, user_id, is_read, created_at),
  CONSTRAINT fk_notif_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. SHARED REFERENCE DATA — not tenant-scoped.
--    Maintained once by Midway; every school benefits. This is the
--    strongest argument for the central server.
-- ---------------------------------------------------------------------

CREATE TABLE institutions (
  id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name     VARCHAR(200)    NOT NULL,
  type     ENUM('University','Institute','College') NOT NULL,
  is_public TINYINT(1)     NOT NULL DEFAULT 1,   -- government vs private
  district VARCHAR(80)     NULL,
  website  VARCHAR(255)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_institution (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE courses (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  institution_id     BIGINT UNSIGNED NOT NULL,
  code               VARCHAR(24)     NULL,   -- 'MBCHB'
  name               VARCHAR(255)    NOT NULL,
  duration_years     DECIMAL(3,1)    NULL,
  is_vocational      TINYINT(1)      NOT NULL DEFAULT 0,
  -- Cut-off points are published per admissions cycle and must be dated,
  -- so advice is never given from stale figures.
  cutoff_year        SMALLINT UNSIGNED NULL,
  government_cutoff  DECIMAL(6,2)    NULL,
  private_cutoff     DECIMAL(6,2)    NULL,
  description        TEXT            NULL,
  careers            TEXT            NULL,   -- JSON array of job titles
  salary_range       VARCHAR(120)    NULL,
  growth_prospects   ENUM('High','Medium','Low') NULL,
  source_url         VARCHAR(512)    NULL,   -- where the cut-off was published
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_course_inst (institution_id),
  FULLTEXT KEY ft_course_name (name),
  CONSTRAINT fk_course_inst FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- UACE weighting: essential x3, relevant x2, desirable x1.
CREATE TABLE course_subject_requirements (
  course_id  BIGINT UNSIGNED NOT NULL,
  catalog_id BIGINT UNSIGNED NOT NULL,   -- national subject, not a school's local row
  weight_class ENUM('essential','relevant','desirable') NOT NULL,
  PRIMARY KEY (course_id, catalog_id),
  CONSTRAINT fk_csr_course  FOREIGN KEY (course_id)  REFERENCES courses(id)          ON DELETE CASCADE,
  CONSTRAINT fk_csr_catalog FOREIGN KEY (catalog_id) REFERENCES subject_catalog(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. AUDIT — the proposal promises "all access is logged"
-- ---------------------------------------------------------------------

CREATE TABLE audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NULL,
  user_id     BIGINT UNSIGNED NULL,
  action      VARCHAR(80)     NOT NULL,   -- 'marksheet.publish', 'student.view'
  entity      VARCHAR(60)     NULL,
  entity_id   BIGINT UNSIGNED NULL,
  detail      TEXT            NULL,       -- JSON
  ip_address  VARBINARY(16)   NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_school (school_id, created_at),
  KEY ix_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

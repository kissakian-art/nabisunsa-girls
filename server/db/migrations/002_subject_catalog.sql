-- =====================================================================
--  National subject catalogue — shared reference data, not tenant data.
--
--  Maintained once by Midway; every school is seeded from it at setup and
--  may then add, rename or retire its own subjects. This is the same
--  argument as the university cut-off points: the work is done once and
--  every tenant benefits, which is what justifies a central server.
--
--  Idempotent: re-running updates names without duplicating rows.
-- =====================================================================

INSERT INTO subject_catalog (code, name, level, category) VALUES
  -- Core, both levels
  ('ENG', 'English Language',        'Both',    'Language'),
  ('MTC', 'Mathematics',             'O-Level', 'Science'),
  ('KIS', 'Kiswahili',               'Both',    'Language'),

  -- Sciences
  ('PHY', 'Physics',                 'Both',    'Science'),
  ('CHE', 'Chemistry',               'Both',    'Science'),
  ('BIO', 'Biology',                 'Both',    'Science'),
  ('AGR', 'Agriculture',             'Both',    'Science'),

  -- A-Level mathematics
  ('MTH', 'Mathematics',             'A-Level', 'Science'),
  ('SUB', 'Subsidiary Mathematics',  'A-Level', 'Science'),

  -- Humanities
  ('HIS', 'History',                 'Both',    'Arts'),
  ('GEO', 'Geography',               'Both',    'Arts'),
  ('CRE', 'Christian Religious Education', 'Both', 'Arts'),
  ('IRE', 'Islamic Religious Education',   'Both', 'Arts'),
  ('LIT', 'Literature in English',   'Both',    'Language'),
  ('ECO', 'Economics',               'A-Level', 'Arts'),
  ('ENT', 'Entrepreneurship',        'Both',    'Arts'),
  ('FRE', 'French',                  'Both',    'Language'),
  ('GP',  'General Paper',           'A-Level', 'Arts'),

  -- Technical and vocational
  ('ICT', 'Information and Communications Technology', 'Both', 'Technical'),
  ('ART', 'Art and Design',          'Both',    'Technical'),
  ('WWK', 'Woodwork',                'O-Level', 'Technical'),
  ('MWK', 'Metalwork',               'O-Level', 'Technical'),
  ('TD',  'Technical Drawing',       'Both',    'Technical'),
  ('FN',  'Foods and Nutrition',     'Both',    'Vocational'),
  ('PE',  'Physical Education',      'Both',    'Vocational')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  level = VALUES(level),
  category = VALUES(category);
